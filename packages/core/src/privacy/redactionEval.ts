// QA-21 redaction test (docs/15): 500 realistic titles with labeled names; ≥ 95% of names caught;
// all emails, phones, long numbers and URLs removed. The set is written by the owner.

import { REDACTION } from "../constants";
import type { Redactor } from "./redaction";

export interface RedactionCase {
  title: string;
  /** Names that must not survive redaction. */
  names: string[];
  /** Emails, phone numbers, long numbers and URLs that must always be removed. */
  patterns: string[];
}

export interface RedactionReport {
  titles: number;
  names: number;
  namesCaught: number;
  nameRecall: number;
  patternMisses: { title: string; leaked: string }[];
  pass: boolean;
}

export function evaluateRedaction(redact: Redactor, cases: readonly RedactionCase[]): RedactionReport {
  let names = 0;
  let caught = 0;
  const patternMisses: RedactionReport["patternMisses"] = [];
  for (const c of cases) {
    const out = redact(c.title);
    for (const n of c.names) {
      names++;
      if (!out.includes(n)) caught++;
    }
    for (const p of c.patterns) if (out.includes(p)) patternMisses.push({ title: c.title, leaked: p });
  }
  const nameRecall = names === 0 ? 1 : caught / names;
  return {
    titles: cases.length,
    names,
    namesCaught: caught,
    nameRecall,
    patternMisses,
    pass: nameRecall >= REDACTION.TARGET_NAME_RECALL && patternMisses.length === 0,
  };
}
