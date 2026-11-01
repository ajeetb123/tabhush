// Confidence policy and reference decision procedure (docs/05 CLS-01..CLS-04).
//
// Invariants enforced structurally here:
//   INV-01  never-locked / learning platforms return ALLOW before anything else, cache included
//   INV-02  similarity alone never parks (only distraction list, tier 3, memory, or CLS-21 path)
//   INV-03  tier 3 is never consulted for never-locked or pure-distraction items
//   INV-06  a tier 3 failure fails open: allow and flag, never a new park

import { DECISION_ORDER, THRESHOLDS, type Category } from "../constants";
import type { ItemKey } from "./cacheKey";
import type { Tier3Cached, VerdictCache } from "./cache";
import type { Tier1Result } from "./tier1";

export type Action = "allow" | "park" | "ask" | "allow_and_flag";

export type DecisionSource =
  | "never_locked"
  | "essential"
  | "override"
  | "cache"
  | "distraction"
  | "profile"
  | "similarity"
  | "memory"
  | "tier3"
  | "on_device_path"
  | "ask"
  | "over_budget"
  | "fail_open";

export interface Decision {
  action: Action;
  source: DecisionSource;
  s?: number;
  tier3?: Tier3Cached;
  /** True when tier 3 failed (backend down, cap hit): the client enters Limited mode (LOCK-08). */
  tier3Failed?: boolean;
}

export interface JudgeDeps {
  taskId: string;
  itemKey: ItemKey;
  tier1: Tier1Result;
  /** An accepted "This is for my task" override for this item in this session (CLS-55, LOCK-04). */
  overridden: boolean;
  cache: VerdictCache;
  /** Tier 2 relatedness, including any crowd-prior nudge (never decisive). */
  relatedness: () => Promise<number>;
  /** Personal memory (beta 2). Null when fewer than 3 qualifying neighbours agree. */
  memory: () => Promise<"related" | "unrelated" | null>;
  /** Null when tier 3 is unavailable (no consent, on-device only, under age, cap reached, redaction unavailable). */
  tier3: (() => Promise<Tier3Cached>) | null;
  /** CLS-21 on-device-only parking path (beta 2). */
  onDeviceParkingPath: boolean;
  /** Category from the shipped list or a cached tier 3 category, never the crowd prior (CLS-21). */
  onDeviceCategory: Category | null;
  askBudgetAvailable: () => boolean;
  order?: { LOW_S_TO_TIER3: boolean; TIER3_BEFORE_ASK: boolean };
  thresholds?: { ALLOW_MIN_S: number; MIDDLE_MIN_S: number; TIER3_PARK_MIN_CONFIDENCE: number };
}

export async function judge(d: JudgeDeps): Promise<Decision> {
  const order = d.order ?? DECISION_ORDER;
  const th = d.thresholds ?? THRESHOLDS;

  if (d.tier1.kind === "never_locked") return { action: "allow", source: "never_locked" };
  if (d.tier1.kind === "essential") return { action: "allow", source: "essential" };
  if (d.overridden) return { action: "allow", source: "override" };

  const cached = await d.cache.lookup(d.taskId, d.itemKey);
  if (cached?.decision) return { action: cached.decision, source: "cache" };

  if (d.tier1.kind === "pure_distraction") {
    await d.cache.record(d.taskId, d.itemKey, { decision: "park" });
    return { action: "park", source: "distraction" };
  }
  if (d.tier1.kind === "profile_strong_allow") {
    await d.cache.record(d.taskId, d.itemKey, { decision: "allow" });
    return { action: "allow", source: "profile" };
  }

  const s = await d.relatedness();
  if (s >= th.ALLOW_MIN_S) {
    await d.cache.record(d.taskId, d.itemKey, { decision: "allow" });
    return { action: "allow", source: "similarity", s };
  }

  const m = await d.memory();
  if (m === "unrelated") {
    await d.cache.record(d.taskId, d.itemKey, { decision: "park" });
    return { action: "park", source: "memory", s };
  }
  if (m === "related") {
    await d.cache.record(d.taskId, d.itemKey, { decision: "allow" });
    return { action: "allow", source: "memory", s };
  }

  const lowS = s < th.MIDDLE_MIN_S;
  const tier3Eligible = d.tier3 !== null && (!lowS || order.LOW_S_TO_TIER3);
  const askFirst = !order.TIER3_BEFORE_ASK && d.askBudgetAvailable();

  if (tier3Eligible && !askFirst) {
    let v: Tier3Cached | undefined = cached?.tier3;
    if (!v) {
      try {
        v = await d.tier3!();
      } catch {
        return { action: "allow_and_flag", source: "fail_open", s, tier3Failed: true };
      }
      await d.cache.record(d.taskId, d.itemKey, { tier3: v });
    }
    if (v.verdict === "unrelated" && v.confidence >= th.TIER3_PARK_MIN_CONFIDENCE) {
      await d.cache.record(d.taskId, d.itemKey, { decision: "park", tier3: v });
      return { action: "park", source: "tier3", s, tier3: v };
    }
    if (v.verdict === "related") {
      await d.cache.record(d.taskId, d.itemKey, { decision: "allow", tier3: v });
      return { action: "allow", source: "tier3", s, tier3: v };
    }
    // unsure, or unrelated below the confidence bar → ask
  } else if (d.tier3 === null && d.onDeviceParkingPath && lowS) {
    const c = d.onDeviceCategory;
    if (c !== null && (THRESHOLDS.ON_DEVICE_PARK_CATEGORIES as readonly string[]).includes(c)) {
      await d.cache.record(d.taskId, d.itemKey, { decision: "park" });
      return { action: "park", source: "on_device_path", s };
    }
  }

  if (d.askBudgetAvailable()) return { action: "ask", source: "ask", s };
  return { action: "allow_and_flag", source: "over_budget", s };
}
