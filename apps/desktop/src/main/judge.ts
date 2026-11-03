// The classifier, wired for the desktop app (docs/05, Q-61 on-device only, Q-70). Browser pages go
// through the same tier 1 rules and judge() as the extension did; apps go through apps.ts; a
// window title with no URL (Firefox, unknown apps) can only be blocked by topic (Q-65).

import {
  cacheKey,
  cosine,
  DESKTOP,
  isDistractingPage,
  isDistractingSearch,
  itemDomain,
  itemKeyFor,
  itemText,
  judge,
  looksLikeMusic,
  MemoryCacheStore,
  OWNER_RULES,
  parseUrl,
  PURE_DISTRACTION,
  relatedness,
  searchQuery,
  shippedCategory,
  tier1,
  VerdictCache,
  type Decision,
  type ItemKey,
  type Task,
} from "@lockin/core";
import { appKind, isSchoolPage, looksLikeGame, type AppKind } from "./apps";
import type { Categories } from "./categories";
import type { AppInfo } from "./system";

export type Embed = (texts: string[]) => Promise<number[][]>;

/** The session's task: one task, or several picked together (Q-63). */
export type SessionTask = Task & { members: Task[] };

export interface Verdict {
  action: "allow" | "park";
  source: string;
  s?: number;
}

export interface JudgeDeps {
  embed: Embed;
  categories: Categories;
  essentials: () => readonly string[];
  schoolSites: () => readonly string[];
  selfBundleId: string;
}

export class Judge {
  private cache: VerdictCache;
  private sessionId: string | null = null;
  private vectors = new Map<string, number[]>();
  private topics: Promise<{ distraction: number[][]; work: number[][] }> | null = null;

  constructor(private readonly d: JudgeDeps) {
    this.cache = new VerdictCache(new MemoryCacheStore(), { now: Date.now, sessionId: () => this.sessionId, configVersion: () => 0 });
  }

  /** Verdicts are kept for one session (CLS cache "session" expiry). */
  startSession(id: string): void {
    this.sessionId = id;
    this.cache = new VerdictCache(new MemoryCacheStore(), { now: Date.now, sessionId: () => this.sessionId, configVersion: () => 0 });
  }

  async vector(text: string): Promise<number[]> {
    const hit = this.vectors.get(text);
    if (hit) return hit;
    const [v] = await this.d.embed([text]);
    if (!v) throw new Error("no vector");
    if (this.vectors.size > 5000) this.vectors.clear();
    this.vectors.set(text, v);
    return v;
  }

  private topicVectors(): Promise<{ distraction: number[][]; work: number[][] }> {
    this.topics ??= this.d.embed([...OWNER_RULES.SEARCH_DISTRACTION_TOPICS, ...OWNER_RULES.SEARCH_WORK_TOPICS]).then((v) => ({
      distraction: v.slice(0, OWNER_RULES.SEARCH_DISTRACTION_TOPICS.length),
      work: v.slice(OWNER_RULES.SEARCH_DISTRACTION_TOPICS.length),
    }));
    this.topics.catch(() => (this.topics = null));
    return this.topics;
  }

  private taskS(task: SessionTask, v: number[]): number {
    const scored = task.members.filter((m) => m.labelVector).map((m) => relatedness(v, { label: m.labelVector!, prototypes: m.prototypes.map((p) => p.vector) }));
    return scored.length ? Math.max(...scored) : 0;
  }

  /** Q-64/Q-65: a search query or a page/window title that is about a distraction topic, not the task. */
  private async byTopic(task: SessionTask, text: string, kind: "search" | "page"): Promise<Verdict | null> {
    try {
      const v = await this.vector(text);
      const t = await this.topicVectors();
      const best = (vs: number[][]) => Math.max(...vs.map((x) => cosine(v, x)));
      const scores = { distraction: best(t.distraction), work: best(t.work), task: this.taskS(task, v) };
      const hit = kind === "search" ? isDistractingSearch(scores) : isDistractingPage(scores);
      return hit ? { action: "park", source: kind === "search" ? "search_topic" : "page_topic", s: scores.task } : null;
    } catch {
      return null; // tier 2 unavailable: fail open (INV-06)
    }
  }

  /** A browser page with a known URL. */
  async page(task: SessionTask, url: string, title: string): Promise<Verdict> {
    const key: ItemKey = itemKeyFor(url) ?? { kind: "page", value: url };
    const t1 = tier1(url, {
      essentials: this.d.essentials(),
      schoolCoursewareDomains: this.d.schoolSites(),
      // Q-74: school pages are recognized by looking at them, never blocked.
      coursewareFingerprint: isSchoolPage(parseUrl(url)?.host ?? "", title),
      ownExtensionId: "",
      undergroundDomains: this.d.categories.underground(),
      youtubeGenre: null,
      youtubeLooksLikeMusic: /youtube\.com\/watch/.test(url) && looksLikeMusic(title.replace(/\s-\sYouTube$/, "")),
    });
    const cached = await this.cache.lookup(task.id, key);
    if (cached?.decision && t1.kind === "none") return { action: cached.decision, source: "cache" };

    const q = searchQuery(url);
    if (q !== null && t1.kind !== "never_locked" && t1.kind !== "essential") {
      const v = await this.byTopic(task, q, "search");
      if (v) {
        await this.cache.record(task.id, key, { decision: "park" });
        return v;
      }
    } else if (q === null && t1.kind === "none" && title) {
      const v = await this.byTopic(task, title, "page");
      if (v) {
        await this.cache.record(task.id, key, { decision: "park" });
        return v;
      }
    }

    try {
      const d: Decision = await judge({
        taskId: task.id,
        itemKey: key,
        tier1: t1,
        overridden: false, // Q-63: no overrides
        cache: this.cache,
        relatedness: async () => this.taskS(task, await this.vector(itemText(title, itemDomain(url) ?? ""))),
        memory: async () => null,
        tier3: null, // Q-61: no LLM
        onDeviceParkingPath: true,
        onDeviceCategory: shippedCategory(url, this.d.categories.categoryTable()),
        askBudgetAvailable: () => false, // Q-63: never ask
      });
      return { action: d.action === "park" ? "park" : "allow", source: d.source, s: d.s };
    } catch {
      return { action: "allow", source: "fail_open" };
    }
  }

  /** A browser window whose URL can't be read: the title names a blocked site, or is about a distraction. */
  async titleOnly(task: SessionTask, title: string): Promise<Verdict> {
    if (!title) return { action: "allow", source: "fail_open" };
    if (isSchoolPage("", title)) return { action: "allow", source: "never_locked" };
    const lower = title.toLowerCase();
    const named = PURE_DISTRACTION.find((site) => new RegExp(`(^|[\\s|·-])${site.name.toLowerCase()}($|[\\s|·-])`).test(lower));
    if (named) return { action: "park", source: "distraction" };
    return (await this.byTopic(task, title, "page")) ?? { action: "allow", source: "fail_open" };
  }

  /** An app other than a browser (DSK-10). Unknown apps: blocked only when the window is about a distraction. */
  async app(task: SessionTask | null, app: Pick<AppInfo, "bundleId" | "name" | "category" | "path">, title: string): Promise<Verdict & { kind: AppKind }> {
    let kind = appKind(app, this.d.selfBundleId);
    // Q-74: a game is recognized from its files and install location, whatever it is called.
    if ((kind === "other" || (kind === "tool" && !DESKTOP.ALWAYS_ALLOWED_APPS.includes(app.bundleId as never))) && looksLikeGame(app.path)) kind = "distraction";
    if (kind === "distraction") return { kind, action: "park", source: "distraction" };
    if (kind === "other" && task && title) {
      const v = await this.byTopic(task, `${title} ${app.name}`, "page");
      if (v) return { kind, ...v };
    }
    return { kind, action: "allow", source: kind };
  }

  cacheKeyFor(task: SessionTask, url: string): string {
    return cacheKey(task.id, itemKeyFor(url) ?? { kind: "page", value: url });
  }
}

export function domainOf(url: string): string | null {
  return itemDomain(url) ?? parseUrl(url)?.host ?? null;
}
