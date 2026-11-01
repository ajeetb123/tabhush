// Session engine: Start → infer → clarify → sweep preview → Confirm (+30 s undo) → judge every
// new item → End. Beta 1 scope (docs/13). Requirement IDs are cited inline.

import {
  addPrototype,
  ASK,
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
  taskScore,
  autoLabel,
  clampGoal,
  courseCodesIn,
  goalReached,
  isDistractingSearch,
  isDomainOnly,
  searchQuery,
  isBail,
  itemDomain,
  itemKeyFor,
  itemText,
  judge,
  liftedPreBlockDomains,
  LLM,
  OWNER_RULES,
  shippedCategory,
  MS,
  namedPureDistraction,
  needsConsentPrompt,
  normalizeLabel,
  parseUrl,
  PERF_EXTENSION,
  PROVIDER,
  pruneAskTimes,
  pureDistractionDomain,
  recentTasks,
  relatedness,
  sameAsCandidates,
  shouldSampleParkCheck,
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
import { getBankingDomains, getCategoryTable, getUndergroundDomains } from "./categories";
import { getRedactor } from "./lexicon";
import { installPreBlocks, parkTab, removePreBlocks, sendToTab, unparkTab } from "./enforce";
import { apply, newSession, saveSession, withSession, type ActiveSession } from "./session";
import { bump, getInternal, getSettings, setInternal } from "./settings";
import { backendConfigured, BackendUnavailable, CapReached, inferLabelRemote, judgeRemote, utcDay } from "./tier3Client";

export const END_ALARM = "end-countdown";
const SESSION_PAGE = "ui/session.html";
const CONSENT_PAGE = "ui/consent.html";


// ───────────────────────── classifier wiring ─────────────────────────

function cacheFor(s: ActiveSession | null, configVersion: number): VerdictCache {
  return new VerdictCache(idbCacheStore, { now: Date.now, sessionId: () => s?.id ?? null, configVersion: () => configVersion });
}

// YouTube genre of the video playing in each tab, as reported (and checked against the video ID)
// by the content script. Used for the always-allowed music rule (Q-63).
const youtubeMeta = new Map<number, { videoId: string; genre: string | null }>();

function youtubeGenre(tabId: number | undefined, url: string): string | null {
  if (tabId === undefined) return null;
  const meta = youtubeMeta.get(tabId);
  const v = (() => {
    try {
      return new URL(url).searchParams.get("v");
    } catch {
      return null;
    }
  })();
  return meta && v && meta.videoId === v ? meta.genre : null;
}

async function tier1Context(tabId?: number, url = ""): Promise<Tier1Context> {
  const settings = await getSettings();
  return {
    undergroundDomains: await getUndergroundDomains(),
    youtubeGenre: youtubeGenre(tabId, url),
    essentials: settings.essentials,
    schoolCoursewareDomains: [], // onboarding school domains: beta 2, mapping TODO_Q10
    coursewareFingerprint: false, // page fingerprint method TODO_Q10
    ownExtensionId: chrome.runtime.id,
  };
}

interface Tier3Ready {
  redact: Redactor;
  domainOnly: boolean;
  bankingDomains: ReadonlySet<string>;
}

const outCtx = (r: Tier3Ready) => ({ redact: r.redact, domainOnlySetting: r.domainOnly, bankingDomains: r.bankingDomains });

/** Returns what is needed to call tier 3, or null when any gate is closed (INV-08/10/11, CLS-12). */
async function tier3Ready(): Promise<Tier3Ready | null> {
  const redactor = await getRedactor();
  const settings = await getSettings();
  const internal = await getInternal();
  const gate = {
    llmEnabled: LLM.ENABLED,
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
  return { redact: redactor, domainOnly: settings.domainOnly, bankingDomains: await getBankingDomains() };
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

/** Embeds every not-yet-seen item text in batches of 16 (CLS-20 "batches of 16 at Start"). */
async function prefetchVectors(items: { url: string; title: string }[]): Promise<void> {
  const texts = [...new Set(items.map((i) => itemText(i.title, itemDomain(i.url) ?? "")))].filter((t) => !vectorCache.has(t));
  try {
    const vectors = await embed(texts);
    texts.forEach((t, i) => vectors[i] && vectorCache.set(t, vectors[i]!));
  } catch {
    // tier 2 unavailable: judging fails open item by item
  }
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

/**
 * The session's task: one task, or several picked together (Q-63). With several, an item's s is
 * its best s over the tasks, cache keys use the combined ID, and labels go to the closest task.
 */
export type SessionTask = Task & { members: Task[] };

function combine(members: Task[]): SessionTask {
  if (members.length === 1) return { ...members[0]!, members };
  return {
    id: members.map((m) => m.id).sort().join("+"),
    label: members.map((m) => m.label).join(" + "),
    prototypes: [],
    createdAt: Math.min(...members.map((m) => m.createdAt)),
    lastUsedAt: Math.max(...members.map((m) => m.lastUsedAt)),
    members,
  };
}

async function sessionTask(s: ActiveSession): Promise<SessionTask | null> {
  const ids = s.taskIds.length ? s.taskIds : s.taskId ? [s.taskId] : [];
  const members = (await Promise.all(ids.map((id) => tasks.get(id)))).filter((t): t is Task => !!t);
  return members.length ? combine(await Promise.all(members.map(ensureLabelVector))) : null;
}

async function memberScores(task: SessionTask, url: string, title: string): Promise<{ member: Task; s: number }[]> {
  const v = await itemVector(url, title);
  return task.members
    .filter((m) => m.labelVector)
    .map((m) => ({ member: m, s: relatedness(v, { label: m.labelVector!, prototypes: m.prototypes.map((p) => p.vector) }) }));
}

/** The task a label or prototype for this item belongs to. */
async function memberFor(task: SessionTask, url: string, title: string): Promise<Task> {
  if (task.members.length === 1) return task.members[0]!;
  try {
    const scored = await memberScores(task, url, title);
    return scored.sort((a, b) => b.s - a.s)[0]?.member ?? task.members[0]!;
  } catch {
    return task.members[0]!;
  }
}

export async function judgeItem(s: ActiveSession, task: SessionTask, url: string, title: string, tabId?: number): Promise<{ decision: Decision; key: ItemKey }> {
  const key = itemKeyFor(url) ?? { kind: "page", value: url };
  const internal = await getInternal();
  const ready = await tier3Ready();
  const t1 = tier1(url, await tier1Context(tabId, url));
  const searched = await judgeSearch(s, task, url, key, t1.kind);
  if (searched) return { decision: searched, key };
  // CLS-21 may also use a tier 3 category cached on device from earlier calls (none while Q-61 holds).
  const cachedCategory = (await cacheFor(s, internal.configVersion).lookup(task.id, key))?.tier3?.category ?? null;
  try {
    const decision = await judge({
      taskId: task.id,
      itemKey: key,
      tier1: t1,
      overridden: cacheKey(task.id, key) in s.overrides,
      cache: cacheFor(s, internal.configVersion),
      relatedness: async () => {
        const scored = await memberScores(task, url, title);
        if (!scored.length) throw new Error("tier 2 unavailable");
        return Math.max(...scored.map((x) => x.s));
      },
      memory: async () => null, // personal memory: beta 2 (CLS-22)
      tier3: ready
        ? async () => {
            const req = buildJudgeRequest(outCtx(ready), task.label, url, title);
            if (!req) throw new BackendUnavailable("unparseable URL");
            return judgeRemote(req);
          }
        : null,
      // CLS-21 is used whenever tier 3 is unavailable; moved to beta 1 when the LLM was switched off (Q-61).
      onDeviceParkingPath: ready === null,
      onDeviceCategory: shippedCategory(url, await getCategoryTable()) ?? cachedCategory,
      // Q-63: never ask; unsure items are allowed and flagged.
      askBudgetAvailable: () => OWNER_RULES.ASK_ENABLED && askBudgetAvailable(s.asks, Date.now()),
    });
    return { decision, key };
  } catch (e) {
    // INV-06: no tier confident (tier 2 down, unexpected error) → allow and flag.
    return { decision: { action: "allow_and_flag", source: "fail_open", tier3Failed: e instanceof CapReached || e instanceof BackendUnavailable }, key };
  }
}

// Distraction and work topic vectors for search blocking (Q-64), embedded once.
let topicVectors: Promise<{ distraction: number[][]; work: number[][] }> | null = null;

function getTopicVectors(): Promise<{ distraction: number[][]; work: number[][] }> {
  topicVectors ??= embed([...OWNER_RULES.SEARCH_DISTRACTION_TOPICS, ...OWNER_RULES.SEARCH_WORK_TOPICS]).then((v) => ({
    distraction: v.slice(0, OWNER_RULES.SEARCH_DISTRACTION_TOPICS.length),
    work: v.slice(OWNER_RULES.SEARCH_DISTRACTION_TOPICS.length),
  }));
  topicVectors.catch(() => (topicVectors = null));
  return topicVectors;
}

/**
 * Search results pages are judged by their query (Q-64): blocked when the query is close to a
 * distraction topic, clearly closer to it than to work, and unrelated to the session's tasks.
 * Returns null when the page is not a search, the rules above it decide, or tier 2 is down.
 */
async function judgeSearch(s: ActiveSession, task: SessionTask, url: string, key: ItemKey, t1Kind: string): Promise<Decision | null> {
  const q = searchQuery(url);
  if (q === null || t1Kind === "never_locked" || t1Kind === "essential") return null;
  try {
    const [qv] = await embed([q]);
    const topics = await getTopicVectors();
    if (!qv) return null;
    const best = (vs: number[][]) => Math.max(...vs.map((v) => cosine(qv, v)));
    const taskS = Math.max(...task.members.filter((m) => m.labelVector).map((m) => relatedness(qv, { label: m.labelVector!, prototypes: m.prototypes.map((p) => p.vector) })));
    if (!isDistractingSearch({ distraction: best(topics.distraction), work: best(topics.work), task: taskS })) return null;
    const internal = await getInternal();
    await cacheFor(s, internal.configVersion).record(task.id, key, { decision: "park" });
    return { action: "park", source: "search_topic", s: taskS };
  } catch {
    return null;
  }
}

async function addLabel(task: SessionTask, itemKey: string, related: boolean, source: LabelSource, url?: string, title = ""): Promise<void> {
  assertLabelSource(source); // INV-13
  const owner = url ? await memberFor(task, url, title) : task.members[0]!;
  const label: Label = { taskId: owner.id, itemKey, related, source, createdAt: Date.now() };
  await labels.add(label);
}

async function seedPrototype(task: SessionTask, url: string, title: string, src: PrototypeSource): Promise<void> {
  try {
    const owner = await memberFor(task, url, title);
    if (addPrototype(owner, await itemVector(url, title), src, Date.now())) await tasks.put(owner);
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
    await rememberCourses(recentTabs);
    let vectors: (number[] | null)[] = recentTabs.map(() => null);
    try {
      vectors = await embed(recentTabs.map((t) => itemText(t.title ?? "", itemDomain(t.url!) ?? "")));
    } catch {
      // tier 2 unavailable: the task is named from the tabs instead
    }
    const recent = await Promise.all(recentTasks(await tasks.all(), Date.now()).map(ensureLabelVector));
    const tabsForScore = recentTabs.map((t, i) => ({ vector: vectors[i] ?? null, front: t.id === frontTab?.id }));
    const scored = recent
      .map((task) => ({ task, score: taskScore(task, tabsForScore) }))
      .filter((x): x is { task: Task; score: number } => x.score !== null)
      .sort((a, b) => b.score - a.score);

    // Q-64: no prompt. Several strong recent tasks → all of them; one confident → it; otherwise a
    // label proposed by tier 3 (when on) or named on device from the tabs.
    const strong = scored.filter((x) => x.score >= OWNER_RULES.MULTI_TASK_MIN_SCORE).map((x) => x.task);
    const result = inferTask(recent, tabsForScore);
    let chosen: Task[] = [];
    if (strong.length >= 2) chosen = strong;
    else if (result.kind === "autofill") chosen = [result.task];
    else {
      const ready = await tier3Ready();
      const frontTabs = all.filter((t) => t.windowId === frontTab?.windowId && usableTitle(t));
      const req = ready ? buildInferLabelRequest(outCtx(ready), frontTabs.map((t) => ({ url: t.url!, title: t.title! }))) : null;
      const proposal = req ? await inferLabelRemote(req).catch(() => null) : null;
      const label = proposal?.label ?? autoLabel(learnableTabs(recentTabs).map((t) => ({ title: t.title ?? "", front: t.id === frontTab?.id })), await knownCourses());
      if (label) chosen = [await resolveOrCreate(label)];
    }
    s.taskIds = chosen.map((t) => t.id);
    s.taskId = s.taskIds[0] ?? null;
    s.chip = chosen[0] ? { label: chosen[0].label, taskId: chosen[0].id, renamed: false } : null;
    s.suggestions = scored
      .map((x) => x.task)
      .filter((t) => !s.taskIds.includes(t.id))
      .slice(0, ASK.CLARIFY_GUESSES)
      .map((t) => ({ taskId: t.id, label: t.label }));
    apply(s, { type: "INFER_CONFIDENT" });
    await saveSession(s);
    await buildPreview(s);
  });
}

async function createTask(label: string): Promise<Task> {
  const now = Date.now();
  const task: Task = { id: crypto.randomUUID(), label: label.trim(), prototypes: [], createdAt: now, lastUsedAt: now };
  await tasks.put(task);
  return ensureLabelVector(task);
}

/**
 * Exact matches merge silently (CLS-31). Q-64: the "Same as X?" triggers (label similarity ≥ 0.85,
 * a shared course code) also merge silently, since there are no prompts. Otherwise a new task.
 */
async function resolveOrCreate(label: string): Promise<Task> {
  const all = await tasks.all();
  const exact = findExact(all, label);
  if (exact) return ensureLabelVector(exact);
  let labelVec: number[] | null = null;
  try {
    labelVec = (await embed([label]))[0] ?? null;
  } catch {
    labelVec = null;
  }
  const near = sameAsCandidates(label, all, (t) => (labelVec && t.labelVector ? cosine(labelVec, t.labelVector) : null))[0];
  return near ? ensureLabelVector(near.task) : createTask(label);
}

/** The start screen's task chips: toggled suggestions, typed or spoken tasks (Q-64). */
export async function setTasks(labelsIn: string[]): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "SWEEP_PREVIEW") return;
    const labels = [...new Map(labelsIn.filter((l) => normalizeLabel(l)).map((l) => [normalizeLabel(l), l.trim()])).values()];
    const chosen: Task[] = [];
    for (const l of labels) {
      const t = await resolveOrCreate(l);
      if (!chosen.some((c) => c.id === t.id)) chosen.push(t);
    }
    const before = s.taskIds.join("+");
    s.taskIds = chosen.map((t) => t.id);
    s.taskId = s.taskIds[0] ?? null;
    // A change to the inferred tasks is the inference-accuracy signal (LOOP-02, docs/14).
    if (s.chip && !s.chip.renamed && before !== s.taskIds.join("+")) {
      s.chip.renamed = true;
      await bump("chip_renames");
    }
    s.chip = chosen[0] ? { label: chosen[0].label, taskId: chosen[0].id, renamed: s.chip?.renamed ?? true } : s.chip;
    await saveSession(s);
    await buildPreview(s);
  });
}

// ───────────────────────── Local memory of courses (Q-64) ─────────────────────────

/** Tabs the app may learn from: never incognito, never domain-only sites (webmail, chat, banking). */
function learnableTabs(tabs: chrome.tabs.Tab[]): chrome.tabs.Tab[] {
  return tabs.filter((t) => {
    const p = t.url ? parseUrl(t.url) : null;
    return !t.incognito && p !== null && !isDomainOnly(p);
  });
}

async function knownCourses(): Promise<string[]> {
  const { profile } = await chrome.storage.local.get("profile");
  return ((profile as { courses?: string[] } | undefined)?.courses ?? []).slice();
}

async function rememberCourses(tabs: chrome.tabs.Tab[]): Promise<void> {
  const found = learnableTabs(tabs).flatMap((t) => courseCodesIn(t.title ?? ""));
  if (!found.length) return;
  const courses = [...new Set([...(await knownCourses()), ...found])];
  await chrome.storage.local.set({ profile: { courses } });
}

// ───────────────────────── Sweep (LOOP-04) ─────────────────────────

async function buildPreview(s: ActiveSession): Promise<void> {
  s.preview = [];
  const task = await sessionTask(s);
  s.taskLabel = task?.label ?? null;
  if (!task) return void (await saveSession(s)); // no task yet: the start screen asks for one

  // Q-64: no window or group questions; every tab is judged on its own.
  const { all } = await snapshot();
  const items = all.filter((t) => t.url).map((t) => ({ url: t.url!, title: t.title ?? "" }));
  const budget = PERF_EXTENSION.START_JUDGE_RECENT_TABS;
  await prefetchVectors(items.slice(0, budget)); // the 30 most recent first (2 s budget)
  let judged = 0;
  for (const tab of all) {
    if (!tab.id || !tab.url) continue;
    const { decision, key } = await judgeItem(s, task, tab.url, tab.title ?? "", tab.id);
    if (decision.source === "tier3") s.tier3Uncontested.push({ itemKey: cacheKey(task.id, key), related: decision.action === "allow" });
    if (decision.action === "allow_and_flag" || decision.action === "ask") s.flagged.push(cacheKey(task.id, key));
    if (decision.action === "park") {
      s.preview.push({ tabId: tab.id, url: tab.url, title: tab.title ?? "", domain: itemDomain(tab.url) ?? "", itemKey: cacheKey(task.id, key), park: true });
    }
    // The 30 most recent tabs land in the preview first (PERF budget); the rest follow.
    if (++judged === budget) {
      await saveSession(s);
      await prefetchVectors(items.slice(budget));
    }
  }

  s.suspensions = [];
  for (const name of namedPureDistraction(task.label)) s.suspensions.push(`${name} is in the task name but stays blocked.`);
  s.liftedDomains = liftedPreBlockDomains(task.label);
  for (const d of s.liftedDomains) s.suspensions.push(`${d} is in the task name, so it isn’t blocked as a whole; its pages are still judged.`);
  await saveSession(s);
}

export async function togglePreview(tabId: number, park: boolean): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "SWEEP_PREVIEW") return;
    const item = s.preview.find((p) => p.tabId === tabId);
    if (item) item.park = park;
    await saveSession(s);
  });
}

/** Lock in with a time goal (Q-64). */
export async function confirm(goalMin: number): Promise<void> {
  await withSession(async (s) => {
    if (s?.state !== "SWEEP_PREVIEW" || s.taskIds.length === 0) return;
    s.goalMin = clampGoal(goalMin);
    await commit(s, "CONFIRM");
  });
}

/** Past the goal, Stop ends at once as a normal end: no countdown, no reason (Q-64). */
export async function stop(): Promise<boolean> {
  return withSession(async (s) => {
    if (!s || (s.state !== "ACTIVE" && s.state !== "END_COUNTDOWN") || !goalReached(s.committedAt, s.goalMin, Date.now())) return false;
    if (s.state === "ACTIVE") apply(s, { type: "END_REQUESTED" });
    s.endCountdown = { startedAt: Date.now(), reason: "goal reached" };
    await chrome.alarms.clear(END_ALARM);
    await saveSession(s);
    await finishSession(s, "normal");
    return true;
  });
}

async function recordPark(s: ActiveSession, tab: chrome.tabs.Tab, itemKey: string, source: string, bySweep: boolean, canOverride: boolean): Promise<void> {
  // The sampled "Was this park right?" check (docs/14). Rate is TODO_Q42, so nothing is sampled yet.
  const outcome = await parkTab(tab, s.taskLabel ?? "", canOverride, shouldSampleParkCheck());
  const now = Date.now();
  if (outcome === "closed") s.restoreList.push({ url: tab.url ?? "", title: tab.title ?? "", reason: "closed" });
  else s.parked[String(tab.id)] = { tabId: tab.id!, url: tab.url ?? "", title: tab.title ?? "", itemKey, at: now, bySweep, source };
  s.lastParkAt = now;
  await bump("parks");
}

async function commit(s: ActiveSession, how: "CONFIRM" | "AUTO_COMMIT"): Promise<void> {
  const task = (await sessionTask(s))!;
  const internal = await getInternal();
  const canOverride = OWNER_RULES.OVERRIDE_ENABLED; // Q-63: no overrides
  for (const item of s.preview) {
    const tab = await chrome.tabs.get(item.tabId).catch(() => null);
    if (!tab) continue;
    if (item.park) {
      await recordPark(s, tab, item.itemKey, "sweep", true, canOverride);
    } else {
      // A keep: strong related label, prototype, cached allow (LOOP-04, CLS-32).
      const key = itemKeyFor(item.url);
      if (key) await cacheFor(s, internal.configVersion).record(task.id, key, { decision: "allow" });
      await addLabel(task, item.itemKey, true, "sweep_keep", item.url, item.title);
      await seedPrototype(task, item.url, item.title, { kind: "sweep_keep" });
    }
  }
  await installPreBlocks(s.liftedDomains);
  for (const m of task.members) {
    m.lastUsedAt = Date.now();
    await tasks.put(m);
  }
  s.committedAt = Date.now();
  apply(s, { type: how });
  await setInternal({ committedSessions: internal.committedSessions + 1 });
  await bump("sessions");
  await saveSession(s);
}

/** Every sweep has a 30-second undo that restores all items it parked (LOOP-04). */
export async function undo(): Promise<void> {
  if (!OWNER_RULES.SWEEP_UNDO_ENABLED) return; // Q-63: no take-backs
  await withSession(async (s) => {
    if (s?.state !== "ACTIVE" || s.committedAt === null || !undoOpen(s.committedAt, Date.now())) return;
    const task = (await sessionTask(s))!;
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

const musicTabs = new Set<number>();

/** YouTube genre for the playing video, reported by the content script (Q-63 music rule). */
export async function onYoutubeMeta(tab: chrome.tabs.Tab, videoId: string, genre: string | null): Promise<void> {
  if (!tab.id) return;
  youtubeMeta.set(tab.id, { videoId, genre });
  await onTabChanged(tab);
}

export async function onTabChanged(tab: chrome.tabs.Tab): Promise<void> {
  if (!tab.id || !tab.url) return;
  const fingerprint = `${tab.url}\n${tab.title ?? ""}\n${youtubeGenre(tab.id, tab.url) ?? ""}`;
  if (lastJudged.get(tab.id) === fingerprint) return;
  lastJudged.set(tab.id, fingerprint);
  await withSession(async (s) => {
    if (s?.state !== "ACTIVE" || !s.taskId) return;
    const task = await sessionTask(s);
    if (!task) return;
    const { decision, key } = await judgeItem(s, task, tab.url!, tab.title ?? "", tab.id);
    const k = cacheKey(task.id, key);
    const parked = s.parked[String(tab.id)];
    if (decision.source === "tier3") s.tier3Uncontested.push({ itemKey: k, related: decision.action === "allow" });
    if (decision.tier3Failed) s.limited = true;

    // Q-63: music is always allowed, at a lower volume.
    if (decision.source === "music") {
      musicTabs.add(tab.id!);
      await sendToTab(tab.id!, { type: "music:on", volume: OWNER_RULES.MUSIC_VOLUME });
    } else if (musicTabs.delete(tab.id!)) {
      await sendToTab(tab.id!, { type: "music:off" });
    }

    if (decision.action !== "park") await rememberCourses([tab]);

    if (decision.action === "park") {
      if (parked?.itemKey === k) return;
      if (parked) delete s.parked[String(tab.id)];
      await recordPark(s, tab, k, decision.source, false, OWNER_RULES.OVERRIDE_ENABLED);
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
  youtubeMeta.delete(tabId);
  musicTabs.delete(tabId);
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
    const task = await sessionTask(s);
    const key = itemKeyFor(tab.url);
    if (!k || !task || !key) return;
    delete s.pendingAsk[String(tab.id)];
    await sendToTab(tab.id, { type: "ask:hide" });
    const internal = await getInternal();
    await cacheFor(s, internal.configVersion).record(task.id, key, { decision: isRelated ? "allow" : "park" });
    await addLabel(task, k, isRelated, "ask_answer", tab.url, tab.title ?? "");
    if (isRelated) await seedPrototype(task, tab.url, tab.title ?? "", { kind: "accepted_item" });
    else await recordPark(s, tab, k, "ask", false, OWNER_RULES.OVERRIDE_ENABLED);
    await saveSession(s);
  });
}

// ───────────────────────── Exit ladder step 1: override (LOCK-04) ─────────────────────────

type OverrideOutcome = "accepted" | "refused" | "unavailable";

/**
 * Judges a "This is for my task" sentence. With tier 3 the LLM decides. Without it (the LLM is
 * off, Q-61, or the cap is hit or the backend is down) the override is accepted and logged
 * (Q-38, owner 2026-10-31). An "unsure" LLM verdict is still OPEN Q-38: nothing unlocks.
 */
async function judgeOverride(taskLabel: string, url: string, title: string, sentence: string): Promise<{ verdict: "related" | "unrelated" | "unsure"; judged: boolean }> {
  const ready = await tier3Ready();
  if (!ready) return { verdict: "related", judged: false };
  const req = buildOverrideRequest(outCtx(ready), taskLabel, url, title, sentence);
  if (!req) return { verdict: "related", judged: false };
  try {
    return { verdict: (await judgeRemote(req)).verdict, judged: true };
  } catch {
    return { verdict: "related", judged: false }; // tier 3 unavailable mid-call: Q-38 applies
  }
}

/** Accepted: allowed for THIS SESSION ONLY; a label only after 3 active minutes (CLS-62). Logged. */
async function acceptOverride(s: ActiveSession, task: Task, url: string, title: string, sentence: string, judged: boolean): Promise<void> {
  const key = itemKeyFor(url);
  if (!key) return;
  const k = cacheKey(task.id, key);
  s.overrides[k] = { url, title, itemKey: k, at: Date.now(), activity: [], labeled: false };
  const pd = parseUrl(url);
  const domain = pd ? pureDistractionDomain(pd) : null;
  if (domain && !s.liftedDomains.includes(domain)) {
    s.liftedDomains.push(domain);
    await installPreBlocks(s.liftedDomains);
  }
  // Every override is visible: on the session card, and (redacted) in the review records.
  s.suspensions.push(`${judged ? "Override accepted" : "Override (not checked)"}: ${itemDomain(url) ?? url}`);
  s.overrideLog.push({ at: Date.now(), domain: itemDomain(url) ?? "", sentence, judged });
  const redactor = await getRedactor();
  if (redactor && !judged) {
    const rec = buildReviewRecord(redactor, { kind: "unjudged_override", taskLabel: task.label, url, title, verdict: "accepted_unjudged", sentence, domainOnlySetting: (await getSettings()).domainOnly, bankingDomains: await getBankingDomains() });
    if (rec) await review.add(rec);
  }
  await bump("corrections");
}

async function refuseOverride(task: Task, url: string, title: string, sentence: string): Promise<void> {
  // Refused: logged for review, never a label (INV-13).
  const redactor = await getRedactor();
  if (redactor) {
    const rec = buildReviewRecord(redactor, { kind: "refused_override", taskLabel: task.label, url, title, verdict: "unrelated", sentence, domainOnlySetting: (await getSettings()).domainOnly, bankingDomains: await getBankingDomains() });
    if (rec) await review.add(rec);
  }
  await bump("refused_overrides");
}

export async function override(tab: chrome.tabs.Tab, sentence: string): Promise<OverrideOutcome> {
  if (!OWNER_RULES.OVERRIDE_ENABLED) return "unavailable"; // Q-63: once blocked, it stays blocked
  return withSession(async (s) => {
    if (s?.state !== "ACTIVE" || !s.taskId || !tab.id || !tab.url) return "unavailable";
    const parked = s.parked[String(tab.id)];
    const task = await sessionTask(s);
    if (!parked || !task || !sentence.trim()) return "unavailable";
    const { verdict, judged } = await judgeOverride(task.label, tab.url, tab.title ?? "", sentence);
    let outcome: OverrideOutcome = "unavailable";
    if (verdict === "related") {
      delete s.parked[String(tab.id)];
      await unparkTab(tab.id, true);
      await acceptOverride(s, task, tab.url, tab.title ?? "", sentence, judged);
      outcome = "accepted";
    } else if (verdict === "unrelated") {
      await refuseOverride(task, tab.url, tab.title ?? "", sentence);
      await sendToTab(tab.id, { type: "overlay:show", taskLabel: task.label, canOverride: true, overrideNote: "Not accepted for this task. You can still end the session." });
      outcome = "refused";
    } else {
      await sendToTab(tab.id, { type: "overlay:show", taskLabel: task.label, canOverride: true, overrideNote: "This can’t be checked right now. You can still end the session." });
    }
    await saveSession(s);
    return outcome;
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
      const task = await sessionTask(s);
      if (task) {
        await addLabel(task, o.itemKey, true, "override_after_active_minutes", o.url, o.title);
        await seedPrototype(task, o.url, o.title, { kind: "override_after_active_minutes" });
      }
      o.labeled = true;
    }
    await saveSession(s);
  });
}

/** Override from the blocked page of a pure-distraction domain (CLS-55): the only way to lift it. */
export async function overrideBlocked(url: string, sentence: string): Promise<OverrideOutcome> {
  if (!OWNER_RULES.OVERRIDE_ENABLED) return "unavailable"; // Q-63
  return withSession(async (s) => {
    if (s?.state !== "ACTIVE" || !s.taskId || !sentence.trim()) return "unavailable";
    const task = await sessionTask(s);
    const parsed = parseUrl(url);
    if (!task || !parsed || !pureDistractionDomain(parsed)) return "unavailable";
    const { verdict, judged } = await judgeOverride(task.label, url, "", sentence);
    let outcome: OverrideOutcome = "unavailable";
    if (verdict === "related") {
      await acceptOverride(s, task, url, "", sentence, judged);
      outcome = "accepted";
    } else if (verdict === "unrelated") {
      await refuseOverride(task, url, "", sentence);
      outcome = "refused";
    }
    await saveSession(s);
    return outcome;
  });
}

/**
 * Answer to the sampled check. Kept as a review record (exported with review records, Q-28),
 * never a label. [DERIVED] A "wrong" answer does not unlock the page; the exit ladder does.
 */
export async function answerParkCheck(tab: chrome.tabs.Tab, right: boolean): Promise<void> {
  await withSession(async (s) => {
    const redactor = await getRedactor();
    if (!s?.taskLabel || !tab.id || !tab.url || !s.parked[String(tab.id)] || !redactor) return;
    const rec = buildReviewRecord(redactor, {
      kind: "sampled_check",
      taskLabel: s.taskLabel,
      url: tab.url,
      title: tab.title ?? "",
      verdict: right ? "park_right" : "park_wrong",
      domainOnlySetting: (await getSettings()).domainOnly,
      bankingDomains: await getBankingDomains(),
    });
    if (rec) await review.add(rec);
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
    // Ending after the goal is a normal end (Q-64); before it, "ended early".
    await finishSession(s, goalReached(s.committedAt, s.goalMin, Date.now()) ? "normal" : "early");
  });
}

async function finishSession(s: ActiveSession, kind: "normal" | "early"): Promise<void> {
  {
    for (const p of Object.values(s.parked)) await unparkTab(p.tabId, true);
    for (const tabId of Object.keys(s.pendingAsk)) await sendToTab(Number(tabId), { type: "ask:hide" });
    await removePreBlocks();
    await writeUncontestedLabels(s);
    s.parked = {};
    s.pendingAsk = {};
    s.endedAt = Date.now();
    s.endKind = kind;
    if (kind === "normal") s.bail = false;
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
  }
}

/** Actual lengths (minutes) of past sessions, oldest first, for the time-goal default (Q-64). */
export async function sessionHistoryMinutes(): Promise<number[]> {
  const past = await db.all<ActiveSession>("sessions");
  return past
    .filter((p) => p.committedAt !== null && p.endedAt !== null)
    .sort((a, b) => a.endedAt! - b.endedAt!)
    .map((p) => (p.endedAt! - p.committedAt!) / MS.MINUTE);
}

/** Weak labels at End: parks and tier 3 verdicts nobody contested (CLS-60). Bails write none. */
async function writeUncontestedLabels(s: ActiveSession): Promise<void> {
  if (!s.taskId || s.bail) return;
  const task = await sessionTask(s);
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

