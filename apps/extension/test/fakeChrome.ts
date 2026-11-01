// A small in-memory stand-in for the chrome.* APIs the service worker uses, so the session
// engine can be driven end to end in tests. Only what the engine calls is modelled.

import { vi } from "vitest";

export interface FakeTab {
  id: number;
  windowId: number;
  groupId: number;
  url: string;
  title: string;
  active: boolean;
  lastAccessed: number;
  mutedInfo?: { muted: boolean };
}

export function makeChrome(initialTabs: Omit<FakeTab, "groupId" | "lastAccessed">[], opts: { focusedWindow: number; unreachable?: number[] }) {
  let nextId = 1000;
  const tabs = new Map<number, FakeTab>();
  initialTabs.forEach((t, i) => tabs.set(t.id, { groupId: -1, lastAccessed: 1_000 + (initialTabs.length - i), ...t }));
  const storage: Record<string, unknown> = {};
  const contentMessages: { tabId: number; msg: { type: string } }[] = [];
  const muted = new Map<number, boolean>();
  const removed: number[] = [];
  let dynamicRules: { id: number }[] = [];
  const alarms = new Map<string, number>();
  const created: string[] = [];
  const injected = new Set<number>(initialTabs.map((t) => t.id));

  const chrome = {
    runtime: {
      id: "ownextensionid",
      getURL: (p: string) => `chrome-extension://ownextensionid/${p.replace(/^\//, "")}`,
      reload: vi.fn(),
      sendMessage: vi.fn(),
      getContexts: vi.fn(async () => [{}]),
      ContextType: { OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" },
    },
    storage: {
      local: {
        get: async (key: string) => (key in storage ? { [key]: structuredClone(storage[key]) } : {}),
        set: async (obj: Record<string, unknown>) => void Object.assign(storage, structuredClone(obj)),
        remove: async (key: string) => void delete storage[key],
      },
    },
    tabs: {
      query: async () => [...tabs.values()].map((t) => ({ ...t })),
      get: async (id: number) => {
        const t = tabs.get(id);
        if (!t) throw new Error("no tab");
        return { ...t };
      },
      create: async ({ url }: { url: string }) => {
        created.push(url);
        const id = nextId++;
        tabs.set(id, { id, windowId: opts.focusedWindow, groupId: -1, url, title: "", active: true, lastAccessed: Date.now() });
        return { id };
      },
      update: async (id: number, p: { muted?: boolean }) => {
        if (p.muted !== undefined) muted.set(id, p.muted);
      },
      remove: async (id: number) => {
        removed.push(id);
        tabs.delete(id);
      },
      sendMessage: async (tabId: number, msg: { type: string }) => {
        if (!injected.has(tabId)) throw new Error("no receiver");
        contentMessages.push({ tabId, msg });
      },
    },
    windows: { getLastFocused: async () => ({ id: opts.focusedWindow }) },
    tabGroups: { TAB_GROUP_ID_NONE: -1, get: async () => ({ title: "" }) },
    scripting: {
      executeScript: async ({ target }: { target: { tabId: number } }) => {
        if (opts.unreachable?.includes(target.tabId)) throw new Error("cannot access");
        injected.add(target.tabId);
      },
    },
    declarativeNetRequest: {
      RuleActionType: { REDIRECT: "redirect" },
      ResourceType: { MAIN_FRAME: "main_frame" },
      getDynamicRules: async () => dynamicRules,
      updateDynamicRules: async (o: { addRules?: { id: number }[]; removeRuleIds?: number[] }) => {
        dynamicRules = dynamicRules.filter((r) => !o.removeRuleIds?.includes(r.id)).concat(o.addRules ?? []);
      },
    },
    alarms: { create: async (name: string, a: { when: number }) => void alarms.set(name, a.when) },
    offscreen: { Reason: { WORKERS: "WORKERS" }, createDocument: vi.fn() },
  };

  return {
    chrome,
    tabs,
    storage,
    contentMessages,
    muted,
    removed,
    alarms,
    created,
    rules: () => dynamicRules,
    overlaysShownOn: () => contentMessages.filter((m) => m.msg.type === "overlay:show").map((m) => m.tabId),
    overlaysHiddenOn: () => contentMessages.filter((m) => m.msg.type === "overlay:hide").map((m) => m.tabId),
  };
}

/**
 * Deterministic stand-in for the MiniLM embedder: bag of lowercase words hashed into a few
 * dimensions, so items that share words with the task label score high.
 */
export function fakeEmbed(texts: string[]): number[][] {
  const DIMS = 64;
  return texts.map((t) => {
    const v = new Array<number>(DIMS).fill(0);
    for (const w of t.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 2)) {
      let h = 0;
      for (const c of w) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      v[h % DIMS]! += 1;
    }
    return v;
  });
}
