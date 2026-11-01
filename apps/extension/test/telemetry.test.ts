// PRIV-30 / INV-19: the client builds only allowlisted payloads of counts.
import { describe, expect, it, vi } from "vitest";
import { parseTelemetry } from "@lockin/core";

const storage: Record<string, unknown> = {};
vi.stubGlobal("chrome", {
  storage: {
    local: {
      get: async (k: string) => (k in storage ? { [k]: storage[k] } : {}),
      set: async (o: Record<string, unknown>) => void Object.assign(storage, o),
    },
  },
  runtime: { getPlatformInfo: async () => ({ os: "mac" }) },
});

describe("telemetry payload", () => {
  it("is valid against the backend allowlist and holds counts only", async () => {
    const { buildPayload } = await import("../src/background/telemetry");
    const { bump } = await import("../src/background/settings");
    await bump("parks", 3);
    const p = await buildPayload();
    expect(parseTelemetry(p)).not.toBeNull();
    expect(p!.counts.parks).toBe(3);
    expect(JSON.stringify(p)).not.toMatch(/https?:|\.com|title/);
  });
  it("is not sent while the backend host is undecided (Q-26)", async () => {
    const { sendTelemetry } = await import("../src/background/telemetry");
    const f = vi.fn();
    expect(await sendTelemetry(f as unknown as typeof fetch)).toBe("skipped");
    expect(f).not.toHaveBeenCalled();
  });
});
