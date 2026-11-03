// Session engine for the desktop app (docs/03, docs/04, docs/11; owner rules Q-63..Q-70).
// Start → name the task from what's open → start screen (tasks, goal, what gets blocked) → Lock in
// → once a second: track what's in front, block distractions (close tabs, quit apps) → end by the
// rules of Q-69/Q-70. All state is saved to disk on every change, so a relaunch picks it up.

import {
  addPrototype,
  ACTIVE_TIME,
  ASK,
  autoLabel,
  BREAKS,
  breakMinutesAvailable,
  clampGoal,
  cosine,
  courseCodesIn,
  DESKTOP,
  EXITS,
  findExact,
  goalReached,
  hostMatchesAny,
  inferTask,
  isBail,
  isDomainOnly,
  itemDomain,
  itemText,
  MS,
  namedPureDistraction,
  nextState,
  normalizeLabel,
  OWNER_RULES,
  parseUrl,
  recentTasks,
  relatedness,
  THRESHOLDS,
  sameAsCandidates,
  SESSION,
  taskScore,
  validEndReason,
  WEB_MEETINGS,
  domainsOf,
  type SessionEvent,
  type Task,
} from "@tabhush/core";
import type { EndAccess, EndKind, FocusEntry, FrontItem, PreviewItem, Session, Settings, Snapshot } from "../shared/types";
import { asSessionLike, dayStart, focusSplit, offClockMs } from "../renderer/reportData";
import type { ActivityLog } from "./activity";
import { appKind, browserKind, stripBrowserSuffix, titleExcluded } from "./apps";
import type { Categories } from "./categories";
import type { Embed, Judge, SessionTask, Verdict } from "./judge";
import type { JsonStore } from "./store";
import type { AppInfo, BrowserTab, FrontInfo, System } from "./system";

export const DEFAULT_SETTINGS: Settings = { schoolSites: [], essentials: [], trackAllDay: true, countOtherWork: true, openAtLogin: true, onboarded: false };

/** What the item in front counts as in the report (Q-72). */
type WorkState = { state: "on" | "off" } | { state: "other"; task: string };

const COMMITTED: readonly string[] = ["ACTIVE", "ON_BREAK", "IDLE_PAUSED"];

export interface EngineDeps {
  store: JsonStore;
  system: System;
  judge: Judge;
  embed: Embed;
  activity: ActivityLog;
  categories: Categories;
  /** The owner's development build (not packaged): End works any time (Q-69). */
  dev: boolean;
  selfBundleId: string;
  openWindow: (page: "session" | "report" | "settings") => void;
  onChange: () => void;
  /** Q-70: ask the helper to reopen the app if it is killed while a session is locked. */
  setRelaunch: (on: boolean) => void;
  now?: () => number;
}

function newSession(now: number): Session {
  return {
    id: crypto.randomUUID(),
    state: "IDLE",
    startedAt: now,
    taskIds: [],
    taskLabel: null,
    suggestions: [],
    goalMin: null,
    preview: [],
    committedAt: null,
    blockEvents: [],
    lastParkAt: null,
    focusLog: [],
    breaks: [],
    pauses: [],
    idleSince: null,
    restoreList: [],
    musicVolumes: {},
    suspensions: [],
    suspendedFor: null,
    emergency: null,
    otherTaskIds: [],
    endCountdown: null,
    endedAt: null,
    endKind: null,
    bail: false,
    heartbeat: now,
    gaps: [],
  };
}

function apply(s: Session, event: SessionEvent): void {
  const next = nextState(s.state, event);
  if (next === null) throw new Error(`invalid transition ${s.state} --${event.type}-->`);
  s.state = next;
}

const combine = (members: Task[]): SessionTask =>
  members.length === 1
    ? { ...members[0]!, members }
    : {
        id: members.map((m) => m.id).sort().join("+"),
        label: members.map((m) => m.label).join(" + "),
        prototypes: [],
        createdAt: Math.min(...members.map((m) => m.createdAt)),
        lastUsedAt: Math.max(...members.map((m) => m.lastUsedAt)),
        members,
      };

export class Engine {
  session: Session | null;
  settings: Settings;
  private tasks: Task[];
  private chain: Promise<unknown> = Promise.resolve();
  private now: () => number;
  private lastFront: FrontItem | null = null;
  private frontApp: AppInfo | null = null;
  private verdicts = new Map<string, Verdict & { work?: WorkState }>();
  /** Key of the item last blocked → when, so one block is one event, not one per second. */
  private recentBlocks = new Map<string, number>();
  /** Apps we asked to quit: when, and which process, to tell "ignored the quit" from "opened again". */
  private quitAt = new Map<string, { at: number; pid: number | null }>();
  private locked = false;
  private lastSave = 0;
  private lastSweep = 0;
  private wasAway = false;

  constructor(private readonly d: EngineDeps) {
    this.now = d.now ?? Date.now;
    this.session = d.store.read<Session | null>("session", null);
    if (this.session) this.session.otherTaskIds ??= [];
    this.settings = { ...DEFAULT_SETTINGS, ...d.store.read<Partial<Settings>>("settings", {}) };
    this.tasks = d.store.read<Task[]>("tasks", []);
    if (this.session) d.judge.startSession(this.session.id);
    this.recoverAfterRestart();
  }

  // ───────────────────────── plumbing ─────────────────────────

  /** Serializes everything that reads and changes the session (UI calls and the tick). */
  run<T>(fn: () => Promise<T> | T): Promise<T> {
    const p = this.chain.then(fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  /** Saves the session; `notify` tells the pages to re-render (not for heartbeat-only saves). */
  private save(notify = true): void {
    this.d.store.write("session", this.session);
    this.lastSave = this.now();
    this.d.setRelaunch(!this.d.dev && this.session !== null && (COMMITTED.includes(this.session.state) || this.session.state === "END_COUNTDOWN"));
    if (notify) this.d.onChange();
  }

  private saveTasks(): void {
    this.d.store.write("tasks", this.tasks);
  }

  setSettings(patch: Partial<Settings>): Settings {
    // LOCK-01: settings are locked during a session.
    if (this.session && this.session.state !== "IDLE" && this.session.state !== "ENDED") throw new Error("Settings are locked until the session ends.");
    this.settings = { ...this.settings, ...patch };
    this.d.store.write("settings", this.settings);
    this.d.onChange();
    return this.settings;
  }

  pastSessions(): Session[] {
    return this.d.store.read<Session[]>("sessions", []);
  }

  sessionHistoryMinutes(): number[] {
    return this.pastSessions()
      .filter((p) => p.committedAt !== null && p.endedAt !== null)
      .sort((a, b) => a.endedAt! - b.endedAt!)
      .map((p) => (p.endedAt! - p.committedAt!) / MS.MINUTE);
  }

  async snapshot(): Promise<Snapshot> {
    return {
      session: this.session,
      settings: this.settings,
      history: this.sessionHistoryMinutes(),
      endAccess: this.endAccess(),
      permissions: { accessibility: await this.d.system.accessibilityTrusted(false) },
      front: this.lastFront,
      otherTasks: this.session ? this.otherTaskLabels(this.session) : [],
    };
  }

  /** The app was not running for a while mid-session (crash, force quit, shutdown): a gap, and the clock stops for it. */
  private recoverAfterRestart(): void {
    const s = this.session;
    if (!s || !(COMMITTED.includes(s.state) || s.state === "END_COUNTDOWN")) return;
    const now = this.now();
    if (now - s.heartbeat >= DESKTOP.GAP_MIN_SEC * MS.SECOND) {
      s.gaps.push({ from: s.heartbeat, to: now });
      if (s.state === "ACTIVE") s.pauses.push({ startedAt: s.heartbeat, endedAt: now, auto: true });
      this.logFocus(s, "away", {}, s.heartbeat);
    }
    s.heartbeat = now;
    this.save(false); // no pages are open yet
  }

  // ───────────────────────── tasks (CLS-30..33, CLS-50, Q-64) ─────────────────────────

  private async ensureLabelVector(task: Task): Promise<Task> {
    if (task.labelVector) return task;
    try {
      const [v] = await this.d.embed([task.label]);
      if (v) {
        task.labelVector = v;
        this.saveTasks();
      }
    } catch {
      // tier 2 unavailable: relatedness fails open
    }
    return task;
  }

  private async sessionTask(s: Session): Promise<SessionTask | null> {
    const members = s.taskIds.map((id) => this.tasks.find((t) => t.id === id)).filter((t): t is Task => !!t);
    return members.length ? combine(await Promise.all(members.map((m) => this.ensureLabelVector(m)))) : null;
  }

  private async resolveOrCreate(label: string): Promise<Task> {
    const exact = findExact(this.tasks, label);
    if (exact) return this.ensureLabelVector(exact);
    let vec: number[] | null = null;
    try {
      vec = (await this.d.embed([label]))[0] ?? null;
    } catch {
      vec = null;
    }
    const near = sameAsCandidates(label, this.tasks, (t) => (vec && t.labelVector ? cosine(vec, t.labelVector) : null))[0];
    if (near) return this.ensureLabelVector(near.task);
    const now = this.now();
    const task: Task = { id: crypto.randomUUID(), label: label.trim(), prototypes: [], createdAt: now, lastUsedAt: now, ...(vec ? { labelVector: vec } : {}) };
    this.tasks.push(task);
    this.saveTasks();
    return task;
  }

  private knownCourses(): string[] {
    return this.d.store.read<{ courses?: string[] }>("profile", {}).courses ?? [];
  }

  private rememberCourses(titles: string[]): void {
    const found = titles.flatMap(courseCodesIn);
    if (!found.length) return;
    this.d.store.write("profile", { courses: [...new Set([...this.knownCourses(), ...found])] });
  }

  /** Titles the app may learn from: never mail, chat, banking or excluded apps (PRIV-03, DSK-30). */
  private learnable(tabs: BrowserTab[]): BrowserTab[] {
    return tabs.filter((t) => {
      const p = parseUrl(t.url);
      return p !== null && (p.scheme === "http" || p.scheme === "https") && t.title.trim() && !isDomainOnly(p, this.d.categories.banking());
    });
  }

  // ───────────────────────── Start and the sweep (LOOP-01..04) ─────────────────────────

  start(): Promise<void> {
    return this.run(async () => {
      const existing = this.session;
      if (existing && existing.state !== "IDLE" && existing.state !== "ENDED") {
        this.d.openWindow("session");
        return;
      }
      const s = newSession(this.now());
      apply(s, { type: "START" });
      this.session = s;
      this.d.judge.startSession(s.id);
      this.verdicts.clear();
      // Snapshot before our window comes to the front.
      const [front, tabs] = await Promise.all([this.d.system.front(), this.d.system.tabs()]);
      this.save();
      this.d.openWindow("session");

      const learn = this.learnable(tabs);
      const frontTitle = front.tabTitle ?? (front.app && !titleExcluded(front.app.bundleId) ? stripBrowserSuffix(front.title, front.app.name) : "");
      const items = [
        ...(frontTitle ? [{ title: frontTitle, domain: front.url ? (itemDomain(front.url) ?? "") : (front.app?.name ?? ""), front: true }] : []),
        ...learn.filter((t) => t.url !== front.url).map((t) => ({ title: t.title, domain: itemDomain(t.url) ?? "", front: false })),
      ].slice(0, 30);
      this.rememberCourses(items.map((i) => i.title));
      let vectors: (number[] | null)[] = items.map(() => null);
      try {
        vectors = await this.d.embed(items.map((i) => itemText(i.title, i.domain)));
      } catch {
        // tier 2 unavailable: the task is named from the titles instead
      }
      const recent = await Promise.all(recentTasks(this.tasks, this.now()).map((t) => this.ensureLabelVector(t)));
      const forScore = items.map((i, n) => ({ vector: vectors[n] ?? null, front: i.front }));
      const scored = recent
        .map((task) => ({ task, score: taskScore(task, forScore) }))
        .filter((x): x is { task: Task; score: number } => x.score !== null)
        .sort((a, b) => b.score - a.score);
      const strong = scored.filter((x) => x.score >= OWNER_RULES.MULTI_TASK_MIN_SCORE).map((x) => x.task);
      const result = inferTask(recent, forScore);
      let chosen: Task[] = [];
      // Q-74: one task per session keeps the report clear; other tasks show up as side work.
      if (strong.length >= 2) chosen = [strong[0]!];
      else if (result.kind === "autofill") chosen = [result.task];
      else {
        const label = autoLabel(items.map((i) => ({ title: i.title, front: i.front })), this.knownCourses());
        if (label) chosen = [await this.resolveOrCreate(label)];
      }
      s.taskIds = chosen.map((t) => t.id);
      s.suggestions = scored
        .map((x) => x.task)
        .filter((t) => !s.taskIds.includes(t.id))
        .slice(0, ASK.CLARIFY_GUESSES)
        .map((t) => ({ taskId: t.id, label: t.label }));
      apply(s, { type: "INFER_CONFIDENT" });
      await this.buildPreview(s, tabs);
      this.save();
    });
  }

  setTasks(labelsIn: string[]): Promise<void> {
    return this.run(async () => {
      const s = this.session;
      if (s?.state !== "SWEEP_PREVIEW") return;
      // Q-74: one task per session; the last one picked or typed wins.
      const picked = labelsIn.filter((l) => normalizeLabel(l)).pop();
      const labels = picked ? [picked.trim()] : [];
      const chosen: Task[] = [];
      for (const l of labels) {
        const t = await this.resolveOrCreate(l);
        if (!chosen.some((c) => c.id === t.id)) chosen.push(t);
      }
      s.taskIds = chosen.map((t) => t.id);
      this.verdicts.clear();
      this.d.judge.startSession(s.id);
      await this.buildPreview(s, await this.d.system.tabs());
      this.save();
    });
  }

  private async buildPreview(s: Session, tabs: BrowserTab[]): Promise<void> {
    s.preview = [];
    const task = await this.sessionTask(s);
    s.taskLabel = task?.label ?? null;
    if (!task) return;
    let i = 0;
    for (const tab of tabs) {
      i++;
      const v = await this.d.judge.page(task, tab.url, tab.title);
      if (v.action === "park") {
        s.preview.push({ id: `tab:${i}`, kind: "tab", bundleId: tab.bundleId, url: tab.url, title: tab.title, label: itemDomain(tab.url) ?? tab.url, park: true });
      }
    }
    for (const app of await this.d.system.apps()) {
      if (app.regular === false) continue;
      const v = await this.d.judge.app(task, app, "");
      if (v.action === "park") s.preview.push({ id: `app:${app.bundleId}`, kind: "app", bundleId: app.bundleId, pid: app.pid, title: app.name, label: app.name, park: true });
    }
    s.suspensions = namedPureDistraction(task.label).map((name) => `${name} is in the task name but stays blocked.`);
  }

  toggle(id: string, park: boolean): Promise<void> {
    return this.run(() => {
      const item = this.session?.state === "SWEEP_PREVIEW" ? this.session.preview.find((p) => p.id === id) : undefined;
      if (item) {
        item.park = park;
        this.save();
      }
    });
  }

  confirm(goalMin: number): Promise<void> {
    return this.run(async () => {
      const s = this.session;
      if (s?.state !== "SWEEP_PREVIEW" || s.taskIds.length === 0) return;
      s.goalMin = clampGoal(goalMin);
      await this.sweep(s, s.preview.filter((p) => p.park));
      const task = await this.sessionTask(s);
      for (const m of task?.members ?? []) m.lastUsedAt = this.now();
      this.saveTasks();
      // Q-63: music keeps playing, quieter.
      for (const bundleId of DESKTOP.MUSIC_APPS) {
        const prev = await this.d.system.setVolume(bundleId, Math.round(OWNER_RULES.MUSIC_VOLUME * 100));
        if (prev !== null) s.musicVolumes[bundleId] = prev;
      }
      s.committedAt = this.now();
      s.heartbeat = s.committedAt;
      apply(s, { type: "CONFIRM" });
      this.logFocus(s, this.lastFront ? "on" : "away", this.lastFront ? { domain: this.lastFront.label, title: this.lastFront.title } : {});
      this.save();
    });
  }

  /** Closes the tabs and quits the apps in the list (Q-67: blocked means closed). */
  private async sweep(s: Session, items: PreviewItem[]): Promise<void> {
    const byBrowser = new Map<string, PreviewItem[]>();
    for (const item of items) {
      if (item.kind === "tab" && item.url) byBrowser.set(item.bundleId, [...(byBrowser.get(item.bundleId) ?? []), item]);
      if (item.kind === "app") await this.blockApp(s, item.bundleId, item.title, item.pid ?? null);
    }
    for (const [bundleId, list] of byBrowser) {
      await this.d.system.closeTabs(bundleId, list.map((t) => t.url!));
      for (const t of list) this.recordBlock(s, t.label, `tab:${t.url}`, { url: t.url, title: t.title, reason: "closed" });
    }
  }

  private recordBlock(s: Session, label: string, key: string, restore?: Session["restoreList"][number]): boolean {
    const now = this.now();
    const last = this.recentBlocks.get(key);
    this.recentBlocks.set(key, now);
    if (last !== undefined && now - last < 30 * MS.SECOND) return false;
    s.blockEvents.push({ at: now, domain: label });
    s.lastParkAt = now;
    if (restore && !s.restoreList.some((r) => r.url === restore.url && r.bundleId === restore.bundleId)) s.restoreList.push(restore);
    return true;
  }

  private async blockApp(s: Session, bundleId: string, name: string, pid: number | null = null): Promise<void> {
    const now = this.now();
    const prev = this.quitAt.get(bundleId);
    const sameProcess = prev !== undefined && (pid === null || prev.pid === null || prev.pid === pid);
    // DSK-10: quit. The same process still showing after REHIDE_AFTER_QUIT_SEC ignored the quit (a
    // save dialog, say) and is hidden each time it shows; a new process (opened again) is quit again.
    if (sameProcess && now - prev.at < DESKTOP.REHIDE_AFTER_QUIT_SEC * MS.SECOND) return;
    if (sameProcess) {
      await this.d.system.hide(bundleId);
    } else {
      await this.d.system.quit(bundleId);
      this.quitAt.set(bundleId, { at: now, pid });
    }
    if (this.recordBlock(s, name, `app:${bundleId}`, { bundleId, title: name, reason: "quit" })) {
      this.d.system.notify(`${name} is blocked`, `Not part of ${s.taskLabel ?? "your session"}. Back to it.`);
    }
  }

  // ───────────────────────── the tick: tracking and enforcement ─────────────────────────

  /** What is in front, in report terms. Non-regular apps (popups, agents) keep the last item. */
  describe(front: FrontInfo): FrontItem | null {
    const app = front.app;
    if (!app || app.regular === false) return this.lastFront;
    const kind = browserKind(app.bundleId);
    const excluded = titleExcluded(app.bundleId);
    const max = DESKTOP.APP_TITLE_MAX_CHARS;
    if (kind && front.url) {
      const p = parseUrl(front.url);
      const domain = itemDomain(front.url) ?? p?.host ?? app.name;
      const hideTitle = !p || isDomainOnly(p, this.d.categories.banking());
      const title = (front.tabTitle ?? stripBrowserSuffix(front.title, app.name)).slice(0, max);
      return { label: domain, app: app.name, bundleId: app.bundleId, url: front.url, domain, ...(hideTitle || !title ? {} : { title }) };
    }
    const title = (kind ? stripBrowserSuffix(front.title, app.name) : front.title).trim().slice(0, max);
    return { label: app.name, app: app.name, bundleId: app.bundleId, ...(excluded || !title ? {} : { title }) };
  }

  tick(): Promise<void> {
    return this.run(async () => {
      const now = this.now();
      const front = await this.d.system.front();
      const prevLabel = `${this.lastFront?.label}|${this.lastFront?.title}`;
      const item = this.describe(front);
      if (front.app && front.app.regular !== false) this.frontApp = front.app;
      this.lastFront = item;
      const s = this.session;
      let changed = prevLabel !== `${item?.label}|${item?.title}`;

      // No input for a while counts as away; a meeting or a video in front gets the longer grace (TIME-03).
      const watching = !!item && (DESKTOP.MEETING_APPS.includes(item.bundleId as never) || /youtube\.com\/watch/.test(item.url ?? "") || (!!item.url && hostMatchesAny(parseUrl(item.url)?.host ?? "", domainsOf(WEB_MEETINGS))));
      const idleSec = this.d.system.idleSeconds();
      const graceMin = watching ? ACTIVE_TIME.VIDEO_GRACE_MIN : ACTIVE_TIME.NO_INPUT_STOP_MIN;
      const away = this.locked || idleSec >= graceMin * 60;
      // Q-74: sitting there doing nothing is never work. When no-input is noticed, the minutes since
      // the last input come back out of the log as away time.
      if (away && !this.wasAway) this.d.activity.markAwaySince(this.locked ? now : now - idleSec * MS.SECOND);
      this.wasAway = away;

      let work: WorkState | undefined;
      if (s) {
        const before = s.state;
        await this.deadlines(s, now, away, idleSec);
        if (s.state === "ACTIVE" || s.state === "IDLE_PAUSED" || s.state === "END_COUNTDOWN") {
          work = await this.enforce(s, item, front);
        }
        if (s.state === "ACTIVE") {
          if (away) this.logFocus(s, "away", {}, s.idleSince ?? now);
          else if (item) this.logFocus(s, work?.state ?? "on", { domain: item.label, title: item.title, ...(work?.state === "other" ? { task: work.task } : {}) });
        }
        if (COMMITTED.includes(s.state) || s.state === "END_COUNTDOWN") s.heartbeat = now;
        // Q-74: tabs and apps behind the one in front (a show playing in a background tab, a game on
        // another screen) are checked every BACKGROUND_SWEEP_SEC too.
        if ((s.state === "ACTIVE" || s.state === "IDLE_PAUSED") && !s.suspendedFor && now - this.lastSweep >= DESKTOP.BACKGROUND_SWEEP_SEC * MS.SECOND) {
          this.lastSweep = now;
          const blocksBefore = s.blockEvents.length;
          await this.relock(s);
          changed ||= s.blockEvents.length !== blocksBefore;
        }
        changed ||= before !== s.state;
        if (changed) this.save();
        else if (now - this.lastSave >= 10 * MS.SECOND) this.save(false);
      }

      const inSession = !!s && s.committedAt !== null && s.endedAt === null;
      if (item && (this.settings.trackAllDay || inSession)) {
        this.d.activity.record(now, {
          state: away ? "away" : "active",
          label: item.label,
          app: item.app,
          bundleId: item.bundleId,
          ...(item.title ? { title: item.title } : {}),
          ...(item.domain ? { domain: item.domain } : {}),
          ...(inSession && s
            ? { sessionId: s.id, ...(work && !away ? { onTask: work.state !== "off", ...(work.state === "other" ? { otherTask: work.task } : {}) } : {}) }
            : {}),
        });
      }
      if (changed && !s) this.d.onChange();
    });
  }

  /** Countdown, break, idle and pause deadlines (what the extension used alarms for). */
  private async deadlines(s: Session, now: number, away: boolean, idleSec: number): Promise<void> {
    if (s.state === "END_COUNTDOWN" && s.endCountdown) {
      const sec = s.emergency ? OWNER_RULES.EMERGENCY_COUNTDOWN_SEC : EXITS.END_COUNTDOWN_SEC;
      if (now - s.endCountdown.startedAt >= sec * MS.SECOND) {
        const reached = goalReached(s.committedAt, s.goalMin, now, offClockMs(s, now));
        await this.finish(s, s.emergency ? "emergency" : reached ? "normal" : "early");
      }
      return;
    }
    if (s.state === "ON_BREAK") {
      const b = s.breaks[s.breaks.length - 1];
      if (b && now >= b.startedAt + b.plannedMin * MS.MINUTE) await this.endBreakNow(s);
      return;
    }
    if (s.state === "ACTIVE") {
      if (away && s.idleSince === null) s.idleSince = now - idleSec * MS.SECOND;
      if (!away) s.idleSince = null;
      // LOOP-11 / Q-69: 30 min without input pauses the session, backdated to when input stopped.
      if (s.idleSince !== null && now - s.idleSince >= SESSION.IDLE_PAUSE_AFTER_MIN * MS.MINUTE) this.pause(s, true, s.idleSince);
      return;
    }
    if (s.state === "IDLE_PAUSED") {
      const p = s.pauses[s.pauses.length - 1];
      if (p && now - p.startedAt >= SESSION.IDLE_END_AFTER_MIN * MS.MINUTE) {
        this.closeOffClock(s, now);
        apply(s, { type: "END_REQUESTED" });
        s.endCountdown = { startedAt: now, reason: "away too long" };
        await this.finish(s, goalReached(s.committedAt, s.goalMin, now, offClockMs(s, now)) ? "normal" : "idle");
      } else if (p?.auto && !away) {
        this.resumeNow(s);
      }
    }
  }

  /**
   * Q-72: allowed work that clearly belongs to another of your tasks (one you named this session,
   * or any task you've used before) is "other productive work" for that task, not this one.
   */
  private async workState(s: Session, task: SessionTask, text: string): Promise<WorkState> {
    if (!this.settings.countOtherWork || !text.trim()) return { state: "on" };
    const others = this.tasks.filter((t) => !s.taskIds.includes(t.id) && t.labelVector);
    if (!others.length) return { state: "on" };
    try {
      const v = await this.d.judge.vector(text);
      const rep = (t: Task) => ({ label: t.labelVector!, prototypes: t.prototypes.map((p) => p.vector) });
      const mine = Math.max(0, ...task.members.filter((m) => m.labelVector).map((m) => relatedness(v, rep(m))));
      // Tasks named this session win a tie with older ones.
      const scored = others
        .map((t) => ({ t, s: relatedness(v, rep(t)) + (s.otherTaskIds.includes(t.id) ? 1e-6 : 0) }))
        .sort((a, b) => b.s - a.s);
      const best = scored[0]!;
      if (mine < THRESHOLDS.ALLOW_MIN_S && best.s >= THRESHOLDS.ALLOW_MIN_S && best.s - mine >= OWNER_RULES.OTHER_WORK_MARGIN) {
        return { state: "other", task: best.t.label };
      }
    } catch {
      // tier 2 unavailable: counted as this task, as before
    }
    return { state: "on" };
  }

  /** Q-72: "I'm also doing X" during a session, so that work is recognized as other productive work. */
  addOtherTask(label: string): Promise<boolean> {
    return this.run(async () => {
      const s = this.session;
      if (!s || !COMMITTED.includes(s.state) || !normalizeLabel(label)) return false;
      const t = await this.resolveOrCreate(label);
      if (s.taskIds.includes(t.id)) return false;
      if (!s.otherTaskIds.includes(t.id)) s.otherTaskIds.push(t.id);
      this.verdicts.clear(); // re-sort what's open against the new task
      this.save();
      return true;
    });
  }

  /** Labels of the tasks named as side work this session. */
  otherTaskLabels(s: Session): string[] {
    return (s.otherTaskIds ?? []).map((id) => this.tasks.find((t) => t.id === id)?.label).filter((l): l is string => !!l);
  }

  /** Judges what's in front and blocks it if it's a distraction. Returns what it counts as. */
  private async enforce(s: Session, item: FrontItem | null, front: FrontInfo): Promise<WorkState | undefined> {
    const app = front.app;
    if (!item || !app || app.regular === false) return undefined;
    const task = await this.sessionTask(s);
    if (!task) return undefined;
    const kind = appKind(app, this.d.selfBundleId);

    // DSK-10: a proctoring app suspends enforcement while it runs.
    if (kind === "proctoring") {
      if (s.suspendedFor !== app.name) {
        s.suspendedFor = app.name;
        this.d.system.notify(`${app.name} is running`, "Tabhush stepped back so it can do its job.");
      }
      return { state: "on" };
    }
    if (s.suspendedFor) {
      const still = (await this.d.system.apps()).some((a) => a.name === s.suspendedFor);
      if (still) return { state: "on" };
      s.suspendedFor = null;
    }

    const fingerprint = `${app.bundleId}\n${front.url ?? ""}\n${item.title ?? front.title}`;
    let v = this.verdicts.get(fingerprint);
    if (!v) {
      if (kind === "browser") {
        v = front.url ? await this.d.judge.page(task, front.url, front.tabTitle ?? item.title ?? "") : await this.d.judge.titleOnly(task, stripBrowserSuffix(front.title, app.name));
      } else {
        v = await this.d.judge.app(task, app, titleExcluded(app.bundleId) ? "" : front.title);
      }
      if (this.verdicts.size > 2000) this.verdicts.clear();
      if (v.action === "allow") {
        // CLS-32: pages kept for the task teach it (prototypes), from strong similarity only; once per item.
        if (kind === "browser" && front.url && v.source === "similarity" && (v.s ?? 0) >= THRESHOLDS.ALLOW_MIN_S) await this.seedPrototype(task, front.url, item.title ?? "");
        const text = kind === "browser" ? itemText(item.title ?? "", item.domain ?? "") : kind === "tool" || kind === "other" || kind === "meeting" ? itemText(item.title ?? "", app.name) : "";
        v = { ...v, work: text ? await this.workState(s, task, text) : { state: "on" } };
      }
      this.verdicts.set(fingerprint, v);
    }
    if (v.action === "allow") return v.work ?? { state: "on" };
    if (kind === "browser") {
      const closed = front.url
        ? (await this.d.system.closeTabs(app.bundleId, [front.url])) > 0
        : await this.d.system.closeFrontTab(app.bundleId, front.title);
      if (closed) {
        this.verdicts.delete(fingerprint);
        if (this.recordBlock(s, item.label, `tab:${front.url ?? front.title}`, { url: front.url, title: item.title ?? item.label, reason: "closed" })) {
          this.d.system.notify(`Closed ${item.label}`, `Not part of ${s.taskLabel ?? "your session"}.`);
        }
      }
    } else {
      await this.blockApp(s, app.bundleId, app.name, app.pid);
    }
    return { state: "off" };
  }

  private async seedPrototype(task: SessionTask, url: string, title: string): Promise<void> {
    try {
      const vec = await this.d.judge.vector(itemText(title, itemDomain(url) ?? ""));
      // With several tasks, the prototype goes to the closest one.
      const owner = task.members
        .filter((m) => m.labelVector)
        .sort((a, b) => cosine(vec, b.labelVector!) - cosine(vec, a.labelVector!))[0] ?? task.members[0]!;
      const stored = this.tasks.find((t) => t.id === owner.id);
      if (stored && addPrototype(stored, vec, { kind: "similarity", s: 0.45 }, this.now())) this.saveTasks();
    } catch {
      // tier 2 unavailable
    }
  }

  private logFocus(s: Session, state: FocusEntry["state"], where: { domain?: string; title?: string; task?: string } = {}, at = this.now()): void {
    if (state !== "away" && s.state !== "ACTIVE") return;
    const last = s.focusLog[s.focusLog.length - 1];
    if (last && last.state === state && (state === "away" || (last.domain === where.domain && last.title === where.title && last.task === where.task))) return;
    const t = Math.max(at, last?.at ?? at);
    s.focusLog.push(
      state === "away"
        ? { at: t, state }
        : { at: t, state, ...(where.domain ? { domain: where.domain } : {}), ...(where.title ? { title: where.title } : {}), ...(where.task ? { task: where.task } : {}) },
    );
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
  }

  // ───────────────────────── breaks (LOOP-08, Q-34) ─────────────────────────

  breakAvailable(s: Session): number {
    const used = s.breaks.reduce((sum, b) => sum + b.plannedMin, 0);
    return breakMinutesAvailable(focusSplit(asSessionLike(s), this.now()).on, used);
  }

  startBreak(min: number): Promise<boolean> {
    return this.run(() => {
      const s = this.session;
      if (s?.state !== "ACTIVE" || !(BREAKS.OPTIONS_MIN as readonly number[]).includes(min) || this.breakAvailable(s) < min) return false;
      s.breaks.push({ startedAt: this.now(), plannedMin: min, endedAt: null });
      apply(s, { type: "BREAK_START" });
      this.logFocus(s, "away");
      this.save();
      return true;
    });
  }

  endBreak(): Promise<void> {
    return this.run(async () => {
      if (this.session?.state === "ON_BREAK") await this.endBreakNow(this.session);
    });
  }

  private async endBreakNow(s: Session): Promise<void> {
    this.closeOffClock(s, this.now());
    apply(s, { type: "BREAK_END" });
    this.verdicts.clear();
    await this.relock(s);
    this.save();
  }

  /** After a break, everything opened meanwhile is judged again (LOOP-08). */
  private async relock(s: Session): Promise<void> {
    const task = await this.sessionTask(s);
    if (!task) return;
    const items: PreviewItem[] = [];
    let i = 0;
    for (const tab of await this.d.system.tabs()) {
      i++;
      if ((await this.d.judge.page(task, tab.url, tab.title)).action === "park") items.push({ id: `tab:${i}`, kind: "tab", bundleId: tab.bundleId, url: tab.url, title: tab.title, label: itemDomain(tab.url) ?? tab.url, park: true });
    }
    for (const app of await this.d.system.apps()) {
      if (app.regular !== false && (await this.d.judge.app(task, app, "")).action === "park") items.push({ id: `app:${app.bundleId}`, kind: "app", bundleId: app.bundleId, pid: app.pid, title: app.name, label: app.name, park: true });
    }
    await this.sweep(s, items);
  }

  // ───────────────────────── Step away (Q-69) ─────────────────────────

  private pause(s: Session, auto: boolean, since: number): void {
    s.pauses.push({ startedAt: since, endedAt: null, auto });
    this.logFocus(s, "away", {}, since);
    apply(s, { type: "PAUSE" });
  }

  stepAway(): Promise<boolean> {
    return this.run(() => {
      const s = this.session;
      if (s?.state !== "ACTIVE") return false;
      this.pause(s, false, this.now());
      this.save();
      return true;
    });
  }

  private resumeNow(s: Session): void {
    this.closeOffClock(s, this.now());
    apply(s, { type: "RESUME" });
    s.idleSince = null;
  }

  resume(): Promise<boolean> {
    return this.run(() => {
      const s = this.session;
      if (s?.state !== "IDLE_PAUSED") return false;
      this.resumeNow(s);
      this.save();
      return true;
    });
  }

  private closeOffClock(s: Session, now: number): void {
    if (s.state === "ON_BREAK") {
      const b = s.breaks[s.breaks.length - 1];
      if (b && b.endedAt === null) b.endedAt = now;
    }
    if (s.state === "IDLE_PAUSED") {
      const p = s.pauses[s.pauses.length - 1];
      if (p && p.endedAt === null) p.endedAt = now;
    }
  }

  // ───────────────────────── ending (LOCK-04, Q-64, Q-69, Q-70) ─────────────────────────

  emergencyStopsLeft(): number {
    const from = dayStart(this.now());
    const used = this.pastSessions().filter((p) => p.endKind === "emergency" && (p.endedAt ?? 0) >= from).length;
    return Math.max(0, OWNER_RULES.EMERGENCY_STOPS_PER_DAY - used);
  }

  endAccess(): EndAccess {
    const s = this.session;
    const now = this.now();
    const dev = this.d.dev && OWNER_RULES.DEV_INSTALL_ENDS_ANYTIME;
    const reached = !!s && goalReached(s.committedAt, s.goalMin, now, offClockMs(s, now));
    const committed = !!s && COMMITTED.includes(s.state);
    return { dev, goalReached: reached, canEnd: !!s && (!committed || dev || reached), emergencyLeft: this.emergencyStopsLeft() };
  }

  /** Past the goal, Stop ends at once as a normal end (Q-64). */
  stop(): Promise<boolean> {
    return this.run(async () => {
      const s = this.session;
      const now = this.now();
      if (!s || !["ACTIVE", "END_COUNTDOWN", "ON_BREAK", "IDLE_PAUSED"].includes(s.state) || !goalReached(s.committedAt, s.goalMin, now, offClockMs(s, now))) return false;
      this.closeOffClock(s, now);
      if (s.state !== "END_COUNTDOWN") apply(s, { type: "END_REQUESTED" });
      s.endCountdown = { startedAt: now, reason: "goal reached" };
      await this.finish(s, "normal");
      return true;
    });
  }

  /**
   * End: before Lock in, or past the goal, a one-line reason starts the 30 s countdown. A locked
   * session before its goal can't be ended, except on the owner's development build, which ends at once.
   */
  requestEnd(reason: string): Promise<boolean> {
    return this.run(async () => {
      const s = this.session;
      if (!s || !validEndReason(reason) || ["END_COUNTDOWN", "ENDED", "IDLE"].includes(s.state)) return false;
      const access = this.endAccess();
      if (!access.canEnd) return false;
      const now = this.now();
      const committed = COMMITTED.includes(s.state);
      s.bail = isBail("end", now, s.lastParkAt);
      s.endCountdown = { startedAt: now, reason: reason.trim() };
      this.closeOffClock(s, now);
      apply(s, { type: "END_REQUESTED" });
      if (!committed || (access.dev && !access.goalReached)) {
        await this.finish(s, "early");
        return true;
      }
      this.save();
      return true;
    });
  }

  /**
   * The fail-safe for a real emergency (Q-69, Q-70): a reason, the passage retyped exactly (the
   * task), then a 60 s countdown with blocks still on. Once a day; shows in the report.
   */
  emergencyStop(reason: string, typed: string): Promise<boolean> {
    return this.run(() => {
      const s = this.session;
      if (!s || !COMMITTED.includes(s.state) || !validEndReason(reason)) return false;
      if (passageMatches(typed) === false || this.emergencyStopsLeft() < 1) return false;
      const now = this.now();
      s.emergency = { at: now, reason: reason.trim() };
      s.bail = isBail("end", now, s.lastParkAt);
      s.endCountdown = { startedAt: now, reason: reason.trim() };
      this.closeOffClock(s, now);
      apply(s, { type: "END_REQUESTED" });
      this.save();
      return true;
    });
  }

  private async finish(s: Session, kind: EndKind): Promise<void> {
    for (const [bundleId, level] of Object.entries(s.musicVolumes)) await this.d.system.setVolume(bundleId, level);
    s.musicVolumes = {};
    this.logFocus(s, "away");
    s.endedAt = this.now();
    s.endKind = kind;
    if (kind === "normal") s.bail = false;
    apply(s, { type: "END_COUNTDOWN_DONE" });
    // Only sessions that were locked in go to the report; a cancelled start screen leaves nothing.
    if (s.committedAt !== null) this.d.store.write("sessions", [...this.pastSessions().filter((p) => p.id !== s.id), s]);
    this.d.activity.flush(this.now());
    this.save();
    if (s.committedAt !== null) this.d.openWindow("session");
  }

  dismiss(): Promise<void> {
    return this.run(() => {
      if (this.session?.state !== "ENDED") return;
      this.session = null;
      this.save();
    });
  }

  /** True while quitting must be refused (Q-70): a locked session on someone else's install. */
  quitBlocked(): boolean {
    const s = this.session;
    return !this.d.dev && !!s && (COMMITTED.includes(s.state) || s.state === "END_COUNTDOWN");
  }
}

/** The emergency task: the passage retyped exactly; spacing and curly quotes don't count against you. */
export function passageMatches(typed: string): boolean {
  const norm = (t: string) => t.replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
  return norm(typed) === norm(DESKTOP.EMERGENCY_PASSAGE);
}
