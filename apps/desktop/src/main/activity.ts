// The all-day activity log for the comprehensive report (Q-70): which app, site and window was in
// front, stretch by stretch, one file per day (4am to 4am, TIME-04). Stays on this device.

import { DESKTOP, MS } from "@tabhush/core";
import type { ActivitySegment } from "../shared/types";
import { dayStart } from "../renderer/reportData";
import type { JsonStore } from "./store";

type Entry = Omit<ActivitySegment, "from" | "to">;

const same = (a: Entry, b: Entry) =>
  a.state === b.state && a.label === b.label && a.bundleId === b.bundleId && a.title === b.title && a.sessionId === b.sessionId && a.onTask === b.onTask;

export function dayFile(t: number): string {
  const d = new Date(dayStart(t));
  return `activity/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export class ActivityLog {
  private days = new Map<string, ActivitySegment[]>();
  private dirty = new Set<string>();
  private lastFlush = 0;

  constructor(private readonly store: JsonStore) {}

  private day(name: string): ActivitySegment[] {
    let list = this.days.get(name);
    if (!list) this.days.set(name, (list = this.store.read<ActivitySegment[]>(name, [])));
    return list;
  }

  /** What is in front now. Extends the last stretch when nothing changed, else starts a new one. */
  record(now: number, entry: Entry): void {
    const name = dayFile(now);
    const list = this.day(name);
    const last = list[list.length - 1];
    if (last && same(last, entry) && now - last.to <= DESKTOP.SEGMENT_MERGE_GAP_SEC * MS.SECOND) {
      last.to = now;
    } else {
      // A stretch that crossed 4am is closed at the day boundary; the new day starts fresh.
      const from = last && now - last.to <= DESKTOP.SEGMENT_MERGE_GAP_SEC * MS.SECOND ? last.to : now;
      list.push({ ...entry, from: Math.max(from, dayStart(now)), to: now });
    }
    this.dirty.add(name);
    if (now - this.lastFlush >= DESKTOP.ACTIVITY_FLUSH_SEC * MS.SECOND) this.flush(now);
  }

  /** Turns active time since `since` into away time: no input meant nobody was working (Q-74). */
  markAwaySince(since: number): void {
    const name = dayFile(since);
    const list = this.day(name);
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i]!;
      if (s.to <= since) break;
      if (s.state !== "active") continue;
      if (s.from >= since) {
        s.state = "away";
        delete s.onTask;
        delete s.otherTask;
      } else {
        // Split: the part before `since` stays active, the rest becomes away.
        const { onTask: _o, otherTask: _t, ...rest } = s;
        list.splice(i + 1, 0, { ...rest, from: since, to: s.to, state: "away" });
        s.to = since;
      }
    }
    this.dirty.add(name);
  }

  flush(now = Date.now()): void {
    for (const name of this.dirty) this.store.write(name, this.days.get(name) ?? []);
    this.dirty.clear();
    this.lastFlush = now;
    // Keep only today and yesterday in memory.
    const keep = new Set([dayFile(now), dayFile(now - MS.DAY)]);
    for (const k of this.days.keys()) if (!keep.has(k)) this.days.delete(k);
  }

  /** Every stretch overlapping [from, to). */
  between(from: number, to: number): ActivitySegment[] {
    const out: ActivitySegment[] = [];
    for (let t = dayStart(from); t < to; t += MS.DAY) {
      for (const s of this.day(dayFile(t + MS.HOUR))) if (s.to > from && s.from < to) out.push(s);
    }
    return out;
  }
}
