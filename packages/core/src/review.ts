// Opt-in redacted review records (docs/06 PRIV-50, beta 1 per Q-29).
// Each record holds: task label, domain, redacted title, verdict, and for reviews the redacted
// override sentence. Same domain-only rules apply. The file format and delivery path are
// TODO_Q28, so records are kept on device and serialization is unavailable until decided.

import { isTodo, REVIEW } from "./constants";
import { parseUrl } from "./domains";
import { isDomainOnly } from "./classifier/tier1";
import type { Redactor } from "./privacy/redaction";
import { sanitizeSentence, sanitizeTitle } from "./privacy/sanitize";

export type ReviewKind = "refused_override" | "bail" | "sampled_check";

export interface ReviewRecord {
  kind: ReviewKind;
  task_label: string;
  domain: string;
  title?: string;
  verdict: string;
  sentence?: string;
}

export function buildReviewRecord(
  redact: Redactor,
  input: { kind: ReviewKind; taskLabel: string; url: string; title: string; verdict: string; sentence?: string; domainOnlySetting: boolean },
): ReviewRecord | null {
  const parsed = parseUrl(input.url);
  if (!parsed) return null;
  const rec: ReviewRecord = {
    kind: input.kind,
    task_label: sanitizeTitle(redact(input.taskLabel)),
    domain: parsed.host,
    verdict: input.verdict,
  };
  if (!input.domainOnlySetting && !isDomainOnly(parsed) && input.title.trim()) rec.title = sanitizeTitle(redact(input.title));
  if (input.sentence !== undefined) rec.sentence = sanitizeSentence(redact(input.sentence));
  return rec;
}

export function exportAvailable(): boolean {
  return !isTodo(REVIEW.EXPORT_FORMAT);
}

/** "Was this park right?" sampling. The rate is TODO_Q42, so no park is sampled yet. */
export function shouldSampleParkCheck(random: () => number = Math.random): boolean {
  const rate = REVIEW.SAMPLED_CHECK_RATE;
  if (isTodo(rate)) return false;
  return random() < rate;
}
