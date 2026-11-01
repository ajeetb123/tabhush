import { describe, expect, it } from "vitest";
import { createRedactor, evaluateRedaction } from "../src";

const redact = createRedactor({
  dictionary: new Set(["notes", "from", "call", "with", "invoice", "meeting"]),
  firstNames: new Set(["sam"]),
  longNumberMinDigits: 6,
  phonePatterns: [/\+?\d[\d -]{8,}\d/],
});

describe("QA-21 scoring", () => {
  it("passes when names and patterns are removed", () => {
    const r = evaluateRedaction(redact, [
      { title: "Notes from Okonkwo", names: ["Okonkwo"], patterns: [] },
      { title: "Call with sam +1 540 555 0100", names: ["sam"], patterns: ["540 555 0100"] },
      { title: "Invoice 99887766 a@b.co", names: [], patterns: ["99887766", "a@b.co"] },
    ]);
    expect(r).toMatchObject({ names: 2, namesCaught: 2, nameRecall: 1, pass: true });
  });
  it("fails on any leaked pattern even with full name recall", () => {
    const leaky = (t: string) => t;
    const r = evaluateRedaction(leaky, [{ title: "mail a@b.co", names: [], patterns: ["a@b.co"] }]);
    expect(r.pass).toBe(false);
    expect(r.patternMisses).toHaveLength(1);
  });
  it("fails below 95% name recall", () => {
    const r = evaluateRedaction((t) => t, [{ title: "Meeting with Zed", names: ["Zed"], patterns: [] }]);
    expect(r.nameRecall).toBe(0);
    expect(r.pass).toBe(false);
  });
});
