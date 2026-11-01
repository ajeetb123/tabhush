// What parking does to a tab (docs/04 LOCK-05, docs/07 EXT-06..08). INV-17: overlays keep page
// state; a tab is only closed when a content script cannot reach it, and then it goes on the
// restore list.

import { domainsOf, isKnownUnreachable, parseUrl, PURE_DISTRACTION } from "@lockin/core";
import type { ToContent } from "../shared/messages";

const CONTENT_SCRIPT = "content.js";
const BLOCKED_PAGE = "/ui/blocked.html";

export type ParkOutcome = "overlaid" | "closed";

async function send(tabId: number, msg: ToContent): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, msg);
    return true;
  } catch {
    return false;
  }
}

/** Sends to the tab's content script, injecting it first if the tab predates the install. */
export async function sendToTab(tabId: number, msg: ToContent): Promise<boolean> {
  if (await send(tabId, msg)) return true;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [CONTENT_SCRIPT] });
  } catch {
    return false; // unreachable: Web Store, built-in PDF viewer, other internal pages
  }
  return send(tabId, msg);
}

export async function parkTab(tab: chrome.tabs.Tab, taskLabel: string, canOverride: boolean, sampledCheck = false): Promise<ParkOutcome> {
  const id = tab.id!;
  const parsed = tab.url ? parseUrl(tab.url) : null;
  if (parsed && isKnownUnreachable(parsed)) {
    await chrome.tabs.remove(id);
    return "closed";
  }
  await chrome.tabs.update(id, { muted: true });
  const ok = await sendToTab(id, { type: "overlay:show", taskLabel, canOverride, sampledCheck });
  if (!ok) {
    await chrome.tabs.remove(id);
    return "closed";
  }
  return "overlaid";
}

/**
 * Q-67: closes a blocked tab. The last tab of a window is turned into the blocked page instead,
 * so closing never shuts the window (or the browser).
 */
export async function closeBlockedTab(tab: chrome.tabs.Tab): Promise<ParkOutcome> {
  const id = tab.id!;
  const siblings = await chrome.tabs.query({ windowId: tab.windowId });
  if (siblings.length > 1) {
    await chrome.tabs.remove(id).catch(() => undefined);
  } else {
    const blocked = chrome.runtime.getURL(BLOCKED_PAGE);
    await chrome.tabs.update(id, { url: `${blocked}#${encodeURIComponent(tab.url ?? "")}` }).catch(() => undefined);
  }
  return "closed";
}

export async function unparkTab(tabId: number, unmute: boolean): Promise<void> {
  await send(tabId, { type: "overlay:hide" });
  if (unmute) await chrome.tabs.update(tabId, { muted: false }).catch(() => undefined);
}

// ───────────── Pre-block rules for pure-distraction domains (LOOP-09, EXT-06) ─────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Installs main-frame redirect rules to the blocked page; returns the domains covered. */
export async function installPreBlocks(exceptDomains: readonly string[]): Promise<string[]> {
  const domains = domainsOf(PURE_DISTRACTION).filter((d) => !exceptDomains.includes(d));
  const blocked = chrome.runtime.getURL(BLOCKED_PAGE);
  const rules: chrome.declarativeNetRequest.Rule[] = domains.map((d, i) => ({
    id: i + 1,
    priority: 1,
    action: {
      type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
      redirect: { regexSubstitution: `${blocked}#\\0` },
    },
    condition: {
      regexFilter: `^https?://([^/]*\\.)?${escapeRegex(d)}(?::\\d+)?(?:/.*)?$`,
      resourceTypes: [chrome.declarativeNetRequest.ResourceType.MAIN_FRAME],
    },
  }));
  await removePreBlocks();
  await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
  return domains;
}

export async function removePreBlocks(): Promise<void> {
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  if (existing.length) await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existing.map((r) => r.id) });
}
