// Task registry and representation (docs/05 CLS-30..CLS-32).
// Tasks have stable IDs; logs and memory key on the ID, never the name.

import { INFERENCE, MS, REGISTRY, TASK_REP } from "./constants";
import type { Vector } from "./classifier/relatedness";

export interface Prototype {
  vector: number[];
  addedAt: number;
}

export interface Task {
  id: string;
  label: string;
  labelVector?: number[];
  prototypes: Prototype[];
  createdAt: number;
  lastUsedAt: number;
}

/** Exact-match normalization: case and punctuation (CLS-31). */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findExact(tasks: readonly Task[], label: string): Task | undefined {
  const n = normalizeLabel(label);
  return tasks.find((t) => normalizeLabel(t.label) === n);
}

const COURSE_CODE = /^[a-z]+\d+$/i;

export function courseCodes(label: string): Set<string> {
  return new Set(
    normalizeLabel(label)
      .split(" ")
      .filter((w) => COURSE_CODE.test(w)),
  );
}

export function sharesCourseCode(a: string, b: string): boolean {
  const ca = courseCodes(a);
  for (const c of courseCodes(b)) if (ca.has(c)) return true;
  return false;
}

export type SameAsReason = "label_similarity" | "course_code" | "word_overlap";

/**
 * "Same as X?" candidates for a new label (CLS-31). Exact matches merge silently and are
 * not returned here. The word-overlap rule needs its overlap measure defined (TODO_Q59), so
 * it is not applied yet.
 */
export function sameAsCandidates(
  label: string,
  tasks: readonly Task[],
  labelSimilarity: (task: Task) => number | null,
): { task: Task; reason: SameAsReason }[] {
  const n = normalizeLabel(label);
  const out: { task: Task; reason: SameAsReason }[] = [];
  for (const task of tasks) {
    if (normalizeLabel(task.label) === n) continue;
    const sim = labelSimilarity(task);
    if (sim !== null && sim >= REGISTRY.SAME_AS_MIN_LABEL_SIM) out.push({ task, reason: "label_similarity" });
    else if (REGISTRY.SAME_AS_SHARED_COURSE_CODE && sharesCourseCode(label, task.label)) out.push({ task, reason: "course_code" });
  }
  return out;
}

export function recentTasks(tasks: readonly Task[], now: number): Task[] {
  const cutoff = now - INFERENCE.RECENT_TASK_WINDOW_DAYS * MS.DAY;
  return tasks.filter((t) => t.lastUsedAt >= cutoff).sort((a, b) => b.lastUsedAt - a.lastUsedAt);
}

/**
 * Prototype seeding sources (CLS-32): only positive signals. Allow-and-flag items, a home page
 * merely left open, and anything not positively confirmed never become prototypes.
 */
export type PrototypeSource =
  | { kind: "similarity"; s: number }
  | { kind: "tier1_allow" }
  | { kind: "sweep_keep" }
  | { kind: "accepted_item" }
  | { kind: "override_after_active_minutes" };

export function canSeedPrototype(src: PrototypeSource): boolean {
  switch (src.kind) {
    case "similarity":
      return src.s >= TASK_REP.PROTOTYPE_SEED_MIN_S;
    case "tier1_allow":
    case "sweep_keep":
    case "accepted_item":
    case "override_after_active_minutes":
      return true;
  }
}

/** Adds a prototype, dropping the oldest beyond 50. Never averages into one task vector. */
export function addPrototype(task: Task, vector: Vector, src: PrototypeSource, now: number): boolean {
  if (!canSeedPrototype(src)) return false;
  task.prototypes.push({ vector: Array.from(vector), addedAt: now });
  task.prototypes.sort((a, b) => a.addedAt - b.addedAt);
  while (task.prototypes.length > TASK_REP.MAX_ITEM_PROTOTYPES) task.prototypes.shift();
  return true;
}
