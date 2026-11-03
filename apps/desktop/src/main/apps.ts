// What kind of app is in front (docs/11 DSK-10, Q-70). Browsers are judged page by page; other
// apps by these rules, in order. Unknown apps are allowed (INV-06 fail open, Q-63 "block only
// clear distractions"); their window title can still be blocked by topic (judge.ts).

import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { DESKTOP } from "@tabhush/core";
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
  if (has(DESKTOP.TOOL_CATEGORIES, category) || has(DESKTOP.TOOL_APPS, bundleId)) return "tool";
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
  return t.replace(/\s[-—–]\s(Mozilla Firefox|Google Chrome|Safari|Microsoft\u200B? Edge|Brave|Opera|Vivaldi)$/, "").trim();
}

// ───────────────────────── recognizing by looking (Q-74) ─────────────────────────

const gameCache = new Map<string, boolean>();

/**
 * Is this app a game? Decided from what it is, not its name: installed in a game store's library
 * (Steam, Epic, Riot, GOG, Xbox…), built as an Unreal shipping game, or carrying game-engine or
 * Steamworks files. `exists` is injectable for tests.
 */
export function looksLikeGame(path: string | undefined, exists: (p: string) => boolean = existsSync): boolean {
  if (!path) return false;
  const hit = gameCache.get(path);
  if (hit !== undefined) return hit;
  const norm = path.replace(/\\/g, "/");
  const lower = norm.toLowerCase();
  let game = DESKTOP.GAME_INSTALL_MARKERS.some((m) => lower.includes(m.toLowerCase())) || /-(win64|wingdk)-shipping\.exe$/i.test(norm);
  if (!game) {
    // macOS bundles keep libraries in Contents/…; Windows games keep them next to the .exe.
    const dirs = norm.endsWith(".app")
      ? ["Contents/Frameworks", "Contents/MacOS", "Contents/Plugins", "Contents/Resources/Data/Plugins"].map((d) => `${norm}/${d}`)
      : [dirname(norm), dirname(dirname(norm))];
    game = dirs.some((d) => DESKTOP.GAME_FILE_MARKERS.some((f) => exists(`${d}/${f}`)));
  }
  if (gameCache.size > 500) gameCache.clear();
  gameCache.set(path, game);
  return game;
}

const schoolHost = new RegExp(DESKTOP.SCHOOL_HOST_PATTERN, "i");

/**
 * Is this a school page (courseware, course site, school sign-in)? From its address (.edu and
 * similar school domains) or the site name a title ends with ("Homework 3 | PrairieLearn").
 * Replaces the hand-entered school sites list (TODO_Q10's page fingerprint, Q-74).
 */
export function isSchoolPage(host: string, title: string): boolean {
  const h = host.toLowerCase();
  if (DESKTOP.SCHOOL_HOST_SUFFIXES.some((s) => h.endsWith(s)) || schoolHost.test(h)) return true;
  const site = title.split(/\s[|–—-]\s/).pop()?.trim() ?? "";
  return title.includes(" ") && DESKTOP.SCHOOL_TITLE_MARKERS.some((m) => site === m || site.startsWith(`${m} `) || site.endsWith(` ${m}`));
}
