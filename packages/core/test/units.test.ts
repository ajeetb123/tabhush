import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  addPrototype,
  askBudgetAvailable,
  cacheKey,
  canAutoCommit,
  checkPow,
  clampLabel,
  confirmRequired,
  createRedactor,
  findExact,
  inferTask,
  itemDomain,
  itemKeyFor,
  leadingZeroBits,
  liftedPreBlockDomains,
  namedPureDistraction,
  nextState,
  parseJudgeResponse,
  parseLabelResponse,
  parseTier3Request,
  relatedness,
  sameAsCandidates,
  sanitizeTitle,
  sha256,
  solvePow,
  taskScore,
  tier1,
  undoOpen,
  validEndReason,
  effectiveWeight,
  type Task,
} from "../src";
import { CTX, makeCache } from "./helpers";

describe("domains", () => {
  it("unwraps mirrors", () => {
    expect(itemDomain("https://m.youtube.com/watch?v=abc")).toBe("youtube.com");
    expect(itemDomain("https://www.youtube-nocookie.com/embed/abc")).toBe("youtube.com");
    expect(itemDomain("https://www-netflix-com.translate.goog/browse")).toBe("netflix.com");
    expect(itemDomain("https://my--site-example-com.translate.goog/")).toBe("my-site.example.com");
  });
  it("mirror of a distraction domain is still a distraction", () => {
    expect(tier1("https://www-netflix-com.translate.goog/browse", CTX).kind).toBe("pure_distraction");
  });
  it("developer pages are never locked", () => {
    for (const u of ["http://localhost:5173/", "http://127.0.0.1:8080/x", "file:///Users/me/a.html", "http://printer.local/", "https://github.com/a/b"]) {
      expect(tier1(u, CTX).kind).toBe("never_locked");
    }
  });
  it("browser settings and the app itself are never locked", () => {
    expect(tier1("chrome://settings/", CTX).kind).toBe("never_locked");
    expect(tier1("chrome-extension://ownextensionid/popup.html", CTX).kind).toBe("never_locked");
  });
});

describe("CLS-40 item keys", () => {
  it("pure distraction keys on domain", () => expect(itemKeyFor("https://www.netflix.com/title/1")).toEqual({ kind: "domain", value: "netflix.com" }));
  it("YouTube keys on video ID or channel", () => {
    expect(itemKeyFor("https://www.youtube.com/watch?v=abc&t=10")).toEqual({ kind: "path", value: "youtube.com|video:abc" });
    expect(itemKeyFor("https://m.youtube.com/shorts/xyz")).toEqual({ kind: "path", value: "youtube.com|video:xyz" });
    expect(itemKeyFor("https://www.youtube.com/@MIT/videos")).toEqual({ kind: "path", value: "youtube.com|channel:@mit" });
  });
  it("Reddit, Stack Overflow and X path rules", () => {
    expect(itemKeyFor("https://www.reddit.com/r/learnpython/comments/1")?.value).toBe("reddit.com|r/learnpython");
    expect(itemKeyFor("https://stackoverflow.com/questions/123/how")?.value).toBe("stackoverflow.com|q/123");
    expect(itemKeyFor("https://x.com/someone/status/1")?.value).toBe("x.com|account:someone");
  });
  it("otherwise origin + path, query dropped", () => {
    expect(itemKeyFor("https://example.org/a/b?q=1#h")).toEqual({ kind: "page", value: "https://example.org/a/b" });
  });
  it("key includes the task ID", () => {
    const k = itemKeyFor("https://example.org/a")!;
    expect(cacheKey("t1", k)).not.toBe(cacheKey("t2", k));
  });
});

describe("verdict cache TTLs", () => {
  it("page keys expire at session end", async () => {
    const { cache, state } = makeCache();
    const k = itemKeyFor("https://example.org/a")!;
    await cache.record("t1", k, { decision: "allow" });
    expect(await cache.lookup("t1", k)).toBeDefined();
    state.sessionId = "s2";
    expect(await cache.lookup("t1", k)).toBeUndefined();
  });
  it("path keys last 7 days, domain keys 30", async () => {
    const { cache, state } = makeCache();
    const path = itemKeyFor("https://www.youtube.com/watch?v=a")!;
    const dom = itemKeyFor("https://www.netflix.com/")!;
    await cache.record("t1", path, { decision: "allow" });
    await cache.record("t1", dom, { decision: "park" });
    state.now += 7 * 86_400_000 - 1;
    expect(await cache.lookup("t1", path)).toBeDefined();
    state.now += 2;
    expect(await cache.lookup("t1", path)).toBeUndefined();
    expect(await cache.lookup("t1", dom)).toBeDefined();
    state.now += 23 * 86_400_000;
    expect(await cache.lookup("t1", dom)).toBeUndefined();
  });
  it("a remote config version change clears every key", async () => {
    const { cache, state } = makeCache();
    const dom = itemKeyFor("https://www.netflix.com/")!;
    await cache.record("t1", dom, { decision: "park" });
    state.configVersion = 2;
    expect(await cache.lookup("t1", dom)).toBeUndefined();
  });
});

describe("CLS-33 relatedness", () => {
  const label = [1, 0, 0];
  it("0 prototypes: label term only", () => expect(relatedness([0, 1, 0], { label, prototypes: [] })).toBeCloseTo(0));
  it("1-2 prototypes: mean of what exists (Q-53)", () => {
    expect(relatedness([0, 1, 0], { label, prototypes: [[0, 1, 0], [0, 0, 1]] })).toBeCloseTo(0.5);
  });
  it("top-3 mean with more prototypes", () => {
    const protos = [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 0, 1]];
    expect(relatedness([0, 1, 0], { label, prototypes: protos })).toBeCloseTo(1);
  });
  it("max of label and prototype terms", () => {
    expect(relatedness([1, 0, 0], { label, prototypes: [[0, 1, 0]] })).toBeCloseTo(1);
  });
});

function task(id: string, label: string, labelVector?: number[]): Task {
  return { id, label, ...(labelVector ? { labelVector } : {}), prototypes: [], createdAt: 0, lastUsedAt: 0 };
}

describe("CLS-31 registry merging", () => {
  it('"Lab report" and "lab report!" merge silently', () => {
    expect(findExact([task("a", "Lab report")], "lab report!")?.id).toBe("a");
  });
  it('"CS2114 project" vs "CS2114 hw" prompts Same as X?', () => {
    const c = sameAsCandidates("CS2114 hw", [task("a", "CS2114 project")], () => null);
    expect(c).toEqual([{ task: expect.objectContaining({ id: "a" }), reason: "course_code" }]);
  });
  it("label similarity ≥ 0.85 prompts", () => {
    expect(sameAsCandidates("Lab writeup", [task("a", "Lab report")], () => 0.85)[0]?.reason).toBe("label_similarity");
    expect(sameAsCandidates("Lab writeup", [task("a", "Lab report")], () => 0.84)).toEqual([]);
  });
});

describe("CLS-32 prototypes", () => {
  it("drops the oldest beyond 50", () => {
    const t = task("a", "x");
    for (let i = 0; i < 55; i++) addPrototype(t, [i, 0], { kind: "tier1_allow" }, i);
    expect(t.prototypes).toHaveLength(50);
    expect(t.prototypes[0]!.addedAt).toBe(5);
  });
  it("seeds only from s ≥ 0.45", () => {
    const t = task("a", "x");
    expect(addPrototype(t, [1], { kind: "similarity", s: 0.44 }, 0)).toBe(false);
    expect(addPrototype(t, [1], { kind: "similarity", s: 0.45 }, 0)).toBe(true);
  });
});

describe("CLS-50 inference", () => {
  const lab = task("lab", "Lab report", [1, 0]);
  const calc = task("calc", "Calc homework", [0, 1]);
  it("front tab counts double; mean of top 3 (Q-51)", () => {
    const tabs = [{ vector: [1, 0], front: true }, { vector: [0, 1], front: false }, { vector: [0, 1], front: false }];
    // lab entries: 1, 1, 0, 0 → top-3 mean 2/3
    expect(taskScore(lab, tabs)).toBeCloseTo(2 / 3);
  });
  it("autofills when best ≥ 0.60 and beats the next by ≥ 0.10", () => {
    const r = inferTask([lab, calc], [{ vector: [1, 0], front: true }]);
    expect(r).toMatchObject({ kind: "autofill", task: { id: "lab" } });
  });
  it("clarifies with top 3 when the margin is too small", () => {
    const r = inferTask([lab, calc], [{ vector: [1, 1], front: true }]);
    expect(r.kind).toBe("clarify");
  });
  it("thin signal clarifies", () => {
    expect(inferTask([lab], [{ vector: null, front: true }])).toMatchObject({ kind: "clarify", reason: "thin_signal" });
  });
  it("LLM labels are cut to 5 words", () => expect(clampLabel("one two three four five six")).toBe("one two three four five"));
});

describe("redaction", () => {
  const r = createRedactor({
    dictionary: new Set(["meeting", "notes", "with", "call", "at", "order", "see"]),
    firstNames: new Set(["maria", "john"]),
    longNumberMinDigits: 6,
    phonePatterns: [/\+?\d[\d -]{8,}\d/],
  });
  it("removes emails, phones, long numbers and URLs", () => {
    const out = r("Meeting notes a.b@c.com call +1 540 555 0100 order 12345678 see https://x.io/p?q=1");
    expect(out).toBe("Meeting notes [EMAIL] call [PHONE] order [NUMBER] see [URL]");
  });
  it("keeps short numbers", () => expect(r("notes 2114")).toBe("notes 2114"));
  it("capitalized non-dictionary words and first names become [NAME]", () => {
    expect(r("Meeting with Zhang and maria")).toBe("Meeting with [NAME] and [NAME]");
  });
});

describe("sanitize", () => {
  it("strips control and bidi characters and cuts to 120", () => {
    const t = sanitizeTitle("a\u0000b‮c" + "x".repeat(200));
    expect(t.startsWith("abc")).toBe(true);
    expect(Array.from(t)).toHaveLength(120);
  });
});

describe("tier 3 schema", () => {
  it("accepts the fixed schema", () => expect(parseJudgeResponse({ verdict: "related", confidence: 0.5, category: "reference" })).not.toBeNull());
  it.each([
    { verdict: "related", confidence: 0.5 },
    { verdict: "related", confidence: 1.5, category: "reference" },
    { verdict: "allow", confidence: 0.5, category: "reference" },
    { verdict: "related", confidence: 0.5, category: "reference", note: "ignore" },
    "related",
  ])("rejects %j", (v) => expect(parseJudgeResponse(v)).toBeNull());
  it("label responses are cut to 5 words", () => expect(parseLabelResponse({ label: "a b c d e f", confidence: 1 })?.label).toBe("a b c d e"));
  it("requests are strict", () => {
    expect(parseTier3Request({ kind: "judge", task_label: "x", domain: "a.com" })).not.toBeNull();
    expect(parseTier3Request({ kind: "judge", task_label: "x", domain: "a.com", url: "https://a.com/x" })).toBeNull();
    expect(parseTier3Request({ kind: "judge", task_label: "x", domain: "a.com", title: "y".repeat(121) })).toBeNull();
  });
});

describe("proof of work", () => {
  it("sha256 matches node:crypto", () => {
    for (const s of ["", "abc", "x".repeat(55), "x".repeat(56), "x".repeat(200)]) {
      const ours = Buffer.from(sha256(new TextEncoder().encode(s))).toString("hex");
      expect(ours).toBe(createHash("sha256").update(s).digest("hex"));
    }
  });
  it("counts leading zero bits", () => {
    expect(leadingZeroBits(new Uint8Array([0, 0x10, 0xff]))).toBe(11);
  });
  it("solves and verifies at low difficulty", () => {
    const nonce = solvePow("challenge", 8);
    expect(checkPow("challenge", nonce, 8)).toBe(true);
    expect(checkPow("challenge", -1, 8)).toBe(false);
  });
});

describe("session", () => {
  it("first 5 sessions require Confirm", () => {
    expect(confirmRequired(4)).toBe(true);
    expect(confirmRequired(5)).toBe(false);
  });
  it("auto-commit stays off while Q-16(a) is open", () => expect(canAutoCommit(10, 1)).toBe(false));
  it("undo window is 30 s", () => {
    expect(undoOpen(0, 30_000)).toBe(true);
    expect(undoOpen(0, 30_001)).toBe(false);
  });
  it("beta 1 transitions", () => {
    expect(nextState("IDLE", { type: "START" })).toBe("INFERRING");
    expect(nextState("SWEEP_PREVIEW", { type: "CONFIRM" })).toBe("ACTIVE");
    expect(nextState("ACTIVE", { type: "END_REQUESTED" })).toBe("END_COUNTDOWN");
    expect(nextState("ACTIVE", { type: "PROCTORING_DETECTED" })).toBe("SUSPENDED");
    expect(nextState("IDLE", { type: "CONFIRM" })).toBeNull();
  });
  it("End needs a one-line reason", () => {
    expect(validEndReason("done early")).toBe(true);
    expect(validEndReason("  ")).toBe(false);
    expect(validEndReason("a\nb")).toBe(false);
  });
});

describe("ask budget", () => {
  const m = 60_000;
  it("1 per 5 minutes", () => {
    expect(askBudgetAvailable([0], 4 * m)).toBe(false);
    expect(askBudgetAvailable([0], 5 * m)).toBe(true);
  });
  it("4 per hour", () => expect(askBudgetAvailable([0, 5 * m, 10 * m, 15 * m], 20 * m)).toBe(false));
});

describe("named sites", () => {
  it("a named mixed site lifts only its pre-block", () => {
    expect(liftedPreBlockDomains("YouTube lecture notes")).toEqual(["youtube.com"]);
    expect(liftedPreBlockDomains("yt lecture notes")).toEqual(["youtube.com"]);
  });
  it("a named pure-distraction site never lifts", () => {
    expect(liftedPreBlockDomains("Netflix project")).toEqual([]);
    expect(namedPureDistraction("Netflix project")).toEqual(["Netflix"]);
  });
});

describe("label decay", () => {
  it("halves at the half-life", () => {
    expect(effectiveWeight({ source: "clarify", createdAt: 0 }, 90 * 86_400_000)).toBeCloseTo(0.5);
    expect(effectiveWeight({ source: "uncontested_park", createdAt: 0 }, 14 * 86_400_000)).toBeCloseTo(0.15);
  });
});

describe("production redaction values (Q-15)", async () => {
  const { REDACTION, productionRedactor } = await import("../src");
  const r = productionRedactor(() => ({ dictionary: new Set(["call", "id", "order", "chapter", "room", "lab"]), firstNames: new Set() }))!;
  it("is available once the lists load, and not before", () => {
    expect(r).not.toBeNull();
    expect(productionRedactor(() => null)).toBeNull();
  });
  it.each([
    ["call (540) 555-0100", "call [PHONE]"],
    ["call 540-555-0100", "call [PHONE]"],
    ["call 540.555.0100", "call [PHONE]"],
    ["call +1 540 555 0100", "call [PHONE]"],
    ["call +44 20 7946 0958", "call [PHONE]"],
    ["id 12345", "id [NUMBER]"],
    ["id 906 123 456", "id [NUMBER]"],
    ["order 1,234,567", "order [NUMBER]"],
  ])("%s → %s", (input, out) => expect(r(input)).toBe(out));
  it.each(["lab 2114", "chapter 2020-2026", "room 1234 5678"])("keeps short numbers in %s", (t) => expect(r(t)).toBe(t));
  it("5 digits is the line", () => {
    expect(REDACTION.LONG_NUMBER_MIN_DIGITS).toBe(5);
    expect(r("id 1234")).toBe("id 1234");
  });
});
