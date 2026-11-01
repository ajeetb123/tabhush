// Ask budget (docs/05 CLS-25): at most 4 asks per hour and 1 every 5 minutes.
// Over budget: allow and flag. Phase placement is OPEN Q-55; applying it only ever turns an
// ask into allow-and-flag, which fails open.

import { ASK, MS } from "./constants";

export function askBudgetAvailable(askTimes: readonly number[], now: number, limits = ASK): boolean {
  const lastHour = askTimes.filter((t) => now - t < MS.HOUR);
  if (lastHour.length >= limits.MAX_PER_HOUR) return false;
  const last = Math.max(-Infinity, ...askTimes);
  return now - last >= limits.MIN_GAP_MIN * MS.MINUTE;
}

export function pruneAskTimes(askTimes: readonly number[], now: number): number[] {
  return askTimes.filter((t) => now - t < MS.HOUR);
}
