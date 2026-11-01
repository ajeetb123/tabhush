// Session engine: Start → infer → clarify → sweep preview → Confirm (+30 s undo) → judge every
// new item → End. Beta 1 scope (docs/13). Requirement IDs are cited inline.

import {
  addPrototype,
  askBudgetAvailable,
  assertLabelSource,
  buildInferLabelRequest,
  buildJudgeRequest,
  buildOverrideRequest,
  buildReviewRecord,
  cacheKey,
  canAutoCommit,
  cosine,
  EXITS,
  findExact,
  inferTask,
  isBail,
  itemDomain,
  itemKeyFor,
  itemText,
  judge,
  liftedPreBlockDomains,
  MS,
  namedPureDistraction,
  needsConsentPrompt,
  normalizeLabel,
  parseUrl,
  PERF_EXTENSION,
  PROVIDER,
  productionRedactor,
  pruneAskTimes,
  pureDistractionDomain,
  recentTasks,
  relatedness,
  sameAsCandidates,
  tier1,
  tier3Available,
  undoOpen,
  validEndReason,
  VerdictCache,
  type Decision,
  type ItemKey,
  type Label,
  type LabelSource,
  type PrototypeSource,
  type Redactor,
  type Task,
  type Tier1Context,
  ActiveMinuteCounter,
} from "@lockin/core";
import { db, idbCacheStore, labels, review, tasks } from "./db";
import { embed } from "./embedder";
import { installPreBlocks, parkTab, removePreBlocks, sendToTab, unparkTab } from "./enforce";
import { apply, newSession, saveSession, withSession, type ActiveSession } from "./session";
import { bump, getInternal, getSettings, setInternal } from "./settings";
import { backendConfigured, BackendUnavailable, CapReached, inferLabelRemote, judgeRemote, utcDay } from "./tier3Client";

export const END_ALARM = "end-countdown";
const SESSION_PAGE = "ui/session.html";
const CONSENT_PAGE = "ui/consent.html";

// Dictionaries are TODO_Q14 and patterns TODO_Q15, so this is null and tier 3 stays off (INV-08).
const redactor: Redactor | null = productionRedactor(() => null);

// ───────────────────────── classifier wiring ─────────────────────────

function cacheFor(s: ActiveSession | null, configVersion: number): VerdictCache {
  return new VerdictCache(idbCacheStore, { now: Date.now, sessionId: () => s?.id ?? null, configVersion: () => configVersion });
}

async function tier1Context(): Promise<Tier1Context> {
  const settings = await getSettings();
  return {
    essentials: settings.essentials,
    schoolCoursewareDomains: [], // onboarding school domains: beta 2, mapping TODO_Q10
    coursewareFingerprint: false, // page fingerprint method TODO_Q10
    ownExtensionId: chrome.runtime.id,
  };
}

interface Tier3Ready {
  redact: Redactor;
  domainOnly: boolean;
}

/** Returns what is needed to call tier 3, or null when any gate is closed (INV-08/10/11, CLS-12). */
async function tier3Ready(): Promise<Tier3Ready | null> {
  const settings = await getSettings();
  const internal = await getInternal();
  const gate = {
    consent: settings.consent,
    onDeviceOnlySetting: settings.onDeviceOnly,
    underDigitalConsentAge: settings.underDigitalConsentAge,
    providerZdrApproved: PROVIDER.ZDR_APPROVED,
    capReached: internal.capReachedDay === utcDay(Date.now()),
    redactorReady: redactor !== null,
    backendConfigured: backendConfigured(),
  };
  if (needsConsentPrompt(gate) && !internal.consentPromptShown && gate.redactorReady && gate.backendConfigured) {
    // PRIV-60: show exactly what gets sent before the first tier 3 call.
    await setInternal({ consentPromptShown: true });
    await chrome.tabs.create({ url: chrome.runtime.getURL(CONSENT_PAGE) });
  }
  if (!tier3Available(gate) || !redactor) return null;
  return { redact: redactor, domainOnly: settings.domainOnly };
}

const vectorCache = new Map<string, number[]>();

async function itemVector(url: string, title: string): Promise<number[]> {
  const text = itemText(title, itemDomain(url) ?? "");
  const hit = vectorCache.get(text);
  if (hit) return hit;
  const [v] = await embed([text]);
  if (!v) throw new Error("no vector");
  vectorCache.set(text, v);
  return v;
}

async function ensureLabelVector(task: Task): Promise<Task> {
  if (task.labelVector) return task;
  try {
    const [v] = await embed([task.label]);
    if (v) {
      task.labelVector = v;
      await tasks.put(task);
    }
  } catch {
    // Tier 2 unavailable: relatedness fails open below.
  }
  return task;
}

export async function judgeItem(s: ActiveSession, task: Task, url: string, title: string): Promise<{ decision: Decision; key: ItemKey }> {
  const key = itemKeyFor(url) ?? { kind: "page", value: url };
  const internal = await getInternal();
  const ready = await tier3Ready();
  const t1 = tier1(url, await tier1Context());
  try {
    const decision = await judge({
      taskId: task.id,
      itemKey: key,
      tier1: t1,
      overridden: cacheKey(task.id, key) in s.overrides,
      cache: cacheFor(s, internal.configVersion),
      relatedness: async () => {
        if (!task.labelVector) throw new Error("tier 2 unavailable");
        return relatedness(await itemVector(url, title), { label: task.labelVector, prototypes: task.prototypes.map((p) => p.vector) });
      },
      memory: async () => null, // personal memory: beta 2 (CLS-22)
      tier3: ready
        ? async () => {
            const req = buildJudgeRequest({ redact: ready.redact, domainOnlySetting: ready.domainOnly }, task.label, url, title);
            if (!req) throw new BackendUnavailable("unparseable URL");
            return judgeRemote(req);
          }
        : null,
      onDeviceParkingPath: false, // CLS-21: beta 2
      onDeviceCategory: null,
      askBudgetAvailable: () => askBudgetAvailable(s.asks, Date.now()),
    });
    return { decision, key };
  } catch (e) {
    // INV-06: no tier confident (tier 2 down, unexpected error) → allow and flag.
    return { decision: { action: "allow_and_flag", source: "fail_open", tier3Failed: e instanceof CapReached || e instanceof BackendUnavailable }, key };
  }
}

async function addLabel(task: Task, itemKey: string, related: boolean, source: LabelSource, vector?: number[]): Promise<void> {
  assertLabelSource(source); // INV-13
  const label: Label = { taskId: task.id, itemKey, related, source, createdAt: Date.now(), ...(vector ? { vector } : {}) };
  await labels.add(label);
}

async function seedPrototype(task: Task, url: string, title: string, src: PrototypeSource): Promise<void> {
  try {
    if (addPrototype(task, await itemVector(url, title), src, Date.now())) await tasks.put(task);
  } catch {
    // tier 2 unavailable: no prototype
  }
}

// ───────────────────────── Start, inference, clarify (LOOP-01..03, CLS-50) ─────────────────────────

async function snapshot(): Promise<{ all: chrome.tabs.Tab[]; frontWindowId: number | undefined; frontTab: chrome.tabs.Tab | undefined }> {
  const all = await chrome.tabs.query({});
  all.sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0)); // recent first (LOOP-04)
  const front = await chrome.windows.getLastFocused().catch(() => undefined);
  const frontTab = all.find((t) => t.active && t.windowId === front?.id);
  return { all, frontWindowId: front?.id, frontTab };
}

function usableTitle(tab: chrome.tabs.Tab): boolean {
  const parsed = tab.url ? parseUrl(tab.url) : null;
  if (!parsed || !tab.title?.trim()) return false;
  return parsed.scheme === "http" || parsed.scheme === "https";
}

export async function start(): Promise<void> {
  await withSession(async (existing) => {
    if (existing && existing.state !== "IDLE") return;
    const s = newSession(Date.now());
    apply(s, { type: "START" });
    // Snapshot first: opening the session page would otherwise become the front tab.
    const { all, frontTab } = await snapshot();
    s.startFront = { tabId: frontTab?.id ?? null, windowId: frontTab?.windowId ?? null, groupId: frontTab?.groupId ?? chrome.tabGroups.TAB_GROUP_ID_NONE };
    await saveSession(s);
    await chrome.tabs.create({ url: chrome.runtime.getURL(SESSION_PAGE) });

    const recentTabs = all.filter(usableTitle).slice(0, PERF_EXTENSION.START_JUDGE_RECENT_TABS);
    let vectors: (number[] | null)[] = recentTabs.map(() => null);
    try {
      vectors = await embed(recentTabs.map((t) => itemText(t.title ?? "", itemDomain(t.url!) ?? "")));
    } catch {
      // tier 2 unavailable → thin signal → clarify
    }
    const now = Date.now();
    const recent = await Promise.all(recentTasks(await tasks.all(), now).map(ensureLabelVector));
    const result = inferTask(
      recent,
      recentTabs.map((t, i) => ({ vector: vectors[i] ?? null, front: t.id === frontTab?.id })),
    );

    if (result.kind === "autofill") {
      s.chip = { label: result.task.label, taskId: result.task.id, renamed: false };
      apply(s, { type: "INFER_CONFIDENT" });
      await saveSession(s);
      await buildPreview(s);
      return;
    }
    // No recent task fits: the LLM proposes a label from redacted front-window titles (CLS-50).
    if (result.reason === "no_recent_task") {
      const ready = await tier3Ready();
      const frontTabs = all.filter((t) => t.windowId === frontTab?.windowId && usableTitle(t));
      const req = ready ? buildInferLabelRequest({ redact: ready.redact, domainOnlySetting: ready.domainOnly }, frontTabs.map((t) => ({ url: t.url!, title: t.title! }))) : null;
      const proposal = req ? await inferLabelRemote(req).catch(() => null) : null;
      if (proposal) {
        s.chip = { label: proposal.label, taskId: null, renamed: false };
        apply(s, { type: "INFER_CONFIDENT" });
        await saveSession(s);
        await buildPreview(s);
        return;
      }
    }
    s.clarify = { guesses: result.guesses.map((t) => ({ taskId: t.id, label: t.label })) };
    apply(s, { type: "INFER_UNSURE" });
    await saveSession(s);
  });
}

async function createTask(label: string): Promise<Task> {
  const now = Date.now();
  const task: Task = { id: crypto.randomUUID(), label: label.trim(), prototypes: [], createdAt: now, lastUsedAt: now };
  await tasks.put(task);
  return ensureLabelVector(task);
}

/** Exact match merges silently; a near match asks "Same as X?" (CLS-31); otherwise a new task. */
async function resolveLabel(s: ActiveSession, label: string): Promise<"resolved" | "same_as"> {
  const all = await tasks.all();
  const exact = findExact(all, label);
  if (exact) {
    s.chip = { label: exact.label, taskId: exact.id, renamed: s.chip?.renamed ?? false };
    return "resolved";
  }
  let labelVec: number[] | null = null;
  try {
    labelVec = (await embed([label]))[0] ?? null;
  } catch {
    labelVec = null;
  }
  const candidates = sameAsCandidates(label, all, (t) => (labelVec && t.labelVector ? cosine(labelVec, t.labelVector) : null));
  if (candidates.length > 0) {
    s.sameAs = { label, candidates: candidates.map((c) => ({ taskId: c.task.id, label: c.task.label })) };
    return "same_as";
  }
  s.chip = { label: label.trim(), taskId: null, renamed: s.chip?.renamed ?? false };
  return "resolved";
}

export async function clarify(label: string): Promise<void> {
  await withSession(async (s) => {
    if (!s || s.state !== "CLARIFY" || !normalizeLabel(label)) return;
    if ((await resolveLabel(s, label)) === "same_as") return void (await saveSession(s));
    s.clarify = null;
    apply(s, { type: "CLARIFY_ANSWERED" });
    await saveSession(s);
    await buildPreview(s, { clarifyAnswer: true });
  });
}

/** "Same as X?" answer. Prompt details are OPEN Q-35; "No" creates a new task. */
export async function sameAs(taskId: string | null): Promise<void> {
  await withSession(async (s) => {
    if (!s?.sameAs) return;
    const chosen = taskId ? s.sameAs.candidates.find((c) => c.taskId === taskId) : undefined;
    s.chip = chosen ? { label: chosen.label, taskId: chosen.taskId, renamed: s.chip?.renamed ?? false } : { label: s.sameAs.label, taskId: null, renamed: s.chip?.renamed ?? false };
    s.sameAs = null;
    const fromClarify = s.state === "CLARIFY";
    if (fromClarify) {
      s.clarify = null;
      apply(s, { type: "CLARIFY_ANSWERED" });
    }
    await saveSession(s);
    await buildPreview(s, { clarifyAnswer: fromClarify });
  });
}

/** Renaming the chip before the sweep is the inference-accuracy signal (LOOP-02, docs/14). */
export async function rename(label: string): Promise<void> {
  await withSession(async (s) => {
    if (!s || s.state !== "SWEEP_PREVIEW" || !s.chip || !normalizeLabel(label)) return;
    if (normalizeLabel(label) === normalizeLabel(s.chip.label)) return;
    if (!s.chip.renamed) await bump("chip_renames");
    s.chip.renamed = true;
    if ((await resolveLabel(s, label)) === "same_as") return void (await saveSession(s));
    await saveSession(s);
    await buildPreview(s);
  });
}

async function chipTask(s: ActiveSession): Promise<Task> {
  if (!s.chip) throw new Error("no task chip");
  if (s.chip.taskId) {
    const t = await tasks.get(s.chip.taskId);
    if (t) return ensureLabelVector(t);
  }
  const t = await createTask(s.chip.label);
  s.chip.taskId = t.id;
  return t;
}

// ───────────────────────── Sweep (LOOP-04, CLS-34) ─────────────────────────

async function buildPreview(s: ActiveSession, opts: { clarifyAnswer?: boolean } = {}): Promise<void> {
  const task = await chipTask(s);
  s.taskId = task.id;
  s.taskLabel = task.label;
  s.preview = [];
  s.separate = [];
  const { all } = await snapshot();
  const frontWindowId = s.startFront.windowId ?? undefined;
  const frontTab = all.find((t) => t.id === s.startFront.tabId);

  if (opts.clarifyAnswer && frontTab?.url && usableTitle(frontTab)) {
    // LOOP-03: the clarify answer is a strong label.
    const k = itemKeyFor(frontTab.url);
    if (k) await addLabel(task, cacheKey(task.id, k), true, "clarify");
  }

  const frontGroup = s.startFront.groupId;
  const ownPage = chrome.runtime.getURL("");
  const contextOf = (t: chrome.tabs.Tab): string | null => {
    if (t.url?.startsWith(ownPage)) return null; // the app's own pages are never part of a context
    if (frontWindowId !== undefined && t.windowId !== frontWindowId) return `window:${t.windowId}`;
    if (t.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE && t.groupId !== frontGroup) return `group:${t.groupId}`;
    return null;
  };

  const related = new Map<string, boolean>();
  const members = new Map<string, chrome.tabs.Tab[]>();
  let judged = 0;
  for (const tab of all) {
    if (!tab.id || !tab.url) continue;
    const ctx = contextOf(tab);
    if (ctx) members.set(ctx, [...(members.get(ctx) ?? []), tab]);
    const { decision, key } = await judgeItem(s, task, tab.url, tab.title ?? "");
    if (decision.source === "tier3") s.tier3Uncontested.push({ itemKey: cacheKey(task.id, key), related: decision.action === "allow" });
    if (decision.action === "allow" && ctx) related.set(ctx, true);
    if (decision.action === "allow_and_flag" || decision.action === "ask") s.flagged.push(cacheKey(task.id, key)); // the preview is the ask
    if (decision.action === "park") {
      s.preview.push({ tabId: tab.id, url: tab.url, title: tab.title ?? "", domain: itemDomain(tab.url) ?? "", itemKey: cacheKey(task.id, key), park: true, ...(ctx ? { contextId: ctx } : {}) });
    }
    // The 30 most recent tabs land in the preview first (PERF budget); the rest follow.
    if (++judged === PERF_EXTENSION.START_JUDGE_RECENT_TABS) await saveSession(s);
  }

  // A separate window or group that does not match the task is asked about as a whole (LOOP-02).
  for (const [id, tabsIn] of members) {
    if (related.get(id)) continue;
    const isWindow = id.startsWith("window:");
    let title = isWindow ? `Another window (${tabsIn.length} tabs)` : `Tab group (${tabsIn.length} tabs)`;
    if (!isWindow) {
      const g = await chrome.tabGroups.get(Number(id.slice("group:".length))).catch(() => null);
      if (g?.title) title = `Tab group “${g.title}” (${tabsIn.length} tabs)`;
    }
    s.separate.push({ id, kind: isWindow ? "window" : "group", title, tabIds: tabsIn.map((t) => t.id!), park: null });
  }
  s.preview = s.preview.filter((p) => !p.contextId || related.get(p.contextId));

  for (const name of namedPureDistraction(task.label)) s.suspensions.push(`${name} named in the task: still blocked (needs an override)`);
  s.liftedDomains = liftedPreBlockDomains(task.label);
  for (const d of s.liftedDomains) s.suspensions.push(`${d}: domain-wide pre-block lifted (named in the task); pages still judged`);
  await saveSession(s);

  const internal = await getInternal();
  // Session 6+ auto-commits only at high confidence, which is TODO_Q16(a): always waits for now.
  if (canAutoCommit(internal.committedSessions, 0)) await commit(s, "AUTO_COMMIT");
}

export async function togglePreview(tabId: number, park: boolean): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "SWEEP_PREVIEW") return;
    const item = s.preview.find((p) => p.tabId === tabId);
    if (item) item.park = park;
    await saveSession(s);
  });
}

export async function answerSeparate(contextId: string, park: boolean): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "SWEEP_PREVIEW") return;
    const c = s.separate.find((x) => x.id === contextId);
    if (c) c.park = park;
    await saveSession(s);
  });
}

export async function confirm(): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "SWEEP_PREVIEW" || s.separate.some((c) => c.park === null)) return;
    await commit(s, "CONFIRM");
  });
}

async function recordPark(s: ActiveSession, tab: chrome.tabs.Tab, itemKey: string, source: string, bySweep: boolean, canOverride: boolean): Promise<void> {
  const outcome = await parkTab(tab, s.taskLabel ?? "", canOverride);
  const now = Date.now();
  if (outcome === "closed") s.restoreList.push({ url: tab.url ?? "", title: tab.title ?? "", reason: "closed" });
  else s.parked[String(tab.id)] = { tabId: tab.id!, url: tab.url ?? "", title: tab.title ?? "", itemKey, at: now, bySweep, source };
  s.lastParkAt = now;
  await bump("parks");
}

async function commit(s: ActiveSession, how: "CONFIRM" | "AUTO_COMMIT"): Promise<void> {
  const task = await chipTask(s);
  const internal = await getInternal();
  const canOverride = (await tier3Ready()) !== null;
  for (const item of s.preview) {
    const tab = await chrome.tabs.get(item.tabId).catch(() => null);
    if (!tab) continue;
    if (item.park) {
      await recordPark(s, tab, item.itemKey, "sweep", true, canOverride);
    } else {
      // A keep: strong related label, prototype, cached allow (LOOP-04, CLS-32).
      const key = itemKeyFor(item.url);
      if (key) await cacheFor(s, internal.configVersion).record(task.id, key, { decision: "allow" });
      await addLabel(task, item.itemKey, true, "sweep_keep");
      await seedPrototype(task, item.url, item.title, { kind: "sweep_keep" });
    }
  }
  for (const c of s.separate) {
    for (const tabId of c.tabIds) {
      const tab = await chrome.tabs.get(tabId).catch(() => null);
      if (!tab?.url) continue;
      const key = itemKeyFor(tab.url);
      if (!key) continue;
      if (c.park) {
        const t1 = tier1(tab.url, await tier1Context());
        if (t1.kind === "never_locked" || t1.kind === "essential") continue; // INV-01: never parked
        await recordPark(s, tab, cacheKey(task.id, key), "separate_context", true, canOverride);
      } else {
        await cacheFor(s, internal.configVersion).record(task.id, key, { decision: "allow" });
      }
    }
  }
  await installPreBlocks(s.liftedDomains);
  task.lastUsedAt = Date.now();
  await tasks.put(task);
  s.committedAt = Date.now();
  apply(s, { type: how });
  await setInternal({ committedSessions: internal.committedSessions + 1 });
  await bump("sessions");
  await saveSession(s);
}

/** Every sweep has a 30-second undo that restores all items it parked (LOOP-04). */
export async function undo(): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "ACTIVE" || s.committedAt === null || !undoOpen(s.committedAt, Date.now())) return;
    const task = await chipTask(s);
    const internal = await getInternal();
    for (const [id, p] of Object.entries(s.parked)) {
      if (!p.bySweep) continue;
      await unparkTab(p.tabId, true);
      const key = itemKeyFor(p.url);
      if (key) await cacheFor(s, internal.configVersion).record(task.id, key, { decision: "allow" });
      await addLabel(task, p.itemKey, true, "sweep_undo");
      delete s.parked[id];
    }
    s.committedAt = null;
    await bump("sweep_undos");
    await saveSession(s);
  });
}

// ───────────────────────── Active session: judge every new item (LOOP-05) ─────────────────────────

const lastJudged = new Map<number, string>();

export async function onTabChanged(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url) return;
  const fingerprint = `${tab.url}\n${tab.title ?? ""}`;
  if (lastJudged.get(tab.id) === fingerprint) return;
  lastJudged.set(tab.id, fingerprint);
  await withSession(async (s) => {
    if (s?.state !== "ACTIVE" || !s.taskId) return;
    const task = await tasks.get(s.taskId);
    if (!task) return;
    const { decision, key } = await judgeItem(s, task, tab.url!, tab.title ?? "");
    const k = cacheKey(task.id, key);
    const parked = s.parked[String(tab.id)];
    if (decision.source === "tier3") s.tier3Uncontested.push({ itemKey: k, related: decision.action === "allow" });
    if (decision.tier3Failed) s.limited = true;

    if (decision.action === "park") {
      if (parked?.itemKey === k) return;
      if (parked) delete s.parked[String(tab.id)];
      await recordPark(s, tab, k, decision.source, false, (await tier3Ready()) !== null);
    } else {
      if (parked) {
        // The tab moved to an item that is allowed (e.g. SPA navigation, LOOP-05).
        await unparkTab(tab.id!, true);
        delete s.parked[String(tab.id)];
      }
      if (decision.action === "ask" && s.pendingAsk[String(tab.id)] !== k) {
        s.asks = [...pruneAskTimes(s.asks, Date.now()), Date.now()];
        s.pendingAsk[String(tab.id)] = k;
        await sendToTab(tab.id!, { type: "ask:show", taskLabel: task.label });
      }
      if (decision.action === "allow_and_flag") s.flagged.push(k);
      // CLS-32: accepted items join; seeded only from s ≥ 0.45 and tier 1 allows.
      if (decision.action === "allow" && (decision.source === "similarity" || decision.source === "never_locked" || decision.source === "essential" || decision.source === "profile")) {
        await seedPrototype(task, tab.url!, tab.title ?? "", decision.source === "similarity" ? { kind: "similarity", s: decision.s ?? 0 } : { kind: "tier1_allow" });
      }
    }
    await saveSession(s);
  });
}

export function forgetTab(tabId: number): void {
  lastJudged.delete(tabId);
  void withSession(async (s) => {
    if (!s) return;
    delete s.parked[String(tabId)];
    delete s.pendingAsk[String(tabId)];
    await saveSession(s);
  });
}

/** "Is this for the <task>?" — the answer is remembered: cache + strong label (LOOP-05). */
export async function answerAsk(tab: chrome.tabs.Tab, isRelated: boolean): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "ACTIVE" || !s.taskId || !tab.id || !tab.url) return;
    const k = s.pendingAsk[String(tab.id)];
    const task = await tasks.get(s.taskId);
    const key = itemKeyFor(tab.url);
    if (!k || !task || !key) return;
    delete s.pendingAsk[String(tab.id)];
    await sendToTab(tab.id, { type: "ask:hide" });
    const internal = await getInternal();
    await cacheFor(s, internal.configVersion).record(task.id, key, { decision: isRelated ? "allow" : "park" });
    await addLabel(task, k, isRelated, "ask_answer");
    if (isRelated) await seedPrototype(task, tab.url, tab.title ?? "", { kind: "accepted_item" });
    else await recordPark(s, tab, k, "ask", false, (await tier3Ready()) !== null);
    await saveSession(s);
  });
}

// ───────────────────────── Exit ladder step 1: override (LOCK-04) ─────────────────────────

export async function override(tab: chrome.tabs.Tab, sentence: string): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "ACTIVE" || !s.taskId || !tab.id || !tab.url) return;
    const parked = s.parked[String(tab.id)];
    const task = await tasks.get(s.taskId);
    if (!parked || !task || !sentence.trim()) return;
    const ready = await tier3Ready();
    const req = ready ? buildOverrideRequest({ redact: ready.redact, domainOnlySetting: ready.domainOnly }, task.label, tab.url, tab.title ?? "", sentence) : null;
    let verdict: "related" | "unrelated" | "unsure" = "unsure";
    if (req) {
      try {
        verdict = (await judgeRemote(req)).verdict;
      } catch {
        verdict = "unsure";
      }
    }
    if (verdict === "related") {
      // Accepted: allowed for THIS SESSION ONLY; a label only after 3 active minutes (CLS-62).
      s.overrides[parked.itemKey] = { url: tab.url, title: tab.title ?? "", itemKey: parked.itemKey, at: Date.now(), activity: [], labeled: false };
      delete s.parked[String(tab.id)];
      await unparkTab(tab.id, true);
      const pd = parseUrl(tab.url);
      const domain = pd ? pureDistractionDomain(pd) : null;
      if (domain && !s.liftedDomains.includes(domain)) {
        s.liftedDomains.push(domain);
        await installPreBlocks(s.liftedDomains);
      }
      s.suspensions.push(`Override accepted: ${itemDomain(tab.url) ?? tab.url}`);
      await bump("corrections");
    } else if (verdict === "unrelated") {
      // Refused: logged for review, never a label (INV-13).
      if (redactor) {
        const rec = buildReviewRecord(redactor, { kind: "refused_override", taskLabel: task.label, url: tab.url, title: tab.title ?? "", verdict, sentence, domainOnlySetting: (await getSettings()).domainOnly });
        if (rec) await review.add(rec);
      }
      await bump("refused_overrides");
      await sendToTab(tab.id, { type: "overlay:show", taskLabel: task.label, canOverride: true, overrideNote: "Not accepted for this task. You can still end the session." });
    } else {
      // What "unsure" or "tier 3 unavailable" does is OPEN Q-38. Nothing parked unlocks (INV-06).
      await sendToTab(tab.id, { type: "overlay:show", taskLabel: task.label, canOverride: req !== null, overrideNote: "This can’t be checked right now. You can still end the session." });
    }
    await saveSession(s);
  });
}

/** Input counts (never content) for the accepted-override label rule (CLS-62, INV-07). */
export async function onInputCounts(tab: chrome.tabs.Tab, minuteStart: number, count: number): Promise<void> {
  if (!tab.url) return;
  await withSession(async (s) => {
    if (s?.state !== "ACTIVE" || !s.taskId) return;
    const key = itemKeyFor(tab.url!);
    if (!key) return;
    const o = s.overrides[cacheKey(s.taskId, key)];
    if (!o || o.labeled) return;
    const counter = ActiveMinuteCounter.fromJSON(o.activity);
    counter.addInputEvents(count, minuteStart);
    o.activity = counter.toJSON();
    if (counter.qualifiesForLabel()) {
      const task = await tasks.get(s.taskId);
      if (task) {
        await addLabel(task, o.itemKey, true, "override_after_active_minutes");
        await seedPrototype(task, o.url, o.title, { kind: "override_after_active_minutes" });
      }
      o.labeled = true;
    }
    await saveSession(s);
  });
}

/**
 * Override from the blocked page of a pure-distraction domain (CLS-55): the only way to lift it.
 * Returns "accepted", "refused" or "unavailable" (OPEN Q-38 for the last two's handling).
 */
export async function overrideBlocked(url: string, sentence: string): Promise<"accepted" | "refused" | "unavailable"> {
  return withSession(async (s) => {
    if (s?.state !== "ACTIVE" || !s.taskId || !sentence.trim()) return "unavailable";
    const task = await tasks.get(s.taskId);
    const parsed = parseUrl(url);
    const domain = parsed ? pureDistractionDomain(parsed) : null;
    const ready = await tier3Ready();
    if (!task || !domain || !ready) return "unavailable";
    const req = buildOverrideRequest({ redact: ready.redact, domainOnlySetting: ready.domainOnly }, task.label, url, "", sentence);
    let verdict: "related" | "unrelated" | "unsure" = "unsure";
    try {
      if (req) verdict = (await judgeRemote(req)).verdict;
    } catch {
      verdict = "unsure";
    }
    const key = itemKeyFor(url);
    if (verdict === "related" && key) {
      s.overrides[cacheKey(task.id, key)] = { url, title: "", itemKey: cacheKey(task.id, key), at: Date.now(), activity: [], labeled: false };
      if (!s.liftedDomains.includes(domain)) s.liftedDomains.push(domain);
      await installPreBlocks(s.liftedDomains);
      s.suspensions.push(`Override accepted: ${domain}`);
      await bump("corrections");
      await saveSession(s);
      return "accepted";
    }
    if (verdict === "unrelated") {
      const rec = buildReviewRecord(ready.redact, { kind: "refused_override", taskLabel: task.label, url, title: "", verdict, sentence, domainOnlySetting: ready.domainOnly });
      if (rec) await review.add(rec);
      await bump("refused_overrides");
      return "refused";
    }
    return "unavailable";
  });
}

export async function onBlockedVisit(url: string): Promise<boolean> {
  return withSession(async (s) => {
    if (!s || (s.state !== "ACTIVE" && s.state !== "END_COUNTDOWN")) return false;
    s.restoreList.push({ url, title: itemDomain(url) ?? url, reason: "blocked" });
    s.lastParkAt = Date.now();
    await bump("parks");
    await saveSession(s);
    return true;
  });
}

// ───────────────────────── Exit ladder step 3: End (LOCK-04, LOOP-07) ─────────────────────────

export async function requestEnd(reason: string): Promise<boolean> {
  return withSession(async (s) => {
    if (!s || !validEndReason(reason)) return false;
    const now = Date.now();
    s.bail = isBail("end", now, s.lastParkAt);
    s.endCountdown = { startedAt: now, reason: reason.trim() };
    apply(s, { type: "END_REQUESTED" });
    await saveSession(s);
    await chrome.alarms.create(END_ALARM, { when: now + EXITS.END_COUNTDOWN_SEC * MS.SECOND });
    return true;
  });
}

export async function finishEnd(): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "END_COUNTDOWN") return;
    for (const p of Object.values(s.parked)) await unparkTab(p.tabId, true);
    for (const tabId of Object.keys(s.pendingAsk)) await sendToTab(Number(tabId), { type: "ask:hide" });
    await removePreBlocks();
    await writeUncontestedLabels(s);
    s.parked = {};
    s.pendingAsk = {};
    s.endedAt = Date.now();
    s.endKind = "early"; // a user-initiated End is "ended early"
    apply(s, { type: "END_COUNTDOWN_DONE" });
    await saveSession(s);
    await db.put("sessions", s);
    if (s.bail) await bump("bails");
    const internal = await getInternal();
    if (internal.pendingUpdate) {
      // INV-14: the update waited for End.
      await setInternal({ pendingUpdate: false });
      chrome.runtime.reload();
    }
  });
}

/** Weak labels at End: parks and tier 3 verdicts nobody contested (CLS-60). Bails write none. */
async function writeUncontestedLabels(s: ActiveSession): Promise<void> {
  if (!s.taskId || s.bail) return;
  const task = await tasks.get(s.taskId);
  if (!task) return;
  const contested = new Set(Object.keys(s.overrides));
  const parkedKeys = new Set(Object.values(s.parked).map((p) => p.itemKey));
  const asked = new Set(Object.values(s.pendingAsk));
  for (const k of parkedKeys) if (!contested.has(k)) await addLabel(task, k, false, "uncontested_park");
  for (const v of s.tier3Uncontested) {
    if (contested.has(v.itemKey) || parkedKeys.has(v.itemKey) || asked.has(v.itemKey)) continue;
    await addLabel(task, v.itemKey, v.related, "uncontested_tier3");
  }
}

export async function dismiss(): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "ENDED") return;
    await saveSession(null);
  });
}

export async function consent(granted: boolean): Promise<void> {
  const { setSettings } = await import("./settings");
  await setSettings({ consent: granted ? "granted" : "declined" });
}

/** True while a session could hold locks (used for update deferral and settings lock). */
export async function sessionInProgress(): Promise<boolean> {
  return withSession(async (s) => s !== null && s.state !== "IDLE" && s.state !== "ENDED");
}

