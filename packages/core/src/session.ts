// Session state machine (docs/03 "Session state machine", beta 1 subset).
// Beta 2 states (ON_BREAK, SWITCH_COUNTDOWN, IDLE_PAUSED, EXTEND_PROMPT) are not built yet
// (docs/13: build only the current phase). The record is persisted on every transition (EXT-04).

import { EXITS, isTodo, MS, SWEEP } from "./constants";

export type SessionState =
  | "IDLE"
  | "INFERRING"
  | "CLARIFY"
  | "SWEEP_PREVIEW"
  | "ACTIVE"
  | "END_COUNTDOWN"
  | "ENDED"
  | "SUSPENDED";

export type SessionEvent =
  | { type: "START" }
  | { type: "INFER_CONFIDENT" }
  | { type: "INFER_UNSURE" }
  | { type: "CLARIFY_ANSWERED" }
  | { type: "CONFIRM" }
  | { type: "AUTO_COMMIT" }
  | { type: "END_REQUESTED" }
  | { type: "END_COUNTDOWN_DONE" }
  | { type: "PROCTORING_DETECTED" }
  | { type: "DISMISS" };

const TRANSITIONS: Record<SessionState, Partial<Record<SessionEvent["type"], SessionState>>> = {
  IDLE: { START: "INFERRING" },
  INFERRING: { INFER_CONFIDENT: "SWEEP_PREVIEW", INFER_UNSURE: "CLARIFY", END_REQUESTED: "END_COUNTDOWN" },
  CLARIFY: { CLARIFY_ANSWERED: "SWEEP_PREVIEW", END_REQUESTED: "END_COUNTDOWN" },
  SWEEP_PREVIEW: { CONFIRM: "ACTIVE", AUTO_COMMIT: "ACTIVE", END_REQUESTED: "END_COUNTDOWN" },
  ACTIVE: { END_REQUESTED: "END_COUNTDOWN", PROCTORING_DETECTED: "SUSPENDED" },
  // End is always available (LOCK-04 step 3). What SUSPENDED resumes to is OPEN Q-20.
  SUSPENDED: { END_REQUESTED: "END_COUNTDOWN" },
  END_COUNTDOWN: { END_COUNTDOWN_DONE: "ENDED" },
  ENDED: { DISMISS: "IDLE" },
};

export function nextState(state: SessionState, event: SessionEvent): SessionState | null {
  return TRANSITIONS[state][event.type] ?? null;
}

/** States in which parks are enforced. */
export function isEnforcing(state: SessionState): boolean {
  return state === "ACTIVE" || state === "END_COUNTDOWN";
}

/** Sessions 1-5 always wait for Confirm (LOOP-04). */
export function confirmRequired(committedSessionsBefore: number): boolean {
  return committedSessionsBefore < SWEEP.CONFIRM_REQUIRED_FIRST_N_SESSIONS;
}

/**
 * Session 6+: auto-commit only at high confidence. "High confidence" is TODO_Q16(a), so the
 * sweep always waits for Confirm until it is decided.
 */
export function canAutoCommit(committedSessionsBefore: number, sweepConfidence: number): boolean {
  if (confirmRequired(committedSessionsBefore)) return false;
  const min = SWEEP.AUTO_COMMIT_MIN_CONFIDENCE;
  if (isTodo(min)) return false;
  return sweepConfidence >= min;
}

export function undoOpen(committedAt: number, now: number): boolean {
  return now - committedAt <= SWEEP.UNDO_WINDOW_SEC * MS.SECOND;
}

export type ExitKind = "end" | "pass" | "break";

/**
 * Bail = an emergency pass or an early end within 2 minutes of a park (glossary).
 * INV-16: breaks are never bails.
 */
export function isBail(kind: ExitKind, at: number, lastParkAt: number | null): boolean {
  if (kind === "break") return false;
  if (lastParkAt === null) return false;
  return at - lastParkAt <= EXITS.BAIL_WINDOW_SEC * MS.SECOND && at >= lastParkAt;
}

export function endCountdownDone(startedAt: number, now: number): boolean {
  return now - startedAt >= EXITS.END_COUNTDOWN_SEC * MS.SECOND;
}

/** One-line reason required for a user-initiated End (LOCK-04). */
export function validEndReason(reason: string): boolean {
  const r = reason.trim();
  return r.length > 0 && !/[\r\n]/.test(r);
}
