// Time goal (Q-64): the user sets how long they will work. The default is their typical session;
// a note (never a question) flags over-ambitious or very short goals.

import { BREAKS, MS, OWNER_RULES, SESSION } from "./constants";

export function clampGoal(min: number): number {
  return Math.min(SESSION.MAX_LENGTH_MIN, Math.max(OWNER_RULES.GOAL_MIN_MIN, Math.round(min)));
}

/** Median actual length of the last sessions, rounded to 5 minutes; null with no history. */
export function typicalMinutes(lengthsMin: readonly number[]): number | null {
  const recent = lengthsMin.slice(-OWNER_RULES.GOAL_HISTORY_SESSIONS).filter((m) => m > 0).sort((a, b) => a - b);
  if (recent.length === 0) return null;
  const mid = recent.length / 2;
  const median = recent.length % 2 ? recent[Math.floor(mid)]! : (recent[mid - 1]! + recent[mid]!) / 2;
  return clampGoal(Math.round(median / OWNER_RULES.GOAL_ROUND_MIN) * OWNER_RULES.GOAL_ROUND_MIN);
}

export function defaultGoal(typical: number | null): number {
  const presets = OWNER_RULES.GOAL_PRESETS_MIN;
  if (typical === null) return presets[1]!;
  return [...presets].sort((a, b) => Math.abs(a - typical) - Math.abs(b - typical))[0]!;
}

export function goalNote(goal: number, typical: number | null): string | null {
  if (typical !== null && goal > typical * OWNER_RULES.GOAL_OVERAMBITIOUS_FACTOR) {
    return `You usually lock in for about ${typical} min. A goal you hit beats one you abandon.`;
  }
  if (goal <= OWNER_RULES.GOAL_MIN_MIN) return "Short and sweet. You can keep going past the goal.";
  return null;
}

/** Break time does not count toward the goal (Q-34). */
export function goalReached(committedAt: number | null, goalMin: number | null, now: number, breakMs = 0): boolean {
  return committedAt !== null && goalMin !== null && now - committedAt - breakMs >= goalMin * MS.MINUTE;
}

/** Break minutes earned and not yet used this session (LOOP-08, Q-34). */
export function breakMinutesAvailable(onTaskMs: number, usedMin: number): number {
  return Math.max(0, Math.floor(onTaskMs / MS.MINUTE / BREAKS.FOCUSED_MIN_PER_BREAK_MIN) - usedMin);
}
