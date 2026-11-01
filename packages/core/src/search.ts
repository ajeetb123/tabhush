// Search blocking (Q-64): a search results page is judged by its query, compared on device with
// distraction topics and work topics. The topic match is the second signal INV-02 requires.

import { OWNER_RULES, THRESHOLDS } from "./constants";
import { parseUrl } from "./domains";

/** The query of a Google, Bing or DuckDuckGo results page, or null. */
export function searchQuery(urlString: string): string | null {
  const url = parseUrl(urlString);
  if (!url) return null;
  const q = new URLSearchParams(url.search).get("q")?.trim();
  if (!q) return null;
  const labels = url.host.split(".");
  const isGoogle = labels.includes("google") && url.path === "/search";
  const isBing = url.host === "bing.com" && url.path === "/search";
  const isDdg = url.host === "duckduckgo.com" && (url.path === "/" || url.path === "");
  return isGoogle || isBing || isDdg ? q : null;
}

export function normalizeQuery(q: string): string {
  return q.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Blocked when the query is close to a distraction topic, clearly closer to it than to any work
 * topic, and not related to the session's tasks.
 */
export function isDistractingSearch(scores: { distraction: number; work: number; task: number }): boolean {
  return (
    scores.distraction >= OWNER_RULES.SEARCH_TOPIC_MIN &&
    scores.distraction - scores.work >= OWNER_RULES.SEARCH_TOPIC_MARGIN &&
    scores.task < THRESHOLDS.MIDDLE_MIN_S
  );
}

/**
 * Page topics (Q-65): a page whose title, description and headings are close to a distraction
 * topic, clearly closer to it than to work, and unrelated to the session's tasks.
 */
export function isDistractingPage(scores: { distraction: number; work: number; task: number }): boolean {
  return (
    scores.distraction >= OWNER_RULES.PAGE_TOPIC_MIN &&
    scores.distraction - scores.work >= OWNER_RULES.PAGE_TOPIC_MARGIN &&
    scores.task < THRESHOLDS.MIDDLE_MIN_S
  );
}
