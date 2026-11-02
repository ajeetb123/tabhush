// What kind of app is in front (docs/11 DSK-10, Q-70). Browsers are judged page by page; other
// apps by these rules, in order. Unknown apps are allowed (INV-06 fail open, Q-63 "block only
// clear distractions"); their window title can still be blocked by topic (judge.ts).

import { DESKTOP } from "@lockin/core";
import type { AppInfo } from "./system";

export type AppKind = "system" | "browser" | "proctoring" | "tool" | "music" | "meeting" | "distraction" | "other";

const has = (list: readonly string[], v: string) => list.includes(v);

export function browserKind(bundleId: string): "chrome" | "safari" | "other" | null {
  return DESKTOP.BROWSERS[bundleId] ?? null;
}

export function appKind(app: Pick<AppInfo, "bundleId" | "name" | "category">, selfBundleId?: string): AppKind {
  const { bundleId, name } = app;
  const category = app.category ?? "";
  if (bundleId === selfBundleId || has(DESKTOP.SYSTEM_APPS, bundleId)) return "system";
  if (DESKTOP.PROCTORING_APP_NAMES.some((n) => name.includes(n))) return "proctoring";
  if (browserKind(bundleId)) return "browser";
  if (has(DESKTOP.ALWAYS_ALLOWED_APPS, bundleId)) return "tool";
  if (has(DESKTOP.MUSIC_APPS, bundleId)) return "music";
  if (has(DESKTOP.MEETING_APPS, bundleId)) return "meeting";
  if (has(DESKTOP.DISTRACTION_APPS, bundleId) || has(DESKTOP.DISTRACTION_APP_NAMES, name)) return "distraction";
  if (has(DESKTOP.DISTRACTION_CATEGORIES, category) || category.endsWith("-games")) return "distraction";
  if (has(DESKTOP.TOOL_CATEGORIES, category)) return "tool";
  return "other";
}

/** DSK-30: these apps never have their titles stored. */
export function titleExcluded(bundleId: string): boolean {
  return has(DESKTOP.EXCLUDED_APPS, bundleId);
}

/** Browser window titles end with the browser's name ("… - Google Chrome"); the report doesn't need it. */
export function stripBrowserSuffix(title: string, appName: string): string {
  const t = title.trim();
  for (const sep of [" - ", " — ", " – "]) {
    if (t.endsWith(`${sep}${appName}`)) return t.slice(0, -(sep.length + appName.length)).trim();
  }
  return t.replace(/\s[-—–]\s(Mozilla Firefox|Google Chrome|Safari)$/, "").trim();
}
