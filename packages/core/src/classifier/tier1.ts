// Tier 1: on-device rules and lists (docs/05 CLS-10), in this order of authority:
// never-locked → user essentials → pure-distraction → profile tool list → shipped category list.
// The shared domain prior is applied in relatedness as a nudge only (INV-04), never here.

import { hostInSet, hostMatches, hostMatchesAny, lookupHost, parseUrl, type ParsedUrl } from "../domains";
import {
  BROWSER_INTERNAL_SCHEMES,
  DEVELOPER_HOST_SUFFIXES,
  DEVELOPER_HOSTS,
  DEVELOPER_SCHEMES,
  DEVELOPER_SITES,
  domainsOf,
  LEARNING_PLATFORMS,
  MIXED_SITES,
  PURE_DISTRACTION,
  WEB_CHAT,
  WEB_MEETINGS,
  WEBMAIL,
  BANKING_AND_HEALTH,
  UNREACHABLE_HOSTS,
  UNREACHABLE_HOST_PATHS,
} from "../lists";
import type { Category } from "../constants";

export type NeverLockedReason = "system" | "learning_platform" | "meeting" | "developer";

export type Tier1Result =
  | { kind: "never_locked"; reason: NeverLockedReason }
  | { kind: "essential" }
  | { kind: "pure_distraction"; domain: string }
  | { kind: "profile_strong_allow" }
  | { kind: "none"; category: Category | null };

export interface Tier1Context {
  /** User essentials (domains), set before the session. */
  essentials: readonly string[];
  /** Courseware domains for the user's school (onboarding, beta 2; mapping source TODO_Q10). */
  schoolCoursewareDomains: readonly string[];
  /** Content script reported a courseware page fingerprint (method TODO_Q10). */
  coursewareFingerprint: boolean;
  /** The app's own extension origin host (chrome-extension://<id>). */
  ownExtensionId: string;
}

export function isLearningPlatform(url: ParsedUrl, ctx: Pick<Tier1Context, "schoolCoursewareDomains" | "coursewareFingerprint">): boolean {
  if (ctx.coursewareFingerprint) return true;
  return hostMatchesAny(url.host, domainsOf(LEARNING_PLATFORMS)) || hostMatchesAny(url.host, ctx.schoolCoursewareDomains);
}

export function neverLockedReason(url: ParsedUrl, ctx: Tier1Context): NeverLockedReason | null {
  if ((BROWSER_INTERNAL_SCHEMES as readonly string[]).includes(url.scheme)) return "system";
  if (isLearningPlatform(url, ctx)) return "learning_platform";
  if (hostMatchesAny(url.host, domainsOf(WEB_MEETINGS))) return "meeting";
  if ((DEVELOPER_SCHEMES as readonly string[]).includes(url.scheme)) return "developer";
  if ((DEVELOPER_HOSTS as readonly string[]).includes(url.rawHost)) return "developer";
  if (DEVELOPER_HOST_SUFFIXES.some((s) => url.rawHost.endsWith(s))) return "developer";
  if (hostMatchesAny(url.host, domainsOf(DEVELOPER_SITES))) return "developer";
  return null;
}

export function pureDistractionDomain(url: ParsedUrl): string | null {
  for (const d of domainsOf(PURE_DISTRACTION)) if (hostMatches(url.host, d)) return d;
  return null;
}

export function mixedSiteDomain(url: ParsedUrl): string | null {
  for (const d of domainsOf(MIXED_SITES)) if (hostMatches(url.host, d)) return d;
  return null;
}

/**
 * INV-09: webmail, web chat, banking and health send the domain only. Banking domains come from
 * the shipped list (Q-48), loaded at runtime and passed in.
 */
export function isDomainOnly(url: ParsedUrl, bankingDomains?: ReadonlySet<string>): boolean {
  if (hostMatchesAny(url.host, [...domainsOf(WEBMAIL), ...domainsOf(WEB_CHAT), ...domainsOf(BANKING_AND_HEALTH)])) return true;
  return bankingDomains !== undefined && hostInSet(url.host, bankingDomains);
}

/** EXT-08 pages known by URL to be unreachable by content scripts. */
export function isKnownUnreachable(url: ParsedUrl): boolean {
  if (hostMatchesAny(url.rawHost, UNREACHABLE_HOSTS)) return true;
  return UNREACHABLE_HOST_PATHS.some((u) => url.rawHost === u.host && url.path.startsWith(u.pathPrefix));
}

/** Category from the shipped domain-category list (CLS-10 input 5, Q-08), loaded at runtime. */
export function shippedCategory(urlString: string, table: ReadonlyMap<string, Category>): Category | null {
  const url = parseUrl(urlString);
  return url ? (lookupHost(url.host, table) ?? null) : null;
}

export function tier1(urlString: string, ctx: Tier1Context): Tier1Result {
  const url = parseUrl(urlString);
  if (!url) return { kind: "none", category: null };
  if (url.scheme === "chrome-extension" && url.rawHost === ctx.ownExtensionId) {
    return { kind: "never_locked", reason: "system" };
  }
  const reason = neverLockedReason(url, ctx);
  if (reason) return { kind: "never_locked", reason };
  if (hostMatchesAny(url.host, ctx.essentials)) return { kind: "essential" };
  const pd = pureDistractionDomain(url);
  if (pd) return { kind: "pure_distraction", domain: pd };
  // Profile tool lists are TODO_Q12, so no profile strong allow is ever returned yet.
  // The shipped domain-category list is TODO_Q08, so no shipped category is known yet.
  return { kind: "none", category: null };
}
