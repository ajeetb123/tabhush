// QA-11: table-driven tests for the CLS-04 decision procedure, every branch.
import { describe, expect, it } from "vitest";
import { itemKeyFor } from "../src";
import { makeCache, RELATED, run, UNRELATED_SURE, UNRELATED_WEAK, UNSURE_V, type Scenario } from "./helpers";

const OTHER = "https://example.org/some/page";

const table: [string, Scenario, string, string][] = [
  ["never-locked meeting", { url: "https://meet.google.com/abc", tier3: UNRELATED_SURE }, "allow", "never_locked"],
  ["essential", { url: "https://notes.example.com/x", ctx: { essentials: ["notes.example.com"] }, tier3: UNRELATED_SURE }, "allow", "essential"],
  ["accepted override this session", { url: "https://www.netflix.com/browse", overridden: true }, "allow", "override"],
  ["pure distraction", { url: "https://www.netflix.com/browse", tier3: RELATED }, "park", "distraction"],
  ["s ≥ 0.45 allows", { url: OTHER, s: 0.45 }, "allow", "similarity"],
  ["memory unrelated parks", { url: OTHER, s: 0.3, memory: "unrelated" }, "park", "memory"],
  ["memory related allows", { url: OTHER, s: 0.3, memory: "related" }, "allow", "memory"],
  ["tier 3 unrelated ≥ 0.80 parks", { url: OTHER, s: 0.3, tier3: UNRELATED_SURE }, "park", "tier3"],
  ["tier 3 unrelated < 0.80 asks", { url: OTHER, s: 0.3, tier3: UNRELATED_WEAK }, "ask", "ask"],
  ["tier 3 related allows at any confidence", { url: OTHER, s: 0.3, tier3: RELATED }, "allow", "tier3"],
  ["tier 3 unsure asks", { url: OTHER, s: 0.3, tier3: UNSURE_V }, "ask", "ask"],
  ["tier 3 unsure, over budget → allow and flag", { url: OTHER, s: 0.3, tier3: UNSURE_V, askBudget: false }, "allow_and_flag", "over_budget"],
  ["backend down fails open", { url: OTHER, s: 0.3, tier3: "throws" }, "allow_and_flag", "fail_open"],
  ["low s routes to tier 3 (Q-52 reference order)", { url: OTHER, s: 0.1, tier3: UNRELATED_SURE }, "park", "tier3"],
  ["no tier 3, middle → ask", { url: OTHER, s: 0.3, tier3: null }, "ask", "ask"],
  ["no tier 3, over budget → allow and flag", { url: OTHER, s: 0.3, tier3: null, askBudget: false }, "allow_and_flag", "over_budget"],
  [
    "on-device path parks low s + shipped category (CLS-21)",
    { url: OTHER, s: 0.1, tier3: null, onDeviceParkingPath: true, onDeviceCategory: "games" },
    "park",
    "on_device_path",
  ],
  [
    "on-device path needs a park category",
    { url: OTHER, s: 0.1, tier3: null, onDeviceParkingPath: true, onDeviceCategory: "reference" },
    "ask",
    "ask",
  ],
  [
    "on-device path needs s < 0.25",
    { url: OTHER, s: 0.3, tier3: null, onDeviceParkingPath: true, onDeviceCategory: "games" },
    "ask",
    "ask",
  ],
  [
    "on-device path never runs with no category (cap reached)",
    { url: OTHER, s: 0.1, tier3: null, onDeviceParkingPath: true, onDeviceCategory: null, askBudget: false },
    "allow_and_flag",
    "over_budget",
  ],
];

describe("CLS-04 judge", () => {
  it.each(table)("%s", async (_name, sc, action, source) => {
    const { decision } = await run(sc);
    expect(decision.action).toBe(action);
    expect(decision.source).toBe(source);
  });

  it("flipped order: low s skips tier 3", async () => {
    const { decision, calls } = await run({ url: OTHER, s: 0.1, tier3: UNRELATED_SURE, order: { LOW_S_TO_TIER3: false, TIER3_BEFORE_ASK: true } });
    expect(calls.tier3).toBe(0);
    expect(decision.action).toBe("ask");
  });

  it("flipped order: ask before tier 3 when budget allows", async () => {
    const { decision, calls } = await run({ url: OTHER, s: 0.3, tier3: UNRELATED_SURE, order: { LOW_S_TO_TIER3: true, TIER3_BEFORE_ASK: false } });
    expect(calls.tier3).toBe(0);
    expect(decision.action).toBe("ask");
  });

  it("calls tier 3 once per cache key", async () => {
    const { cache } = makeCache();
    await run({ url: OTHER, s: 0.3, tier3: UNSURE_V, cache });
    const second = await run({ url: OTHER, s: 0.3, tier3: UNSURE_V, cache });
    expect(second.calls.tier3).toBe(0);
    expect(second.decision.action).toBe("ask");
  });

  it("returns cached park without re-judging", async () => {
    const { cache } = makeCache();
    await cache.record("t1", itemKeyFor(OTHER)!, { decision: "park" });
    const { decision, calls } = await run({ url: OTHER, s: 0.9, cache });
    expect(decision).toEqual({ action: "park", source: "cache" });
    expect(calls.relatedness).toBe(0);
  });
});
