// Naming a task on device with no prompt (Q-64): a course code from the open tabs if one appears
// (e.g. "CS 2114"), otherwise the front tab's title without its site suffix, cut to 5 words.

import { OWNER_RULES } from "./constants";

const COURSE = /\b([A-Z]{2,4})\s?(\d{3,4}[A-Z]?)\b/g;

export function courseCodesIn(title: string): string[] {
  return [...title.matchAll(COURSE)].map((m) => `${m[1]} ${m[2]}`);
}

/** "Lab report draft - Google Docs" → "Lab report draft". */
export function cleanTitle(title: string): string {
  const first = title.split(/\s+[-|–—·:]\s+/)[0] ?? title;
  return first.replace(/^\(\d+\)\s*/, "").trim();
}

export function autoLabel(tabs: readonly { title: string; front: boolean }[], knownCourses: readonly string[] = []): string | null {
  const counts = new Map<string, number>();
  for (const t of tabs) for (const c of courseCodesIn(t.title)) counts.set(c, (counts.get(c) ?? 0) + (t.front ? 2 : 1));
  for (const c of knownCourses) if (counts.has(c)) counts.set(c, counts.get(c)! + 1);
  const course = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (course) return course;
  const front = tabs.find((t) => t.front && cleanTitle(t.title)) ?? tabs.find((t) => cleanTitle(t.title));
  if (!front) return null;
  return cleanTitle(front.title).split(/\s+/).slice(0, OWNER_RULES.AUTO_LABEL_MAX_WORDS).join(" ") || null;
}
