// QA-10: one automated test per INV-xx that the shared core owns. Extension- and backend-owned
// invariants are tested in apps/*/test/invariants.test.ts.
import { describe, expect, it } from "vitest";
import {
  ActiveMinuteCounter,
  assertLabelSource,
  buildJudgeRequest,
  buildOverrideRequest,
  createRedactor,
  isBail,
  itemKeyFor,
  parseTelemetry,
  emptyCounts,
  SHARED_PRIOR,
  needsConsentPrompt,
  tier3Available,
  type Tier3Gate,
} from "../src";
import { makeCache, run, UNRELATED_SURE } from "./helpers";

const redact = createRedactor({
  dictionary: new Set(["lab", "report", "for", "the", "chem", "notes", "inbox", "my", "is", "this", "page", "about"]),
  firstNames: new Set(["alice"]),
  longNumberMinDigits: 6,
  phonePatterns: [/\(\d{3}\) \d{3}-\d{4}/],
});

describe("INV-01 learning platforms are never parked", () => {
  const urls = ["https://canvas.instructure.com/courses/1/quizzes/2", "https://www.gradescope.com/courses/9", "https://piazza.com/class/x"];
  it.each(urls)("%s stays allowed even with tier 3 unrelated, memory unrelated and a cached park", async (url) => {
    const { cache } = makeCache();
    await cache.record("t1", itemKeyFor(url)!, { decision: "park" });
    const { decision, calls } = await run({ url, s: 0, memory: "unrelated", tier3: UNRELATED_SURE, cache });
    expect(decision.action).toBe("allow");
    expect(calls.tier3).toBe(0);
  });

  it("school-hosted canvas.vt.edu is never parked when known from school domains", async () => {
    const { decision } = await run({ url: "https://canvas.vt.edu/courses/1", s: 0, tier3: UNRELATED_SURE, ctx: { schoolCoursewareDomains: ["canvas.vt.edu"] } });
    expect(decision.action).toBe("allow");
  });

  it("school-hosted instance is never parked when the page fingerprint matches", async () => {
    const { decision } = await run({ url: "https://canvas.vt.edu/courses/1", s: 0, tier3: UNRELATED_SURE, ctx: { coursewareFingerprint: true } });
    expect(decision.action).toBe("allow");
  });
});

describe("INV-02 similarity alone never parks", () => {
  it("s = 0.10 with no tier 1 / memory / tier 3 signal is asked or allowed", async () => {
    for (const askBudget of [true, false]) {
      const { decision } = await run({ url: "https://example.org/x", s: 0.1, tier3: null, askBudget });
      expect(decision.action).not.toBe("park");
    }
  });
});

describe("INV-03 tier 3 never overrides tier 1 lists", () => {
  it("tier 3 is not consulted for never-locked items", async () => {
    const { decision, calls } = await run({ url: "http://localhost:3000/", s: 0, tier3: UNRELATED_SURE });
    expect(decision.action).toBe("allow");
    expect(calls.tier3).toBe(0);
  });
  it("tier 3 is not consulted for pure-distraction items", async () => {
    const { decision, calls } = await run({ url: "https://www.tiktok.com/@someone", s: 0.9, tier3: { verdict: "related", confidence: 1, category: "reference" } });
    expect(decision.action).toBe("park");
    expect(calls.tier3).toBe(0);
  });
});

describe("INV-04 the shared prior never parks", () => {
  it("is configured as nudge-only and has no input into the parking path", async () => {
    expect(SHARED_PRIOR.CAN_PARK).toBe(false);
    // The on-device path takes a category from the shipped list or cached tier 3 only;
    // without one, a low score cannot park.
    const { decision } = await run({ url: "https://example.org/x", s: 0.01, tier3: null, onDeviceParkingPath: true, onDeviceCategory: null });
    expect(decision.action).not.toBe("park");
  });
});

describe("INV-06 fail open", () => {
  it("backend failure allows and flags a new item", async () => {
    const { decision } = await run({ url: "https://example.org/x", s: 0.3, tier3: "throws" });
    expect(decision).toMatchObject({ action: "allow_and_flag", tier3Failed: true });
  });
  it("nothing already parked unlocks when the backend fails", async () => {
    const { cache } = makeCache();
    await cache.record("t1", itemKeyFor("https://example.org/x")!, { decision: "park" });
    const { decision } = await run({ url: "https://example.org/x", s: 0.3, tier3: "throws", cache });
    expect(decision.action).toBe("park");
  });
});

describe("INV-07 / INV-19 nothing but counts leaves in telemetry", () => {
  const base = { install_id: "123e4567-e89b-12d3-a456-426614174000", browser: "chrome", platform: "mac", daily_active: true, counts: emptyCounts(), chrome_builtin_ai_available: null };
  it("accepts the PRIV-30 allowlist", () => expect(parseTelemetry(base)).not.toBeNull());
  it.each(["url", "title", "domain", "keystrokes", "screenshot"])("rejects an extra %s field", (f) => {
    expect(parseTelemetry({ ...base, [f]: "x" })).toBeNull();
    expect(parseTelemetry({ ...base, counts: { ...base.counts, [f]: 1 } })).toBeNull();
  });
});

describe("INV-08 redaction runs before anything is sent", () => {
  it("redacts titles, task labels and sentences", () => {
    const ctx = { redact, domainOnlySetting: false };
    const req = buildOverrideRequest(ctx, "Lab report for Alice", "https://docs.example.com/d/1", "Chem notes alice@uni.edu (555) 123-4567 1234567", "this is for Zbigniew");
    expect(req!.task_label).toBe("Lab report for [NAME]");
    expect(req!.title).not.toMatch(/alice@uni\.edu|555|1234567/);
    expect(req!.title).toContain("[EMAIL]");
    expect(req!.sentence).toContain("[NAME]");
    expect(JSON.stringify(req)).not.toContain("docs.example.com/d/1");
  });
});

describe("INV-09 domain-only sites never send titles", () => {
  const ctx = { redact, domainOnlySetting: false };
  it.each(["https://mail.google.com/mail/u/0/#inbox", "https://discord.com/channels/1/2", "https://web.whatsapp.com/"])("%s", (url) => {
    const req = buildJudgeRequest(ctx, "Lab report", url, "Inbox (3) - secret subject line");
    expect(req).not.toHaveProperty("title");
  });
  it('"Domain only" setting drops titles everywhere', () => {
    const req = buildJudgeRequest({ redact, domainOnlySetting: true }, "Lab report", "https://example.org/a", "A title");
    expect(req).not.toHaveProperty("title");
  });
});

describe("INV-10 / INV-11 tier 3 gate", () => {
  const ok: Tier3Gate = { llmEnabled: true, consent: "granted", onDeviceOnlySetting: false, underDigitalConsentAge: false, providerZdrApproved: false, capReached: false, redactorReady: true, backendConfigured: true };
  it("is open only with everything granted", () => expect(tier3Available(ok)).toBe(true));
  it("INV-10: no call before explicit consent", () => expect(tier3Available({ ...ok, consent: "unknown" })).toBe(false));
  it("INV-10: declining consent means on-device only", () => expect(tier3Available({ ...ok, consent: "declined" })).toBe(false));
  it("INV-11: under the age of digital consent runs on-device only until ZDR", () => {
    expect(tier3Available({ ...ok, underDigitalConsentAge: true })).toBe(false);
    expect(tier3Available({ ...ok, underDigitalConsentAge: true, providerZdrApproved: true })).toBe(true);
  });
  it("INV-08: no call when redaction cannot run", () => expect(tier3Available({ ...ok, redactorReady: false })).toBe(false));
  it("Q-61: with the LLM switched off nothing is ever sent and no consent is asked", () => {
    expect(tier3Available({ ...ok, llmEnabled: false })).toBe(false);
    expect(needsConsentPrompt({ ...ok, llmEnabled: false, consent: "unknown" })).toBe(false);
  });
});

describe("INV-13 the model never learns from guesses or excuses", () => {
  it.each(["bail", "refused_override", "playback", "idle", "model_guess"])("refuses %s as a label", (src) => {
    expect(() => assertLabelSource(src)).toThrow(/INV-13/);
  });
  it("an override with no input events never qualifies (video playback only)", () => {
    const c = new ActiveMinuteCounter();
    for (let m = 0; m < 30; m++) c.addInputEvents(0, m * 60_000);
    expect(c.qualifiesForLabel()).toBe(false);
  });
  it("3 active minutes of ≥ 10 input events qualify", () => {
    const c = new ActiveMinuteCounter();
    for (let m = 0; m < 3; m++) c.addInputEvents(10, m * 60_000);
    expect(c.qualifiesForLabel()).toBe(true);
  });
  it("9 events a minute is not an active minute", () => {
    const c = new ActiveMinuteCounter();
    for (let m = 0; m < 10; m++) c.addInputEvents(9, m * 60_000);
    expect(c.qualifiesForLabel()).toBe(false);
  });
});

describe("INV-16 breaks are never bails", () => {
  it("a break right after a park is not a bail", () => expect(isBail("break", 1000, 999)).toBe(false));
  it("an early end within 2 minutes of a park is a bail", () => expect(isBail("end", 100_000, 0)).toBe(true));
  it("an early end after 2 minutes is not a bail", () => expect(isBail("end", 120_001, 0)).toBe(false));
});
