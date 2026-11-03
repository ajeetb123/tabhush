// Request handling for the v1 backend (docs/08). Paths: CONSTANTS.md API (Q-03).
// Beta 1 capabilities only: install tokens (BE-05), tier 3 proxy (BE-01), telemetry intake
// (BE-07), delete my data (BE-08). Remote config (beta 2), licenses (v1) and contributions are
// not built yet. Request bodies are never logged (INV-18).

import {
  AI_CAPS,
  API,
  checkPow,
  LLM,
  parseTelemetry,
  parseTier3Request,
  POW,
  type ApiErrorCode,
} from "@tabhush/core";
import { LlmUnavailable, runInferLabel, runJudge, type LlmTransport } from "./llm";
import type { Store } from "./store";

export interface Deps {
  store: Store;
  llm: LlmTransport;
  now: () => number;
  randomBytes: (n: number) => Uint8Array;
  sha256Hex: (text: string) => Promise<string>;
}

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  not_found: 404,
  method_not_allowed: 405,
  pow_invalid: 403,
  cap_reached: 429,
  upstream_failed: 502,
  internal: 500,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

export function apiError(code: ApiErrorCode, message: string): Response {
  return json({ error: { code, message } }, STATUS[code]);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}

async function issueChallenge(d: Deps): Promise<Response> {
  const challenge = hex(d.randomBytes(POW.CHALLENGE_BYTES));
  await d.store.putChallenge(challenge);
  return json({ challenge, difficulty_bits: POW.DIFFICULTY_BITS });
}

async function issueToken(d: Deps, req: Request): Promise<Response> {
  const body = await readJson(req);
  if (typeof body !== "object" || body === null) return apiError("bad_request", "expected {challenge, nonce}");
  const { challenge, nonce } = body as Record<string, unknown>;
  if (typeof challenge !== "string" || typeof nonce !== "number") return apiError("bad_request", "expected {challenge, nonce}");
  if (!checkPow(challenge, nonce)) return apiError("pow_invalid", "proof of work does not meet the difficulty");
  if (!(await d.store.consumeChallenge(challenge))) return apiError("pow_invalid", "unknown or used challenge");
  const token = base64url(d.randomBytes(POW.INSTALL_TOKEN_BYTES));
  await d.store.putInstall(await d.sha256Hex(token), d.now());
  return json({ install_token: token });
}

async function authorize(d: Deps, req: Request): Promise<string | null> {
  const m = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m?.[1]) return null;
  const hash = await d.sha256Hex(m[1]);
  return (await d.store.hasInstall(hash)) ? hash : null;
}

async function tier3(d: Deps, req: Request): Promise<Response> {
  // Q-61: the owner switched the LLM off; the proxy does not exist while LLM.ENABLED is false.
  if (!LLM.ENABLED) return apiError("not_found", "no such endpoint");
  // BE-02 order: 1. install token
  const install = await authorize(d, req);
  if (!install) return apiError("unauthorized", "missing or unknown install token");
  // 2. IP rate limits: values TODO_Q07, not enforced yet.
  const parsed = parseTier3Request(await readJson(req));
  if (!parsed) return apiError("bad_request", "request does not match the tier 3 schema");
  // 3. Per-install daily cap. Pro (300) needs license validation (v1), so every install is Free.
  const used = await d.store.incrementDailyUsage(install, utcDay(d.now()));
  if (used > AI_CAPS.FREE_PER_DAY) return apiError("cap_reached", "daily AI check cap reached");
  // 4. Waitlist waves and 5. global daily dollar limit: TODO_Q07.
  try {
    if (parsed.kind === "infer_label") {
      const label = await runInferLabel(d.llm, parsed);
      return label ? json(label) : apiError("upstream_failed", "no valid label");
    }
    return json(await runJudge(d.llm, parsed));
  } catch (e) {
    if (e instanceof LlmUnavailable) return apiError("upstream_failed", "tier 3 is not configured");
    return apiError("upstream_failed", "tier 3 call failed");
  }
}

async function telemetry(d: Deps, req: Request): Promise<Response> {
  const payload = parseTelemetry(await readJson(req));
  if (!payload) return apiError("bad_request", "payload does not match the telemetry allowlist");
  await d.store.putTelemetry(payload.install_id, utcDay(d.now()), payload);
  return json({ ok: true });
}

async function deleteMyData(d: Deps, req: Request): Promise<Response> {
  const body = await readJson(req);
  const id = typeof body === "object" && body !== null ? (body as Record<string, unknown>).install_id : undefined;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/.test(id)) return apiError("bad_request", "expected {install_id}");
  await d.store.deleteTelemetry(id);
  return json({ ok: true });
}

const ROUTES: Record<string, (d: Deps, req: Request) => Promise<Response>> = {
  [API.TOKEN_CHALLENGE]: (d) => issueChallenge(d),
  [API.TOKEN]: issueToken,
  [API.TIER3]: tier3,
  [API.TELEMETRY]: telemetry,
  [API.DELETE]: deleteMyData,
};

export async function handle(d: Deps, req: Request): Promise<Response> {
  const route = ROUTES[new URL(req.url).pathname];
  if (!route) return apiError("not_found", "no such endpoint");
  if (req.method !== "POST") return apiError("method_not_allowed", "use POST");
  try {
    return await route(d, req);
  } catch {
    // Never log the request or its body (INV-18).
    return apiError("internal", "internal error");
  }
}
