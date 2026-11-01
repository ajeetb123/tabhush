// Verdict cache item keys (docs/05 CLS-40). key = taskId + itemKey.

import { parseUrl } from "../domains";
import { normalizeQuery, searchQuery } from "../search";
import { mixedSiteDomain, pureDistractionDomain } from "./tier1";

export type ItemKeyKind = "domain" | "path" | "page";

export interface ItemKey {
  kind: ItemKeyKind;
  value: string;
}

function youtubeRule(path: string, search: string): string | null {
  const params = new URLSearchParams(search);
  const v = params.get("v");
  if (path === "/watch" && v) return `video:${v}`;
  const video = path.match(/^\/(?:shorts|embed|live)\/([^/]+)/);
  if (video?.[1]) return `video:${video[1]}`;
  const channel = path.match(/^\/(@[^/]+|channel\/[^/]+|c\/[^/]+|user\/[^/]+)/);
  if (channel?.[1]) return `channel:${channel[1].toLowerCase()}`;
  return null;
}

function mixedPathRule(domain: string, path: string, search: string): string | null {
  switch (domain) {
    case "youtube.com":
      return youtubeRule(path, search);
    case "reddit.com": {
      const m = path.match(/^\/r\/([^/]+)/i);
      return m?.[1] ? `r/${m[1].toLowerCase()}` : null;
    }
    case "stackoverflow.com": {
      const m = path.match(/^\/questions\/(\d+)/);
      return m?.[1] ? `q/${m[1]}` : null;
    }
    case "x.com":
    case "twitter.com": {
      const m = path.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/);
      const reserved = ["home", "explore", "search", "notifications", "messages", "i", "settings"];
      return m?.[1] && !reserved.includes(m[1].toLowerCase()) ? `account:${m[1].toLowerCase()}` : null;
    }
    default:
      return null;
  }
}

export function itemKeyFor(urlString: string): ItemKey | null {
  const url = parseUrl(urlString);
  if (!url) return null;
  const pd = pureDistractionDomain(url);
  if (pd) return { kind: "domain", value: pd };
  // "Core work tools" also key on domain (CLS-40); that list depends on the profile tool lists (TODO_Q12).
  const mixed = mixedSiteDomain(url);
  if (mixed) {
    const rule = mixedPathRule(mixed, url.path, url.search);
    if (rule) return { kind: "path", value: `${mixed}|${rule}` };
  }
  // Search results are keyed by their query (Q-64), so one blocked search does not block all searches.
  const q = searchQuery(urlString);
  if (q !== null) return { kind: "page", value: `${url.scheme}://${url.host}${url.path}?q=${normalizeQuery(q)}` };
  // origin + path, query string (and fragment) dropped
  const origin = `${url.scheme}://${url.host}`;
  return { kind: "page", value: `${origin}${url.path}` };
}

export function cacheKey(taskId: string, itemKey: ItemKey): string {
  return `${taskId}::${itemKey.kind}::${itemKey.value}`;
}
