// QA-10: extension-owned invariants.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { manifest, SINGLE_PURPOSE } from "../manifest";
import { onUpdateAvailable } from "../src/background/updates";

const SRC = join(__dirname, "../src");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("INV-05 no remote code", () => {
  const sources = files(SRC).filter((f) => /\.(ts|html)$/.test(f));
  it.each(sources.map((f) => [f.slice(SRC.length)]))("%s has no eval, new Function or remote script", (rel) => {
    const src = readFileSync(join(SRC, rel), "utf8");
    expect(src).not.toMatch(/\bnew Function\s*\(|(^|[^.\w])eval\s*\(/);
    expect(src).not.toMatch(/<script[^>]+src=["']https?:/);
    expect(src).not.toMatch(/importScripts\(\s*["']https?:/);
  });
  it("CSP allows only bundled scripts and WASM", () => {
    expect(manifest.content_security_policy.extension_pages).toBe("script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
  });
  it("model loading is local only", () => {
    const off = readFileSync(join(SRC, "offscreen/offscreen.ts"), "utf8");
    expect(off).toMatch(/env\.allowRemoteModels = false/);
    expect(off).toMatch(/wasmPaths = \{ wasm:/);
  });
});

describe("INV-14 updates wait for the session to end", () => {
  it("defers during a session", async () => {
    const reload = vi.fn();
    const markPending = vi.fn(async () => undefined);
    expect(await onUpdateAvailable({ sessionInProgress: async () => true, markPending, reload })).toBe("deferred");
    expect(reload).not.toHaveBeenCalled();
    expect(markPending).toHaveBeenCalled();
  });
  it("applies right away with no session", async () => {
    const reload = vi.fn();
    expect(await onUpdateAvailable({ sessionInProgress: async () => false, markPending: async () => undefined, reload })).toBe("applied");
    expect(reload).toHaveBeenCalled();
  });
  it("End applies a pending update", () => {
    const engine = readFileSync(join(SRC, "background/engine.ts"), "utf8");
    expect(engine).toMatch(/if \(internal\.pendingUpdate\)[\s\S]{0,200}chrome\.runtime\.reload\(\)/);
  });
});

describe("EXT-01 / EXT-14 manifest", () => {
  it("is MV3 for Chromium 120+ with the verbatim single purpose", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe("120");
    expect(SINGLE_PURPOSE).toBe("Blocks sites unrelated to your current work session and tracks time spent on it.");
  });
  it("sets no keyboard shortcut of its own (undecided)", () => {
    expect(manifest.commands["start-session"]).not.toHaveProperty("suggested_key");
  });
});

describe("INV-15 / INV-20", () => {
  it.todo("INV-15 desktop quit is logged and never relaunched: the desktop app is v1.5");
  it.todo("INV-20 no dogfooding on Procedura or school systems: a process rule, not testable in code");
});
