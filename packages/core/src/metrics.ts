// Success metrics and gates (docs/14). Model errors and user behavior are kept apart: bails
// enter the wrong-park estimate through a sampled error share and never become labels.

import { EVAL, GATES } from "./constants";

export function correctionRate(acceptedOverrides: number, parks: number): number {
  return parks === 0 ? 0 : acceptedOverrides / parks;
}

export interface WrongParkInputs {
  parks: number;
  acceptedOverrides: number;
  refusedOverridesJudgedWrong: number;
  bails: number;
  /** Error share found in the hand-reviewed random sample of bails (sample size OPEN Q-42). */
  bailSampleErrorShare: number;
  wrongParksFromSampledCheck: number;
}

/** (accepted overrides + refused judged wrong + bails × sampled error share + sampled-check wrong) ÷ parks */
export function estimatedWrongParkRate(i: WrongParkInputs): number {
  if (i.parks === 0) return 0;
  return (i.acceptedOverrides + i.refusedOverridesJudgedWrong + i.bails * i.bailSampleErrorShare + i.wrongParksFromSampledCheck) / i.parks;
}

export function catchRate(distractionsCaught: number, distractionsSampled: number): number {
  return distractionsSampled === 0 ? 0 : distractionsCaught / distractionsSampled;
}

export function inferenceAccuracy(sessionsKeptWithoutRename: number, sessions: number): number {
  return sessions === 0 ? 0 : sessionsKeptWithoutRename / sessions;
}

// ───────────── Cluster bootstrap by person and domain (QA-40, EVAL.CI_METHOD) ─────────────

export interface ParkRecord {
  person: string;
  domain: string;
  wrong: boolean;
}

function resampleCounts(keys: readonly string[], random: () => number): Map<string, number> {
  const counts = new Map<string, number>();
  for (let i = 0; i < keys.length; i++) {
    const k = keys[Math.floor(random() * keys.length)]!;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Two-way cluster bootstrap: persons and domains are resampled independently with replacement;
 * each record is weighted by how often its person and its domain were drawn. The number of
 * resamples is the caller's choice (not a product value).
 */
export function clusterBootstrapWrongParkRate(
  records: readonly ParkRecord[],
  resamples: number,
  level: number,
  random: () => number = Math.random,
): { estimate: number; lower: number; upper: number } {
  const rate = (rs: readonly ParkRecord[]) => (rs.length ? rs.filter((r) => r.wrong).length / rs.length : 0);
  const persons = [...new Set(records.map((r) => r.person))];
  const domains = [...new Set(records.map((r) => r.domain))];
  const stats: number[] = [];
  for (let b = 0; b < resamples; b++) {
    const pc = resampleCounts(persons, random);
    const dc = resampleCounts(domains, random);
    let total = 0;
    let wrong = 0;
    for (const r of records) {
      const w = (pc.get(r.person) ?? 0) * (dc.get(r.domain) ?? 0);
      total += w;
      if (r.wrong) wrong += w;
    }
    if (total > 0) stats.push(wrong / total);
  }
  stats.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  const at = (q: number) => stats[Math.min(stats.length - 1, Math.max(0, Math.floor(q * stats.length)))] ?? 0;
  return { estimate: rate(records), lower: at(tail), upper: at(1 - tail) };
}

export const CI_METHOD = EVAL.CI_METHOD;

// ───────────────────────── Gates ─────────────────────────

export interface GateAInput {
  parks: number;
  wrongParks: number;
  people: number;
  distinctSites: number;
  /** Per person: distractions caught / distractions in their 100 labeled tab switches. */
  catchRateByPerson: readonly number[];
}

export function gateA(i: GateAInput): { pass: boolean; failures: string[] } {
  const g = GATES.GATE_A;
  const failures: string[] = [];
  if (i.parks < g.PARKS_MIN) failures.push(`parks ${i.parks} < ${g.PARKS_MIN}`);
  if (i.wrongParks > g.WRONG_PARKS_MAX) failures.push(`wrong parks ${i.wrongParks} > ${g.WRONG_PARKS_MAX}`);
  if (i.people < g.PEOPLE) failures.push(`people ${i.people} < ${g.PEOPLE}`);
  if (i.distinctSites < g.DISTINCT_SITES_MIN) failures.push(`distinct sites ${i.distinctSites} < ${g.DISTINCT_SITES_MIN}`);
  i.catchRateByPerson.forEach((c, n) => c < g.CATCH_RATE_MIN && failures.push(`person ${n + 1} catch rate ${c} < ${g.CATCH_RATE_MIN}`));
  return { pass: failures.length === 0, failures };
}

export interface GateBInput {
  wrongPark: WrongParkInputs;
  criticalWrongParks: number;
  catchRate: number;
  lostWorkReports: number;
  spendWithinLimits: boolean;
}

export function gateB(i: GateBInput): { pass: boolean; failures: string[]; estimatedWrongParkRate: number } {
  const g = GATES.GATE_B;
  const rate = estimatedWrongParkRate(i.wrongPark);
  const failures: string[] = [];
  if (i.wrongPark.parks < g.PARKS_MIN) failures.push(`parks ${i.wrongPark.parks} < ${g.PARKS_MIN} (the beta runs longer)`);
  if (rate > g.WRONG_PARK_RATE_MAX) failures.push(`estimated wrong-park rate ${rate} > ${g.WRONG_PARK_RATE_MAX}`);
  if (i.criticalWrongParks > g.CRITICAL_WRONG_PARKS_MAX) failures.push(`critical wrong parks ${i.criticalWrongParks}`);
  if (i.catchRate < g.CATCH_RATE_MIN) failures.push(`catch rate ${i.catchRate} < ${g.CATCH_RATE_MIN}`);
  if (i.lostWorkReports > g.LOST_WORK_REPORTS_MAX) failures.push(`lost-work reports ${i.lostWorkReports}`);
  if (!i.spendWithinLimits) failures.push("spend over limits");
  return { pass: failures.length === 0, failures, estimatedWrongParkRate: rate };
}
