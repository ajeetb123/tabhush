// Types shared by the main process (engine, tracker) and the renderer pages.

import type { SessionState } from "@lockin/core";

/** One thing in front: a browser page, a browser window with a title only, or an app window. */
export interface FrontItem {
  /** What the report groups by: the site for a browser page, otherwise the app's name. */
  label: string;
  app: string;
  bundleId: string;
  /** Page or window title; left out for excluded apps, domain-only sites and private windows. */
  title?: string;
  url?: string;
  domain?: string;
}

/** A stretch of activity in the all-day log (Q-70 comprehensive report). Stays on this device. */
export interface ActivitySegment {
  from: number;
  to: number;
  state: "active" | "away";
  label: string;
  app: string;
  bundleId: string;
  title?: string;
  domain?: string;
  /** The session this happened in, and whether it was on task. */
  sessionId?: string;
  onTask?: boolean;
  /** Q-72: productive work for another of your tasks during the session. */
  otherTask?: string;
}

export interface FocusEntry {
  at: number;
  /** on: this session's task. other: productive work for another task (Q-72). off: a distraction. */
  state: "on" | "other" | "off" | "away";
  /** For "other": the task it was for. */
  task?: string;
  /** Site or app name. */
  domain?: string;
  title?: string;
}

/** An item the sweep proposes to block at Start (LOOP-04): an open tab or a running app. */
export interface PreviewItem {
  id: string;
  kind: "tab" | "app";
  bundleId: string;
  /** The app's process at Start, to tell a reopened app from one that ignored the quit. */
  pid?: number;
  url?: string;
  title: string;
  label: string;
  park: boolean;
}

export type EndKind = "normal" | "early" | "emergency" | "idle";

export interface Session {
  id: string;
  state: SessionState;
  startedAt: number;
  taskIds: string[];
  taskLabel: string | null;
  /** Other recent tasks offered as chips on the start screen (Q-64). */
  suggestions: { taskId: string; label: string }[];
  goalMin: number | null;
  preview: PreviewItem[];
  committedAt: number | null;
  /** Every block, for the report: the site or app (stays on this device). */
  blockEvents: { at: number; domain: string }[];
  lastParkAt: number | null;
  focusLog: FocusEntry[];
  breaks: { startedAt: number; plannedMin: number; endedAt: number | null }[];
  /** Step away, idle and app-not-running pauses: time stops, blocks stay on (Q-69, Q-70). */
  pauses: { startedAt: number; endedAt: number | null; auto: boolean }[];
  idleSince: number | null;
  /** Tabs and apps closed by a block, to reopen at the end (LOOP-07). */
  restoreList: { url?: string; bundleId?: string; title: string; reason: "closed" | "quit" }[];
  /** Music app volumes before the session lowered them (Q-63), restored at the end. */
  musicVolumes: Record<string, number>;
  suspensions: string[];
  /** Proctoring app running: enforcement suspended (DSK-10). */
  suspendedFor: string | null;
  emergency: { at: number; reason: string } | null;
  /** Tasks you said you were also doing this session (Q-72): their work counts as other productive work. */
  otherTaskIds: string[];
  endCountdown: { startedAt: number; reason: string } | null;
  endedAt: number | null;
  endKind: EndKind | null;
  bail: boolean;
  /** Last time the app was seen running; a long silence mid-session is a gap (INV-15 wording). */
  heartbeat: number;
  gaps: { from: number; to: number }[];
}

export interface Settings {
  /** Courseware and sign-in sites, never blocked (LOCK-02). */
  schoolSites: string[];
  /** User essentials: domains always allowed (LOCK-02). */
  essentials: string[];
  /** Log what's in front all day for the report, not only during sessions (Q-70). */
  trackAllDay: boolean;
  /** Q-72: during a session, work that belongs to another of your tasks shows as other productive work. */
  countOtherWork: boolean;
  openAtLogin: boolean;
  onboarded: boolean;
}

export interface EndAccess {
  /** The owner's development build: End works any time, at once (Q-69). */
  dev: boolean;
  goalReached: boolean;
  canEnd: boolean;
  emergencyLeft: number;
}

export interface Permissions {
  accessibility: boolean;
}

export interface Snapshot {
  session: Session | null;
  settings: Settings;
  history: number[];
  endAccess: EndAccess;
  permissions: Permissions;
  front: FrontItem | null;
  /** Added by the main process: "darwin" or "win32", and the OS helper's last error (for testers). */
  platform?: string;
  helperError?: string | null;
  /** Side tasks named this session (Q-72). */
  otherTasks?: string[];
  /** Automatic updates (Q-75) and the running version. */
  update?: { state: "off" | "idle" | "checking" | "downloading" | "ready" | "error"; version: string | null };
  appVersion?: string;
}

export type UiMessage =
  | { type: "get" }
  | { type: "start" }
  | { type: "setTasks"; labels: string[] }
  | { type: "toggle"; id: string; park: boolean }
  | { type: "confirm"; goalMin: number }
  | { type: "stop" }
  | { type: "end"; reason: string }
  | { type: "emergency"; reason: string; typed: string }
  | { type: "stepAway" }
  | { type: "resume" }
  | { type: "break"; min: number }
  | { type: "breakEnd" }
  | { type: "dismiss" }
  | { type: "addOther"; label: string }
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "sessions" }
  | { type: "activity"; from: number; to: number }
  | { type: "requestAccessibility" }
  | { type: "openPrivacyPane"; pane: "accessibility" | "automation" }
  | { type: "reopen"; index: number }
  | { type: "open"; page: "session" | "report" | "settings" }
  | { type: "installUpdate" };
