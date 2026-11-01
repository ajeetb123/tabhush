// URL and domain handling shared by tier 1, the verdict cache and the privacy layer.
// Mirror domains are unwrapped to the site they wrap before any lookup (docs/03 LOOP-10).

export interface ParsedUrl {
  scheme: string; // without the trailing ":"
  host: string; // normalized and mirror-unwrapped
  rawHost: string; // as the browser reported it, lowercased
  path: string;
  search: string;
}

const MIRRORS: Readonly<Record<string, string>> = {
  "m.youtube.com": "youtube.com",
  "youtube-nocookie.com": "youtube.com",
};

const TRANSLATE_PROXY_SUFFIX = ".translate.goog";

export function parseUrl(url: string): ParsedUrl | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const rawHost = u.hostname.toLowerCase().replace(/\.$/, "");
  return {
    scheme: u.protocol.replace(/:$/, ""),
    host: unwrapMirror(stripWww(rawHost)),
    rawHost,
    path: u.pathname || "/",
    search: u.search,
  };
}

function stripWww(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : host;
}

// Google Translate proxies encode the wrapped host in one label:
// "." becomes "-" and an original "-" becomes "--" (e.g. my--site-example-com.translate.goog).
function decodeTranslateHost(label: string): string {
  const placeholder = "\u0000";
  return label.split("--").join(placeholder).split("-").join(".").split(placeholder).join("-");
}

export function unwrapMirror(host: string): string {
  let h = stripWww(host.toLowerCase());
  if (h.endsWith(TRANSLATE_PROXY_SUFFIX)) {
    const label = h.slice(0, -TRANSLATE_PROXY_SUFFIX.length);
    if (label && !label.includes(".")) h = stripWww(decodeTranslateHost(label));
  }
  return MIRRORS[h] ?? h;
}

/** True when `host` is `domain` or one of its subdomains. */
export function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith("." + domain);
}

export function hostMatchesAny(host: string, domains: readonly string[]): boolean {
  return domains.some((d) => hostMatches(host, d));
}

/** The domain an item is reported and judged as (mirror-unwrapped, no "www."). */
export function itemDomain(url: string): string | null {
  return parseUrl(url)?.host ?? null;
}
