// The link to the OS helper (system.ts) under failure: missing binary, crashes, silence, noise.
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HelperSystem } from "../src/main/system";

const script = join(__dirname, "fixtures/fake-helper.mjs");
const env = () => ({ idleSeconds: () => 0, notify: () => undefined, log: () => undefined });
const helper = (mode: string) => new HelperSystem(process.execPath, [script, mode], env());

describe("HelperSystem (edge cases)", () => {
  it("answers normally", async () => {
    const h = helper("ok");
    expect((await h.front()).app?.bundleId).toBe("com.microsoft.VSCode");
    expect(await h.quit("x")).toBe(true);
    h.stop();
  });

  it("ignores junk lines and stderr noise around replies", async () => {
    const h = helper("noisy");
    expect((await h.front()).app?.name).toBe("Code");
    h.stop();
  });

  it("reads a reply that starts with a byte-order mark", async () => {
    const h = helper("bom");
    expect((await h.front()).title).toBe("t");
    h.stop();
  });

  it("a missing helper never throws: calls just come back empty", async () => {
    const h = new HelperSystem("/nonexistent/tabhush-helper", [], env());
    const errors: unknown[] = [];
    const onErr = (e: unknown) => errors.push(e);
    process.on("uncaughtException", onErr);
    try {
      expect(await h.front()).toEqual({ app: null, title: "" });
      expect(await h.apps()).toEqual([]);
      expect(await h.quit("x")).toBe(false);
      await new Promise((r) => setTimeout(r, 100));
      expect(errors).toEqual([]);
      expect(h.lastError).toMatch(/didn't start|ENOENT/);
    } finally {
      process.off("uncaughtException", onErr);
    }
  });

  it("a helper that crashes resolves pending calls and backs off instead of respawning every poll", async () => {
    const h = helper("crash");
    expect(await h.front()).toEqual({ app: null, title: "" });
    const t0 = Date.now();
    expect(await h.front()).toEqual({ app: null, title: "" });
    expect(Date.now() - t0).toBeLessThan(1000); // backed off: no new process, no 4 s wait
  });

  it("a helper that never answers times out", async () => {
    const h = helper("silent");
    const t0 = Date.now();
    expect(await h.closeFrontTab("x", "y")).toBe(false);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(3900);
    h.stop();
  }, 10_000);
});
