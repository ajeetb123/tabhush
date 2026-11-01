// Shipped lists. Platform names are normative (CONSTANTS.md "Lists that are partially defined");
// their domains are the [DERIVED] mapping in CONSTANTS.md "Domain mapping" (owner to verify, Q-57).
// A domain covers its subdomains. Lists marked TODO are incomplete until their question is resolved.

export interface Site {
  name: string;
  domains: readonly string[];
}

// LOCK-02 / INV-01. Never parked by any tier, override flow or config.
export const LEARNING_PLATFORMS: readonly Site[] = [
  { name: "Canvas", domains: ["instructure.com"] },
  { name: "Blackboard", domains: ["blackboard.com", "bbcollab.com"] },
  { name: "Moodle", domains: ["moodlecloud.com"] },
  { name: "Brightspace", domains: ["brightspace.com", "desire2learn.com", "d2l.com"] },
  { name: "Gradescope", domains: ["gradescope.com"] },
  { name: "WebAssign", domains: ["webassign.net", "webassign.com"] },
  { name: "Pearson MyLab", domains: ["pearson.com", "pearsonmylabandmastering.com"] },
  { name: "McGraw Hill Connect", domains: ["mheducation.com"] },
  { name: "zyBooks", domains: ["zybooks.com"] },
  { name: "Top Hat", domains: ["tophat.com"] },
  { name: "Piazza", domains: ["piazza.com"] },
  { name: "Ed Discussion", domains: ["edstem.org"] },
  { name: "Panopto", domains: ["panopto.com", "panopto.eu"] },
  { name: "Kaltura", domains: ["kaltura.com"] },
];
// School-hosted instances (e.g. canvas.vt.edu) come from onboarding school domains and a page
// fingerprint: both TODO_Q10 (constants COURSEWARE).

export const WEB_MEETINGS: readonly Site[] = [
  { name: "Google Meet", domains: ["meet.google.com"] },
  { name: "Zoom", domains: ["zoom.us", "zoom.com"] },
  { name: "Teams", domains: ["teams.microsoft.com", "teams.live.com"] },
];

export const DEVELOPER_SITES: readonly Site[] = [{ name: "GitHub", domains: ["github.com"] }];
// Package registries: TODO_Q11.
export const DEVELOPER_HOSTS = ["localhost", "127.0.0.1"] as const;
export const DEVELOPER_HOST_SUFFIXES = [".local"] as const;
export const DEVELOPER_SCHEMES = ["file"] as const;

// System and safety (LOCK-02): browser settings pages, the password manager and the app itself
// live on browser-internal schemes, which content scripts cannot reach. [DERIVED]
// School sign-in pages: TODO_Q56.
export const BROWSER_INTERNAL_SCHEMES = [
  "chrome",
  "edge",
  "brave",
  "about",
  "chrome-extension",
  "devtools",
] as const;

// Blocked whole, never auto-lifted (CONSTANTS.md). Rest of the list: TODO_Q09.
// TikTok follows CONSTANTS.md as pure-distraction (Q-41, owner: non-blocking).
export const PURE_DISTRACTION: readonly Site[] = [
  { name: "Netflix", domains: ["netflix.com"] },
  { name: "Steam", domains: ["steampowered.com", "steamcommunity.com"] },
  { name: "TikTok", domains: ["tiktok.com"] },
];

// Judged per page or path (CLS-40 path rules). Rest of the list: TODO_Q09.
export const MIXED_SITES: readonly Site[] = [
  { name: "YouTube", domains: ["youtube.com"] },
  { name: "Reddit", domains: ["reddit.com"] },
  { name: "Stack Overflow", domains: ["stackoverflow.com"] },
  { name: "X", domains: ["x.com", "twitter.com"] },
];

// PRIV-03 / INV-09: domain only, never titles. Banking and health: TODO_Q48.
export const WEBMAIL: readonly Site[] = [
  { name: "Gmail", domains: ["mail.google.com"] },
  { name: "Outlook on the web", domains: ["outlook.live.com", "outlook.office.com", "outlook.office365.com"] },
];
export const WEB_CHAT: readonly Site[] = [
  { name: "Discord", domains: ["discord.com"] },
  { name: "Messenger", domains: ["messenger.com"] },
  { name: "WhatsApp Web", domains: ["web.whatsapp.com"] },
];
export const BANKING_AND_HEALTH: readonly Site[] = []; // TODO_Q48

// EXT-08: content scripts cannot reach these. The built-in PDF viewer and other internal pages
// are detected by a failed injection instead of by URL.
export const UNREACHABLE_HOSTS = ["chromewebstore.google.com"] as const;
export const UNREACHABLE_HOST_PATHS = [{ host: "chrome.google.com", pathPrefix: "/webstore" }] as const;

// Named sites (CLS-55): names and aliases that can appear in a task label.
export const NAMED_SITE_DOMAINS: Readonly<Record<string, readonly string[]>> = {
  ...Object.fromEntries([...MIXED_SITES, ...PURE_DISTRACTION].map((s) => [s.name, s.domains])),
  Instagram: ["instagram.com"],
};

export function domainsOf(sites: readonly Site[]): string[] {
  return sites.flatMap((s) => s.domains);
}
