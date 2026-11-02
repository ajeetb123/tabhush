// Stand-ins for the macOS layer, the embedder and the clock, so the engine can be driven end to
// end in tests without touching real apps.

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppInfo, BrowserTab, FrontInfo, System } from "../src/main/system";

export class FakeSystem implements System {
  frontNow: FrontInfo = { app: null, title: "" };
  running: AppInfo[] = [];
  openTabs: BrowserTab[] = [];
  idle = 0;
  trusted = true;
  volumes: Record<string, number> = { "com.spotify.client": 80 };
  quits: string[] = [];
  hides: string[] = [];
  closed: { bundleId: string; urls: string[] }[] = [];
  frontClosed: string[] = [];
  notes: string[] = [];

  async front() {
    return structuredClone(this.frontNow);
  }
  async apps() {
    return structuredClone(this.running);
  }
  async tabs() {
    return structuredClone(this.openTabs);
  }
  async closeTabs(bundleId: string, urls: string[]) {
    this.closed.push({ bundleId, urls });
    const before = this.openTabs.length;
    this.openTabs = this.openTabs.filter((t) => !(t.bundleId === bundleId && urls.includes(t.url)));
    return before - this.openTabs.length || urls.length;
  }
  async closeFrontTab(bundleId: string, title: string) {
    this.frontClosed.push(`${bundleId}|${title}`);
    return true;
  }
  async quit(bundleId: string) {
    this.quits.push(bundleId);
    return true;
  }
  async hide(bundleId: string) {
    this.hides.push(bundleId);
    return true;
  }
  async setVolume(bundleId: string, level: number) {
    if (!(bundleId in this.volumes)) return null;
    const prev = this.volumes[bundleId]!;
    this.volumes[bundleId] = level;
    return prev;
  }
  async accessibilityTrusted() {
    return this.trusted;
  }
  idleSeconds() {
    return this.idle;
  }
  notify(title: string) {
    this.notes.push(title);
  }
}

export const app = (name: string, bundleId: string, category = ""): AppInfo => ({ name, bundleId, pid: 1, category, regular: true });
export const CHROME = app("Google Chrome", "com.google.Chrome");
export const FIREFOX = app("Firefox", "org.mozilla.firefox");

export function chromeTab(url: string, title: string): FrontInfo {
  return { app: CHROME, title: `${title} - Google Chrome`, url, tabTitle: title };
}

/**
 * Deterministic stand-in for the MiniLM embedder: bag of lowercase words hashed into a few
 * dimensions, so items that share words with the task label score high.
 */
export function fakeEmbed(texts: string[]): number[][] {
  const DIMS = 512;
  return texts.map((t) => {
    const v = new Array<number>(DIMS).fill(0);
    for (const w of t.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2)) {
      let hsh = 0;
      for (const c of w) hsh = (hsh * 31 + c.charCodeAt(0)) >>> 0;
      v[hsh % DIMS]! += 1;
    }
    const n = Math.hypot(...v) || 1;
    return v.map((x) => x / n);
  });
}

export function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** A tiny category folder: one games domain and one warez domain. */
export function categoriesDir(): string {
  const dir = tempDir("cats-");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "games.txt"), "arcade.example.com\n");
  writeFileSync(join(dir, "underground.txt"), "pirate-example.to\n");
  writeFileSync(join(dir, "banking.txt"), "mybank.example.com\n");
  return dir;
}

export class Clock {
  constructor(public t = new Date(2026, 10, 2, 14, 0, 0).getTime()) {}
  now = () => this.t;
  advance(ms: number): void {
    this.t += ms;
  }
}
