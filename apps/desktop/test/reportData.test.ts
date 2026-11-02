// Report math (UI-02, UI-04; Q-65).
import { describe, expect, it } from "vitest";
import { dayReport, dayStart, focusSplit, formatHm, offClockMs, sessionTimeline, siteBreakdown, weekReport, type SessionLike } from "../src/renderer/reportData";

const H = 3_600_000;
const M = 60_000;
const day = new Date(2026, 10, 2, 0, 0, 0).getTime(); // Nov 2 local midnight
const at = (h: number, m = 0) => day + h * H + m * M;

function sess(id: string, label: string, from: number, to: number | null, extra: Partial<SessionLike> = {}): SessionLike {
  return { id, taskIds: [label], taskLabel: label, committedAt: from, endedAt: to, goalMin: 45, endKind: "normal", blockEvents: [], focusLog: [{ at: from, state: "on" }, ...(to ? [{ at: to, state: "away" as const }] : [])], ...extra };
}

describe("report", () => {
  it("a day runs 4am to 4am (TIME-04)", () => {
    expect(new Date(dayStart(at(1))).getHours()).toBe(4);
    expect(dayStart(at(1))).toBe(dayStart(at(-20)));
    expect(dayStart(at(23))).toBe(at(4));
  });

  it("splits on, off and away time from the focus log", () => {
    const s = sess("a", "Lab", at(10), at(11), { focusLog: [{ at: at(10), state: "on" }, { at: at(10, 30), state: "off" }, { at: at(10, 40), state: "away" }, { at: at(10, 50), state: "on" }, { at: at(11), state: "away" }] });
    expect(focusSplit(s, at(12))).toEqual({ on: 40 * M, other: 0, off: 10 * M, away: 10 * M });
  });

  it("Today: focused time, focus % without the outside-browser bucket, rows by task, blocks", () => {
    const a = sess("a", "Lab report", at(9), at(11), { blockEvents: [{ at: at(15), domain: "youtube.com" }] });
    const b = sess("b", "Internship work", at(14), at(15), {
      focusLog: [{ at: at(14), state: "on" }, { at: at(14, 30), state: "off" }, { at: at(15), state: "away" }],
      blockEvents: [{ at: at(15, 30), domain: "youtube.com" }, { at: at(16), domain: "netflix.com" }],
    });
    const r = dayReport([a, b], at(20));
    expect(formatHm(r.focusedMs)).toBe("2h 30m");
    expect(r.focusPct).toBe(83); // 150 on / 180 on+off
    expect(r.blocked).toBe(3);
    expect(r.rows.map((x) => x.label)).toEqual(["Lab report", "Internship work"]);
    expect(r.insight).toBe("You reached for youtube.com 2 times, mostly in the afternoon. Your longest block was in the morning.");
  });

  it("strip is 9am-9pm, widened to cover sessions outside it (Q-46)", () => {
    const r = dayReport([sess("a", "Late", at(22), at(23, 30))], at(23, 45));
    expect(new Date(r.strip.startMs).getHours()).toBe(9);
    expect(r.strip.endMs).toBe(at(24));
  });

  it("an 11pm-1am session stays on one day (TIME-04)", () => {
    const r = dayReport([sess("a", "Night", at(23), at(25))], at(25, 30));
    expect(formatHm(r.focusedMs)).toBe("2h 00m");
  });

  it("Week sums the last 7 days and names the best time", () => {
    const w = weekReport([sess("a", "Lab", at(9), at(10)), sess("b", "Lab", at(9) - 2 * 24 * H, at(11) - 2 * 24 * H)], at(20));
    expect(w.days).toHaveLength(7);
    expect(formatHm(w.totalMs)).toBe("3h 00m");
    expect(w.insight).toMatch(/^You focus best in the morning\./);
  });

  it("an empty day says so", () => {
    expect(dayReport([], at(12)).insight).toBe("No sessions yet today. Hit Start when you’re ready.");
  });

  it("Q-69: time per site and page, on task and off, most time first", () => {
    const s = sess("x", "CS 2114", at(14), at(15), {
      focusLog: [
        { at: at(14), state: "on", domain: "docs.google.com", title: "HW3 draft" },
        { at: at(14, 20), state: "on", domain: "stackoverflow.com", title: "Java generics" },
        { at: at(14, 30), state: "on", domain: "docs.google.com", title: "HW3 draft" },
        { at: at(14, 40), state: "off", domain: "reddit.com", title: "r/nba" },
        { at: at(14, 45), state: "away" },
        { at: at(14, 50), state: "on", domain: "docs.google.com", title: "HW3 notes" },
        { at: at(15), state: "away" },
      ],
    });
    const sites = siteBreakdown(s, at(16));
    expect(sites.map((x) => [x.domain, x.kind === "on", x.ms / M])).toEqual([
      ["docs.google.com", true, 40],
      ["stackoverflow.com", true, 10],
      ["reddit.com", false, 5],
    ]);
    expect(sites[0]!.pages).toEqual([
      { title: "HW3 draft", ms: 30 * M },
      { title: "HW3 notes", ms: 10 * M },
    ]);
    const tl = sessionTimeline(s, at(16));
    expect(tl.map((t) => [t.state, t.domain, (t.to - t.from) / M])).toEqual([
      ["on", "docs.google.com", 20],
      ["on", "stackoverflow.com", 10],
      ["on", "docs.google.com", 10],
      ["off", "reddit.com", 5],
      ["away", null, 5],
      ["on", "docs.google.com", 10],
    ]);
  });

  it("Q-69: breaks and pauses are off the clock; a running one counts up to now", () => {
    expect(offClockMs({ breaks: [{ startedAt: at(14), endedAt: at(14, 5) }], pauses: [{ startedAt: at(15), endedAt: null }] }, at(15, 10))).toBe(15 * M);
  });

  it("Q-72: side work counts as focused and lands on its own task's row", () => {
    const s = sess("x", "CS 2114", at(14), at(15), {
      focusLog: [
        { at: at(14), state: "on", domain: "docs.google.com" },
        { at: at(14, 30), state: "other", task: "Resume tailoring", domain: "docs.google.com" },
        { at: at(14, 50), state: "off", domain: "reddit.com" },
        { at: at(15), state: "away" },
      ],
    });
    const r = dayReport([s], at(16));
    expect(r.focusedMs).toBe(50 * M);
    expect(r.focusPct).toBe(83);
    const rows = Object.fromEntries(r.rows.map((x) => [x.label, [x.onMs / M, x.sessions, x.sideMs / M]]));
    expect(rows).toEqual({ "CS 2114": [30, 1, 0], "Resume tailoring": [20, 0, 20] });
    expect(focusSplit(s, at(16))).toEqual({ on: 30 * M, other: 20 * M, off: 10 * M, away: 0 });
  });
});
