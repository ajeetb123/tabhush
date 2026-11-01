// Basic telemetry (beta 1, docs/06 PRIV-30): one payload a day of counts only. No titles, URLs or
// domains (INV-19). The payload is checked against the same allowlist the backend enforces.

import { API, emptyCounts, MS, parseTelemetry, type TelemetryPayload } from "@lockin/core";
import { getInternal, setInternal } from "./settings";
import { backendConfigured } from "./tier3Client";

export const TELEMETRY_ALARM = "telemetry-daily";
export const TELEMETRY_PERIOD_MIN = MS.DAY / MS.MINUTE;

interface UaData {
  brands?: { brand: string }[];
}

function browserName(): string {
  const nav = navigator as Navigator & { userAgentData?: UaData; brave?: unknown };
  if (nav.brave) return "brave";
  const brands = nav.userAgentData?.brands?.map((b) => b.brand) ?? [];
  if (brands.includes("Microsoft Edge")) return "edge";
  if (brands.includes("Google Chrome")) return "chrome";
  return "chromium";
}

export async function buildPayload(): Promise<TelemetryPayload | null> {
  const internal = await getInternal();
  const { os } = await chrome.runtime.getPlatformInfo();
  const payload = {
    install_id: internal.installId,
    browser: browserName(),
    platform: os,
    daily_active: internal.telemetry.sessions > 0,
    counts: internal.telemetry,
    // CLS-16 availability check: the built-in model API is not verified for this build, so unknown.
    chrome_builtin_ai_available: null,
  };
  return parseTelemetry(payload);
}

export async function sendTelemetry(fetchImpl: typeof fetch = fetch): Promise<"sent" | "skipped" | "failed"> {
  if (!backendConfigured()) return "skipped"; // backend host is TODO_Q26
  const payload = await buildPayload();
  if (!payload) return "failed";
  try {
    const res = await fetchImpl(API.BASE_URL + API.TELEMETRY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return "failed";
  } catch {
    return "failed";
  }
  await setInternal({ telemetry: emptyCounts() });
  return "sent";
}
