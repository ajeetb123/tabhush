// Backend client for tier 3 (docs/08 BE-01, BE-05). Every call the user's install makes is
// written to a local log the user can read (PRIV-80). The backend host is TODO_Q26, so until it
// is decided the client reports itself as not configured and tier 3 stays unavailable.

import {
  API,
  isTodo,
  parseJudgeResponse,
  parseLabelResponse,
  solvePow,
  type Tier3JudgeResponse,
  type Tier3LabelResponse,
  type Tier3Request,
} from "@lockin/core";
import { db } from "./db";
import { getInternal, setInternal } from "./settings";

export class CapReached extends Error {}
export class BackendUnavailable extends Error {}

export function backendConfigured(): boolean {
  return !isTodo(API.BASE_URL);
}

function url(path: string): string {
  if (isTodo(API.BASE_URL)) throw new BackendUnavailable("backend host undecided (TODO_Q26)");
  return API.BASE_URL + path;
}

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

async function installToken(): Promise<string> {
  const s = await getInternal();
  if (s.installToken) return s.installToken;
  const chRes = await fetch(url(API.TOKEN_CHALLENGE), { method: "POST" });
  if (!chRes.ok) throw new BackendUnavailable(`challenge HTTP ${chRes.status}`);
  const { challenge, difficulty_bits } = (await chRes.json()) as { challenge: string; difficulty_bits: number };
  const nonce = solvePow(challenge, difficulty_bits);
  const res = await fetch(url(API.TOKEN), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ challenge, nonce }),
  });
  if (!res.ok) throw new BackendUnavailable(`token HTTP ${res.status}`);
  const { install_token } = (await res.json()) as { install_token: string };
  await setInternal({ installToken: install_token });
  return install_token;
}

async function post(req: Tier3Request): Promise<unknown> {
  // PRIV-80: the exact (already redacted) payload is logged locally before it is sent.
  await db.add("tier3log", { at: Date.now(), request: req });
  const token = await installToken();
  let res: Response;
  try {
    res = await fetch(url(API.TIER3), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(req),
    });
  } catch {
    throw new BackendUnavailable("network error");
  }
  if (res.status === 429) {
    await setInternal({ capReachedDay: utcDay(Date.now()) });
    throw new CapReached();
  }
  if (res.status === 401) await setInternal({ installToken: null });
  if (!res.ok) throw new BackendUnavailable(`tier 3 HTTP ${res.status}`);
  return res.json();
}

/** A response that fails the fixed schema is unsure (CLS-14). */
export async function judgeRemote(req: Tier3Request): Promise<Tier3JudgeResponse> {
  return parseJudgeResponse(await post(req)) ?? { verdict: "unsure", confidence: 0, category: "other" };
}

export async function inferLabelRemote(req: Tier3Request): Promise<Tier3LabelResponse | null> {
  return parseLabelResponse(await post(req));
}
