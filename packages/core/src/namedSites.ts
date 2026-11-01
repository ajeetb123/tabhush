// Named sites (docs/05 CLS-55, docs/03 LOOP-09). A task names a site when its label contains
// the site's name or a known alias. A named MIXED site lifts only its domain-wide pre-block;
// a named pure-distraction domain never lifts automatically. Full alias list: TODO_Q13.

import { NAMED_SITE_ALIASES } from "./constants";
import { MIXED_SITES, NAMED_SITE_DOMAINS, PURE_DISTRACTION } from "./lists";

function words(label: string): string[] {
  return label.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

function containsPhrase(haystack: string[], phrase: string): boolean {
  const p = words(phrase);
  if (p.length === 0) return false;
  for (let i = 0; i + p.length <= haystack.length; i++) {
    if (p.every((w, j) => haystack[i + j] === w)) return true;
  }
  return false;
}

export function namedSites(label: string): string[] {
  const w = words(label);
  const names = new Set<string>();
  for (const name of Object.keys(NAMED_SITE_DOMAINS)) if (containsPhrase(w, name)) names.add(name);
  for (const [alias, name] of Object.entries(NAMED_SITE_ALIASES)) if (w.includes(alias)) names.add(name);
  return [...names];
}

/** Domains whose domain-wide pre-block is lifted for this task (mixed sites only). */
export function liftedPreBlockDomains(label: string): string[] {
  const mixed = new Set(MIXED_SITES.map((s) => s.name));
  return namedSites(label)
    .filter((n) => mixed.has(n))
    .flatMap((n) => NAMED_SITE_DOMAINS[n] ?? []);
}

/** Named pure-distraction sites: shown on the session card, never lifted without an override. */
export function namedPureDistraction(label: string): string[] {
  const pure = new Set(PURE_DISTRACTION.map((s) => s.name));
  return namedSites(label).filter((n) => pure.has(n));
}
