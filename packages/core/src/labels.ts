// Labels (docs/05 CLS-60..CLS-62). INV-13: the model never learns from its own guesses or from
// excuses. Bails and refused overrides are never labels; an accepted override becomes a label
// only after 3 active minutes on that item; playback and idle time never count.

import { LABELS, OVERRIDE_LABEL } from "./constants";

export type StrongSource = "clarify" | "sweep_keep" | "sweep_undo" | "override_after_active_minutes" | "ask_answer";
export type WeakSource = "uncontested_park" | "uncontested_tier3";
export type LabelSource = StrongSource | WeakSource;

/** Never labels: these go to review instead (CLS-60). */
export type NeverLabelSource = "bail" | "refused_override" | "playback" | "idle" | "model_guess";

const STRONG: readonly string[] = ["clarify", "sweep_keep", "sweep_undo", "override_after_active_minutes", "ask_answer"];
const WEAK: readonly string[] = ["uncontested_park", "uncontested_tier3"];

export interface Label {
  taskId: string;
  itemKey: string;
  related: boolean;
  source: LabelSource;
  createdAt: number;
  vector?: number[];
}

export function strength(source: LabelSource): "strong" | "weak" {
  if (STRONG.includes(source)) return "strong";
  if (WEAK.includes(source)) return "weak";
  throw new Error(`not a label source: ${String(source)}`);
}

/** Effective weight = base × 0.5^(age_days / half_life_days) (CLS-61). */
export function effectiveWeight(label: Pick<Label, "source" | "createdAt">, now: number): number {
  const strong = strength(label.source) === "strong";
  const base = strong ? LABELS.STRONG_WEIGHT : LABELS.WEAK_WEIGHT;
  const halfLife = strong ? LABELS.STRONG_HALF_LIFE_DAYS : LABELS.WEAK_HALF_LIFE_DAYS;
  const ageDays = Math.max(0, now - label.createdAt) / 86_400_000;
  return base * Math.pow(0.5, ageDays / halfLife);
}

/** Rejects anything that is not a label source, so bails and refused overrides can't slip in. */
export function assertLabelSource(source: string): asserts source is LabelSource {
  if (!STRONG.includes(source) && !WEAK.includes(source)) {
    throw new Error(`refusing to store "${source}" as a label (INV-13)`);
  }
}

/**
 * Active minutes for the override → strong label rule (CLS-62). Input events are counts only
 * (keys, clicks, scrolls), bucketed per minute; playback is never an input event.
 */
export class ActiveMinuteCounter {
  private readonly buckets = new Map<number, number>();

  addInputEvents(count: number, at: number): void {
    const minute = Math.floor(at / 60_000);
    this.buckets.set(minute, (this.buckets.get(minute) ?? 0) + count);
  }

  activeMinutes(): number {
    let n = 0;
    for (const c of this.buckets.values()) if (c >= OVERRIDE_LABEL.INPUT_EVENTS_PER_ACTIVE_MIN) n++;
    return n;
  }

  qualifiesForLabel(): boolean {
    return this.activeMinutes() >= OVERRIDE_LABEL.ACTIVE_MIN_REQUIRED;
  }

  toJSON(): [number, number][] {
    return [...this.buckets.entries()];
  }

  static fromJSON(data: [number, number][] | undefined): ActiveMinuteCounter {
    const c = new ActiveMinuteCounter();
    for (const [m, n] of data ?? []) c.buckets.set(m, n);
    return c;
  }
}
