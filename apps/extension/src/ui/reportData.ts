// Numbers for the report (UI-02 Today, UI-04 Week and Sessions; built early per Q-65).
// Pure functions over saved sessions, so they can be tested without a browser.
//   Day: 4am to 4am local (TIME-04).
//   Focused time: time the front tab was on task. Time with the browser out of front is the
//   "outside the browser" bucket and is excluded from focus % (TIME-01).
//   Strip range: 9am to 9pm, widened to cover any session outside it (Q-46, Q-65).
//   Insight: the most-blocked site and when, plus when the longest session ran (Q-21, Q-65).

import { ACTIVE_TIME, MS, REPORT } from "@lockin/core";
import type { ActiveSession } from "../background/session";

// Muted task colors: sage, clay, slate blue, ochre, plum, teal.
export const TASK_COLORS = ["#6f9a8b", "#c48a64", "#7487ad", "#bfa35a", "#9a7aa6", "#5f97a3"] as const;

export interface SessionLike {
  id: string;
  taskIds: string[];
  taskLabel: string | null;
  committedAt: number | null;
  endedAt: number | null;
  goalMin: number | null;
  endKind: "normal" | "early" | null;
  blockEvents: { at: number; domain: string }[];
  focusLog: { at: number; state: "on" | "off" | "away" }[];
}

export function asSessionLike(s: ActiveSession): SessionLike {
  return {
    id: s.id,
    taskIds: s.taskIds ?? [],
    taskLabel: s.taskLabel,
    committedAt: s.committedAt,
    endedAt: s.endedAt,
    goalMin: s.goalMin ?? null,
    endKind: s.endKind,
    blockEvents: s.blockEvents ?? [],
    focusLog: s.focusLog ?? [],
  };
}

/** Start of the "day" (4am local) that contains t. */
export function dayStart(t: number): number {
  const d = new Date(t);
  d.setHours(ACTIVE_TIME.DAY_BOUNDARY_HOUR_LOCAL, 0, 0, 0);
  if (d.getTime() > t) d.setDate(d.getDate() - 1);
  return d.getTime();
}

export function taskKey(s: SessionLike): string {
  return s.taskIds.length ? [...s.taskIds].sort().join("+") : "none";
}

export function colorFor(key: string): string {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TASK_COLORS[h % TASK_COLORS.length]!;
}

/** On-task, off-task and away milliseconds of a session, clipped to [from, to). */
export function focusSplit(s: SessionLike, now: number, from = -Infinity, to = Infinity): { on: number; off: number; away: number } {
  const out = { on: 0, off: 0, away: 0 };
  if (s.committedAt === null) return out;
  const end = s.endedAt ?? now;
  const log = s.focusLog.length ? s.focusLog : [{ at: s.committedAt, state: "on" as const }];
  for (let i = 0; i < log.length; i++) {
    const a = Math.max(log[i]!.at, from, s.committedAt);
    const b = Math.min(log[i + 1]?.at ?? end, to, end);
    if (b > a) out[log[i]!.state] += b - a;
  }
  return out;
}

function partOfDay(hour: number): string {
  if (hour < REPORT.MORNING_ENDS_HOUR) return "in the morning";
  if (hour < REPORT.AFTERNOON_ENDS_HOUR) return "in the afternoon";
  return "in the evening";
}

export interface TaskRow {
  key: string;
  label: string;
  color: string;
  onMs: number;
  sessions: number;
}

export interface DayReport {
  focusedMs: number;
  focusPct: number | null;
  awayMs: number;
  blocked: number;
  rows: TaskRow[];
  strip: { startMs: number; endMs: number; segments: { from: number; to: number; color: string; label: string }[] };
  insight: string;
}

export function dayReport(sessions: SessionLike[], now: number): DayReport {
  const from = dayStart(now);
  const to = from + MS.DAY;
  const today = sessions.filter((s) => s.committedAt !== null && s.committedAt < to && (s.endedAt ?? now) > from);
  const rows = new Map<string, TaskRow>();
  let on = 0;
  let off = 0;
  let away = 0;
  const events: { at: number; domain: string }[] = [];
  for (const s of today) {
    const split = focusSplit(s, now, from, to);
    on += split.on;
    off += split.off;
    away += split.away;
    const key = taskKey(s);
    const row = rows.get(key) ?? { key, label: s.taskLabel ?? "Untitled", color: colorFor(key), onMs: 0, sessions: 0 };
    row.onMs += split.on;
    row.sessions += 1;
    rows.set(key, row);
    events.push(...s.blockEvents.filter((e) => e.at >= from && e.at < to));
  }

  const base = new Date(from);
  base.setHours(REPORT.STRIP_START_HOUR, 0, 0, 0);
  let startMs = base.getTime();
  let endMs = startMs + (REPORT.STRIP_END_HOUR - REPORT.STRIP_START_HOUR) * MS.HOUR;
  for (const s of today) {
    startMs = Math.min(startMs, Math.floor(s.committedAt! / MS.HOUR) * MS.HOUR);
    endMs = Math.max(endMs, Math.ceil((s.endedAt ?? now) / MS.HOUR) * MS.HOUR);
  }
  const segments = today.map((s) => ({ from: s.committedAt!, to: s.endedAt ?? now, color: colorFor(taskKey(s)), label: s.taskLabel ?? "" }));

  return {
    focusedMs: on,
    focusPct: on + off > 0 ? Math.round((on / (on + off)) * 100) : null,
    awayMs: away,
    blocked: events.length,
    rows: [...rows.values()].sort((a, b) => b.onMs - a.onMs),
    strip: { startMs, endMs, segments },
    insight: dayInsight(today, events, now),
  };
}

export function dayInsight(today: SessionLike[], events: { at: number; domain: string }[], now: number): string {
  if (today.length === 0) return "No sessions yet today. Hit Start when you’re ready.";
  const parts: string[] = [];
  const byDomain = new Map<string, number[]>();
  for (const e of events) if (e.domain) byDomain.set(e.domain, [...(byDomain.get(e.domain) ?? []), new Date(e.at).getHours()]);
  const top = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  if (top) {
    const hours = [...top[1]].sort((a, b) => a - b);
    const median = hours[Math.floor(hours.length / 2)]!;
    parts.push(`You reached for ${top[0]} ${top[1].length} time${top[1].length === 1 ? "" : "s"}, mostly ${partOfDay(median)}.`);
  } else {
    parts.push("Nothing got blocked today. Clean run.");
  }
  const longest = [...today].sort((a, b) => (b.endedAt ?? now) - b.committedAt! - ((a.endedAt ?? now) - a.committedAt!))[0]!;
  parts.push(`Your longest block was ${partOfDay(new Date(longest.committedAt!).getHours())}.`);
  return parts.join(" ");
}

export interface WeekDay {
  start: number;
  label: string;
  parts: { color: string; label: string; onMs: number }[];
  totalMs: number;
}

export function weekReport(sessions: SessionLike[], now: number): { days: WeekDay[]; insight: string; totalMs: number } {
  const todayStart = dayStart(now);
  const days: WeekDay[] = [];
  const byPart = new Map<string, number>();
  for (let i = REPORT.WEEK_DAYS - 1; i >= 0; i--) {
    const start = todayStart - i * MS.DAY;
    const end = start + MS.DAY;
    const parts = new Map<string, { color: string; label: string; onMs: number }>();
    for (const s of sessions) {
      const on = focusSplit(s, now, start, end).on;
      if (on <= 0) continue;
      const key = taskKey(s);
      const p = parts.get(key) ?? { color: colorFor(key), label: s.taskLabel ?? "", onMs: 0 };
      p.onMs += on;
      parts.set(key, p);
      if (s.committedAt !== null) {
        const bucket = partOfDay(new Date(s.committedAt).getHours());
        byPart.set(bucket, (byPart.get(bucket) ?? 0) + on);
      }
    }
    const list = [...parts.values()];
    days.push({ start, label: new Date(start).toLocaleDateString(undefined, { weekday: "short" }), parts: list, totalMs: list.reduce((a, p) => a + p.onMs, 0) });
  }
  const totalMs = days.reduce((a, d) => a + d.totalMs, 0);
  const best = [...byPart.entries()].sort((a, b) => b[1] - a[1])[0];
  const bestDay = [...days].sort((a, b) => b.totalMs - a.totalMs)[0];
  const insight =
    totalMs === 0
      ? "No focused time this week yet."
      : `You focus best ${best?.[0] ?? "in the morning"}. Your strongest day was ${new Date(bestDay!.start).toLocaleDateString(undefined, { weekday: "long" })}.`;
  return { days, insight, totalMs };
}

export function formatHm(ms: number): string {
  const min = Math.round(ms / MS.MINUTE);
  const h = Math.floor(min / (MS.HOUR / MS.MINUTE));
  const m = min % (MS.HOUR / MS.MINUTE);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
