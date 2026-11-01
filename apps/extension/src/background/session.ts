// The active session record, persisted on every transition so it survives service-worker
// suspension (EXT-04). One session at a time.

import { nextState, type SessionEvent, type SessionState } from "@lockin/core";

export interface PreviewItem {
  tabId: number;
  url: string;
  title: string;
  domain: string;
  itemKey: string;
  /** true = will be parked on Confirm; un-checking makes it a keep (strong related label). */
  park: boolean;
  /** Set for tabs in a separate window or tab group, which is asked about as a whole (LOOP-02). */
  contextId?: string;
}

export interface SeparateContext {
  id: string;
  kind: "window" | "group";
  title: string;
  tabIds: number[];
  /** null until the user answers; Confirm waits for every answer. */
  park: boolean | null;
}

export interface ParkedTab {
  tabId: number;
  url: string;
  title: string;
  itemKey: string;
  at: number;
  bySweep: boolean;
  source: string;
}

export interface OverrideState {
  url: string;
  title: string;
  itemKey: string;
  at: number;
  /** Minute-bucketed input counts for the 3-active-minute rule (CLS-62). */
  activity: [number, number][];
  labeled: boolean;
}

export interface RestoreEntry {
  url: string;
  title: string;
  reason: "closed" | "blocked";
}

export interface ActiveSession {
  id: string;
  state: SessionState;
  startedAt: number;
  /** Front window, tab and group at the moment Start was pressed (glossary: start snapshot). */
  startFront: { tabId: number | null; windowId: number | null; groupId: number };
  taskId: string | null;
  taskLabel: string | null;
  /** Proposed label (from the registry or the LLM) before Confirm; a rename is recorded (LOOP-02). */
  chip: { label: string; taskId: string | null; renamed: boolean } | null;
  clarify: { guesses: { taskId: string; label: string }[] } | null;
  sameAs: { label: string; candidates: { taskId: string; label: string }[] } | null;
  preview: PreviewItem[];
  separate: SeparateContext[];
  committedAt: number | null;
  parked: Record<string, ParkedTab>;
  lastParkAt: number | null;
  overrides: Record<string, OverrideState>;
  asks: number[];
  pendingAsk: Record<string, string>; // tabId → itemKey
  liftedDomains: string[];
  /** Every override this session; the sentence stays on this device (PRIV-01). */
  overrideLog: { at: number; domain: string; sentence: string; judged: boolean }[];
  /** Named-site lifts and overrides, shown on the session card (LOOP-09). */
  suspensions: string[];
  restoreList: RestoreEntry[];
  tier3Uncontested: { itemKey: string; related: boolean }[];
  flagged: string[];
  limited: boolean;
  endCountdown: { startedAt: number; reason: string } | null;
  endedAt: number | null;
  endKind: "normal" | "early" | null;
  bail: boolean;
}

export function newSession(now: number): ActiveSession {
  return {
    id: crypto.randomUUID(),
    state: "IDLE",
    startedAt: now,
    startFront: { tabId: null, windowId: null, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE },
    taskId: null,
    taskLabel: null,
    chip: null,
    clarify: null,
    sameAs: null,
    preview: [],
    separate: [],
    committedAt: null,
    parked: {},
    lastParkAt: null,
    overrides: {},
    asks: [],
    pendingAsk: {},
    liftedDomains: [],
    overrideLog: [],
    suspensions: [],
    restoreList: [],
    tier3Uncontested: [],
    flagged: [],
    limited: false,
    endCountdown: null,
    endedAt: null,
    endKind: null,
    bail: false,
  };
}

export async function loadSession(): Promise<ActiveSession | null> {
  const { session } = await chrome.storage.local.get("session");
  return (session as ActiveSession | undefined) ?? null;
}

export async function saveSession(s: ActiveSession | null): Promise<void> {
  if (s === null) await chrome.storage.local.remove("session");
  else await chrome.storage.local.set({ session: s });
}

/** Applies a state-machine event or throws; callers persist afterwards. */
export function apply(s: ActiveSession, event: SessionEvent): void {
  const next = nextState(s.state, event);
  if (next === null) throw new Error(`invalid transition ${s.state} --${event.type}-->`);
  s.state = next;
}

let chain: Promise<unknown> = Promise.resolve();

/** Serializes read-modify-write of the session across concurrent events. */
export function withSession<T>(fn: (s: ActiveSession | null) => Promise<T>): Promise<T> {
  const run = chain.then(async () => fn(await loadSession()));
  chain = run.catch(() => undefined);
  return run;
}
