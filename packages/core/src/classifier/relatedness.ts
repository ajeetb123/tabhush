// Relatedness score s (docs/05 CLS-33).
//   s = max( cos(item, label), mean(top-3 cos(item, prototype)) )
// With 1-2 prototypes the mean of what exists is used; with 0 only the label term counts (Q-53).

import { EMBEDDING, TASK_REP } from "../constants";

export type Vector = ArrayLike<number>;

export function cosine(a: Vector, b: Vector): number {
  if (a.length !== b.length) throw new Error(`vector length mismatch: ${a.length} vs ${b.length}`);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function meanOfTop(values: readonly number[], k: number): number | null {
  if (values.length === 0) return null;
  const top = [...values].sort((x, y) => y - x).slice(0, k);
  return top.reduce((sum, v) => sum + v, 0) / top.length;
}

export interface TaskVectors {
  label: Vector;
  prototypes: readonly Vector[];
}

export function relatedness(item: Vector, task: TaskVectors): number {
  const labelSim = cosine(item, task.label);
  const protoMean = meanOfTop(
    task.prototypes.map((p) => cosine(item, p)),
    TASK_REP.TOP_K_FOR_AVG,
  );
  return protoMean === null ? labelSim : Math.max(labelSim, protoMean);
}

/** Item text fed to the embedder: title + domain (the embedder truncates to 64 tokens). */
export function itemText(title: string, domain: string): string {
  return `${title} ${domain}`.trim();
}

export const ITEM_MAX_TOKENS = EMBEDDING.MAX_INPUT_TOKENS;
