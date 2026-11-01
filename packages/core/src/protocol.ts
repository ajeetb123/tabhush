// Wire shapes shared by the extension and the backend (docs/08 BE-01, docs/06 PRIV-02/30).
// Validators are strict: anything outside the schema is rejected.

import { LLM, type Category, type Verdict } from "./constants";
import { clampLabel } from "./inference";

export type Tier3Kind = "judge" | "override" | "infer_label";

export interface Tier3Request {
  kind: Tier3Kind;
  task_label?: string; // redacted
  domain?: string;
  title?: string; // redacted, ≤120 chars, control chars stripped; omitted for domain-only
  sentence?: string; // redacted; override kind only
  front_titles?: string[]; // redacted; infer_label kind only
}

export interface Tier3JudgeResponse {
  verdict: Verdict;
  confidence: number;
  category: Category;
}

export interface Tier3LabelResponse {
  label: string;
  confidence: number;
}

export interface ApiError {
  error: { code: ApiErrorCode; message: string };
}

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "not_found"
  | "cap_reached"
  | "pow_invalid"
  | "upstream_failed"
  | "method_not_allowed"
  | "internal";

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function exactKeys(o: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): boolean {
  const keys = Object.keys(o);
  return keys.every((k) => allowed.includes(k)) && required.every((k) => keys.includes(k));
}

function isConfidence(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

/** CLS-14: a response failing the fixed schema is treated as unsure by the caller. */
export function parseJudgeResponse(v: unknown): Tier3JudgeResponse | null {
  if (!isObject(v) || !exactKeys(v, ["verdict", "confidence", "category"], ["verdict", "confidence", "category"])) return null;
  if (!(LLM.VERDICTS as readonly unknown[]).includes(v.verdict)) return null;
  if (!(LLM.CATEGORIES as readonly unknown[]).includes(v.category)) return null;
  if (!isConfidence(v.confidence)) return null;
  return { verdict: v.verdict as Verdict, confidence: v.confidence, category: v.category as Category };
}

export function parseLabelResponse(v: unknown): Tier3LabelResponse | null {
  if (!isObject(v) || !exactKeys(v, ["label", "confidence"], ["label", "confidence"])) return null;
  if (typeof v.label !== "string" || v.label.trim() === "" || !isConfidence(v.confidence)) return null;
  return { label: clampLabel(v.label), confidence: v.confidence };
}

export const UNSURE: Tier3JudgeResponse = { verdict: "unsure", confidence: 0, category: "other" };

const REQUEST_FIELDS: Record<Tier3Kind, { allowed: string[]; required: string[] }> = {
  judge: { allowed: ["kind", "task_label", "domain", "title"], required: ["kind", "task_label", "domain"] },
  override: { allowed: ["kind", "task_label", "domain", "title", "sentence"], required: ["kind", "task_label", "domain", "sentence"] },
  infer_label: { allowed: ["kind", "front_titles"], required: ["kind", "front_titles"] },
};

export function parseTier3Request(v: unknown): Tier3Request | null {
  if (!isObject(v) || typeof v.kind !== "string" || !(v.kind in REQUEST_FIELDS)) return null;
  const kind = v.kind as Tier3Kind;
  const spec = REQUEST_FIELDS[kind];
  if (!exactKeys(v, spec.allowed, spec.required)) return null;
  for (const k of ["task_label", "domain", "title", "sentence"] as const) {
    if (k in v && typeof v[k] !== "string") return null;
  }
  if (typeof v.title === "string" && Array.from(v.title).length > LLM.TITLE_MAX_CHARS) return null;
  if ("front_titles" in v) {
    if (!Array.isArray(v.front_titles) || !v.front_titles.every((t) => typeof t === "string" && Array.from(t).length <= LLM.TITLE_MAX_CHARS)) return null;
  }
  return v as unknown as Tier3Request;
}

// ───────────────────────── Telemetry (PRIV-30, exhaustive) ─────────────────────────
// No titles, URLs or domains (INV-19). Any new field needs docs/06 and the privacy policy first.

export const TELEMETRY_COUNT_FIELDS = [
  "sessions",
  "parks",
  "corrections",
  "refused_overrides",
  "bails",
  "passes",
  "sweep_undos",
  "chip_renames",
  "gaps",
  "limited_mode_seconds",
] as const;

export type TelemetryCounts = Record<(typeof TELEMETRY_COUNT_FIELDS)[number], number>;

export interface TelemetryPayload {
  install_id: string;
  browser: string;
  platform: string;
  daily_active: boolean;
  counts: TelemetryCounts;
  chrome_builtin_ai_available: boolean | null;
}

const TELEMETRY_FIELDS = ["install_id", "browser", "platform", "daily_active", "counts", "chrome_builtin_ai_available"];
const SHORT_TOKEN = /^[A-Za-z0-9 ._-]{1,32}$/;
const INSTALL_ID = /^[0-9a-f-]{36}$/;

export function parseTelemetry(v: unknown): TelemetryPayload | null {
  if (!isObject(v) || !exactKeys(v, TELEMETRY_FIELDS, TELEMETRY_FIELDS)) return null;
  if (typeof v.install_id !== "string" || !INSTALL_ID.test(v.install_id)) return null;
  if (typeof v.browser !== "string" || !SHORT_TOKEN.test(v.browser)) return null;
  if (typeof v.platform !== "string" || !SHORT_TOKEN.test(v.platform)) return null;
  if (typeof v.daily_active !== "boolean") return null;
  if (v.chrome_builtin_ai_available !== null && typeof v.chrome_builtin_ai_available !== "boolean") return null;
  const c = v.counts;
  if (!isObject(c) || !exactKeys(c, TELEMETRY_COUNT_FIELDS, TELEMETRY_COUNT_FIELDS)) return null;
  for (const k of TELEMETRY_COUNT_FIELDS) {
    const n = c[k];
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return null;
  }
  return v as unknown as TelemetryPayload;
}

export function emptyCounts(): TelemetryCounts {
  return Object.fromEntries(TELEMETRY_COUNT_FIELDS.map((k) => [k, 0])) as TelemetryCounts;
}
