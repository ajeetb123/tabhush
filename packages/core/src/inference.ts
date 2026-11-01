// Task inference at Start (docs/05 CLS-50, docs/03 LOOP-02/03).

import { ASK, INFERENCE } from "./constants";
import { meanOfTop, relatedness, type Vector } from "./classifier/relatedness";
import type { Task } from "./registry";

export interface SnapshotTab {
  vector: Vector | null; // null when the tab carries no usable signal
  front: boolean;
}

/**
 * Q-51: each tab's s for the task, the front tab entered twice, then the mean of the 3 highest
 * entries (fewer entries: mean of what exists).
 */
export function taskScore(task: Task, tabs: readonly SnapshotTab[]): number | null {
  if (!task.labelVector) return null;
  const rep = { label: task.labelVector, prototypes: task.prototypes.map((p) => p.vector) };
  const entries: number[] = [];
  for (const tab of tabs) {
    if (!tab.vector) continue;
    const s = relatedness(tab.vector, rep);
    const copies = tab.front ? INFERENCE.FRONT_TAB_WEIGHT : 1;
    for (let i = 0; i < copies; i++) entries.push(s);
  }
  return meanOfTop(entries, INFERENCE.TAB_SCORE_TOP_N);
}

export type InferenceResult =
  | { kind: "autofill"; task: Task; score: number }
  | { kind: "clarify"; guesses: Task[]; reason: "thin_signal" | "low_confidence" | "no_recent_task" };

export function inferTask(recent: readonly Task[], tabs: readonly SnapshotTab[]): InferenceResult {
  const usable = tabs.filter((t) => t.vector !== null);
  if (usable.length === 0) return { kind: "clarify", guesses: recent.slice(0, ASK.CLARIFY_GUESSES), reason: "thin_signal" };
  if (recent.length === 0) return { kind: "clarify", guesses: [], reason: "no_recent_task" };

  const scored = recent
    .map((task) => ({ task, score: taskScore(task, tabs) }))
    .filter((x): x is { task: Task; score: number } => x.score !== null)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];
  if (
    best &&
    best.score >= INFERENCE.AUTOFILL_MIN_SCORE &&
    (!second || best.score - second.score >= INFERENCE.AUTOFILL_MIN_MARGIN)
  ) {
    return { kind: "autofill", task: best.task, score: best.score };
  }
  return {
    kind: "clarify",
    guesses: scored.slice(0, ASK.CLARIFY_GUESSES).map((x) => x.task),
    reason: best ? "low_confidence" : "no_recent_task",
  };
}

/** LLM label proposals are cut to 5 words (CLS-50). */
export function clampLabel(label: string): string {
  return label.trim().split(/\s+/).slice(0, INFERENCE.LLM_LABEL_MAX_WORDS).join(" ");
}
