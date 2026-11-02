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
  /** Primary task (the chip). */
  taskId: string | null;
  /** Every task this session is for: the chip plus any picked together with it (Q-63). */
  taskIds: string[];
  /** Other recent tasks offered as chips on the start screen (Q-64). */
  suggestions: { taskId: string; label: string }[];
  /** How long the user said they would work, in minutes (Q-64). */
  goalMin: number | null;
  taskLabel: string | null;
  /** Proposed label (from the registry or the LLM) before Confirm; a rename is recorded (LOOP-02). */
  chip: { label: string; taskId: string | null; renamed: boolean } | null;
  preview: PreviewItem[];
  committedAt: number | null;
  parked: Record<string, ParkedTab>;
  lastParkAt: number | null;
  overrides: Record<string, OverrideState>;
  asks: number[];
  pendingAsk: Record<string, string>; // tabId → itemKey
  liftedDomains: string[];
  /** Every override this session; the sentence stays on this device (PRIV-01). */
  overrideLog: { at: number; domain: string; sentence: string; judged: boolean }[];
  /** Breaks taken this session (LOOP-08): planned length and actual start/end. */
  breaks: { startedAt: number; plannedMin: number; endedAt: number | null }[];
  /** Every block, for the report (domains stay on this device; telemetry has no domains, INV-19). */
  blockEvents: { at: number; domain: string }[];
  /**
   * Front-tab state over time: on task, off task, or away (browser not in front, no input, a
   * break or a pause). On and off entries name the site and page for the full report (Q-69);
   * the title is left out for mail, chat, banking and incognito tabs. Stays on this device.
   */
  focusLog: FocusEntry[];
  /** Step away / idle pauses (Q-69, LOOP-11): time stops, locks stay on. */
  pauses: { startedAt: number; endedAt: number | null; auto: boolean }[];
  /** When chrome.idle last reported no input, while it lasts. */
  idleSince: number | null;
  /** The once-a-day Emergency stop, if this session used it (Q-69). */
  emergency: { at: number; reason: string } | null;
  /** Last verdict per tab: true when allowed. */
  tabOnTask: Record<string, boolean>;
  /** Named-site lifts and overrides, shown on the session card (LOOP-09). */
  suspensions: string[];
  restoreList: RestoreEntry[];
  tier3Uncontested: { itemKey: string; related: boolean }[];
  flagged: string[];
  limited: boolean;
  endCountdown: { startedAt: number; reason: string } | null;
  endedAt: number | null;
  endKind: EndKind | null;
  bail: boolean;
}

/** normal: past the goal. early: the owner's dev install, or before commit. idle: 2 h away. */
export type EndKind = "normal" | "early" | "emergency" | "idle";

export interface FocusEntry {
  at: number;
  state: "on" | "off" | "away";
  domain?: string;
  title?: string;
}

export function newSession(now: number): ActiveSession {
  return {
    id: crypto.randomUUID(),
    state: "IDLE",
    startedAt: now,
    startFront: { tabId: null, windowId: null, groupId: chrome.tabGroups.TAB_GROUP_ID_NONE },
    taskId: null,
    taskIds: [],
    suggestions: [],
    goalMin: null,
    taskLabel: null,
    chip: null,
    preview: [],
    committedAt: null,
    parked: {},
    lastParkAt: null,
    overrides: {},
    asks: [],
    pendingAsk: {},
    liftedDomains: [],
    overrideLog: [],
    breaks: [],
    blockEvents: [],
    focusLog: [],
    pauses: [],
    idleSince: null,
    emergency: null,
    tabOnTask: {},
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
