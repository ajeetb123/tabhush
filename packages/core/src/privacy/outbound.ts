// Everything that leaves the device for tier 3 is built here (docs/06 PRIV-02/03, INV-08/09/12).
// Redaction runs before anything else; domain-only sites and the "Domain only" setting drop titles.

import { parseUrl } from "../domains";
import { isDomainOnly } from "../classifier/tier1";
import type { Tier3Request } from "../protocol";
import type { Redactor } from "./redaction";
import { sanitizeSentence, sanitizeTitle } from "./sanitize";

export interface OutboundContext {
  redact: Redactor;
  /** User setting "Domain only": titles never leave at all (PRIV-03). */
  domainOnlySetting: boolean;
}

function clean(ctx: OutboundContext, title: string): string {
  // Redact first, then strip control characters and cut to 120 characters.
  return sanitizeTitle(ctx.redact(title));
}

export function buildJudgeRequest(ctx: OutboundContext, taskLabel: string, url: string, title: string): Tier3Request | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  const req: Tier3Request = { kind: "judge", task_label: clean(ctx, taskLabel), domain: parsed.host };
  if (!ctx.domainOnlySetting && !isDomainOnly(parsed) && title.trim()) req.title = clean(ctx, title);
  return req;
}

export function buildOverrideRequest(
  ctx: OutboundContext,
  taskLabel: string,
  url: string,
  title: string,
  sentence: string,
): Tier3Request | null {
  const base = buildJudgeRequest(ctx, taskLabel, url, title);
  if (!base) return null;
  return { ...base, kind: "override", sentence: sanitizeSentence(ctx.redact(sentence)) };
}

/** CLS-50: front-window titles for a label proposal. Domain-only sites contribute nothing. */
export function buildInferLabelRequest(ctx: OutboundContext, tabs: readonly { url: string; title: string }[]): Tier3Request | null {
  if (ctx.domainOnlySetting) return null;
  const titles = tabs
    .filter((t) => {
      const p = parseUrl(t.url);
      return p !== null && !isDomainOnly(p);
    })
    .map((t) => clean(ctx, t.title))
    .filter(Boolean);
  if (titles.length === 0) return null;
  return { kind: "infer_label", front_titles: titles };
}
