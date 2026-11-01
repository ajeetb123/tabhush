import { describe, expect, it } from "vitest";
import { clusterBootstrapWrongParkRate, estimatedWrongParkRate, gateA, gateB, type ParkRecord } from "../src";

describe("docs/14 metrics", () => {
  it("estimated wrong-park rate follows the formula", () => {
    const r = estimatedWrongParkRate({ parks: 500, acceptedOverrides: 4, refusedOverridesJudgedWrong: 1, bails: 10, bailSampleErrorShare: 0.2, wrongParksFromSampledCheck: 1 });
    expect(r).toBeCloseTo((4 + 1 + 2 + 1) / 500);
  });
  it("Gate A needs 200 parks, zero wrong, 3 people, 50 sites, 85% catch each", () => {
    expect(gateA({ parks: 200, wrongParks: 0, people: 3, distinctSites: 50, catchRateByPerson: [0.9, 0.85, 0.86] }).pass).toBe(true);
    const f = gateA({ parks: 199, wrongParks: 1, people: 3, distinctSites: 50, catchRateByPerson: [0.9, 0.84, 0.9] });
    expect(f.pass).toBe(false);
    expect(f.failures).toHaveLength(3);
  });
  it("Gate B: 2% rate is the line", () => {
    const base = { criticalWrongParks: 0, catchRate: 0.9, lostWorkReports: 0, spendWithinLimits: true };
    const wp = { parks: 500, acceptedOverrides: 10, refusedOverridesJudgedWrong: 0, bails: 0, bailSampleErrorShare: 0, wrongParksFromSampledCheck: 0 };
    expect(gateB({ ...base, wrongPark: wp }).pass).toBe(true);
    expect(gateB({ ...base, wrongPark: { ...wp, acceptedOverrides: 11 } }).pass).toBe(false);
  });
  it("cluster bootstrap brackets the point estimate", () => {
    const recs: ParkRecord[] = [];
    for (let p = 0; p < 6; p++) for (let d = 0; d < 10; d++) recs.push({ person: `p${p}`, domain: `d${d}`, wrong: (p * 10 + d) % 25 === 0 });
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const ci = clusterBootstrapWrongParkRate(recs, 500, 0.95, rnd);
    expect(ci.lower).toBeLessThanOrEqual(ci.estimate);
    expect(ci.upper).toBeGreaterThanOrEqual(ci.estimate);
  });
});
