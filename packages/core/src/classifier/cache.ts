// Verdict cache (docs/05 CLS-40, docs/03 LOOP-10). Storage-agnostic: the extension persists
// entries to IndexedDB; this module owns keys, TTLs and invalidation.

import { CACHE, MS, type Category, type Verdict } from "../constants";
import { cacheKey, type ItemKey } from "./cacheKey";

export type CachedDecision = "allow" | "park";

export interface Tier3Cached {
  verdict: Verdict;
  confidence: number;
  category: Category;
}

export interface CacheEntry {
  key: string;
  kind: ItemKey["kind"];
  decision?: CachedDecision;
  /** The raw tier 3 result, so the LLM sees each key once and the category stays on device (CLS-14). */
  tier3?: Tier3Cached;
  configVersion: number;
  createdAt: number;
  /** Page keys expire at session end; path and domain keys at a time. */
  sessionId?: string;
  expiresAt?: number;
}

export function expiryFor(kind: ItemKey["kind"], now: number, sessionId: string): Pick<CacheEntry, "sessionId" | "expiresAt"> {
  switch (kind) {
    case "page":
      return { sessionId };
    case "path":
      return { expiresAt: now + CACHE.PATH_KEY_TTL_DAYS * MS.DAY };
    case "domain":
      return { expiresAt: now + CACHE.DOMAIN_KEY_TTL_DAYS * MS.DAY };
  }
}

export function isLive(entry: CacheEntry, now: number, sessionId: string | null, configVersion: number): boolean {
  if (CACHE.INVALIDATE_ALL_ON_REMOTE_CONFIG_VERSION_CHANGE && entry.configVersion !== configVersion) return false;
  if (entry.sessionId !== undefined) return entry.sessionId === sessionId;
  return entry.expiresAt !== undefined && entry.expiresAt > now;
}

export interface CacheStore {
  get(key: string): Promise<CacheEntry | undefined>;
  put(entry: CacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export class MemoryCacheStore implements CacheStore {
  readonly entries = new Map<string, CacheEntry>();
  async get(key: string) {
    return this.entries.get(key);
  }
  async put(entry: CacheEntry) {
    this.entries.set(entry.key, entry);
  }
  async delete(key: string) {
    this.entries.delete(key);
  }
  async clear() {
    this.entries.clear();
  }
}

export class VerdictCache {
  constructor(
    private readonly store: CacheStore,
    private readonly ctx: { now: () => number; sessionId: () => string | null; configVersion: () => number },
  ) {}

  async lookup(taskId: string, itemKey: ItemKey): Promise<CacheEntry | undefined> {
    const key = cacheKey(taskId, itemKey);
    const entry = await this.store.get(key);
    if (!entry) return undefined;
    if (!isLive(entry, this.ctx.now(), this.ctx.sessionId(), this.ctx.configVersion())) {
      await this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async record(taskId: string, itemKey: ItemKey, patch: { decision?: CachedDecision; tier3?: Tier3Cached }): Promise<void> {
    const key = cacheKey(taskId, itemKey);
    const now = this.ctx.now();
    const sessionId = this.ctx.sessionId() ?? "";
    const existing = await this.lookup(taskId, itemKey);
    await this.store.put({
      ...(existing ?? {}),
      ...patch,
      key,
      kind: itemKey.kind,
      configVersion: this.ctx.configVersion(),
      createdAt: existing?.createdAt ?? now,
      ...expiryFor(itemKey.kind, now, sessionId),
    });
  }

  async forget(taskId: string, itemKey: ItemKey): Promise<void> {
    await this.store.delete(cacheKey(taskId, itemKey));
  }

  /** Called when the remote config version changes (BE-03). */
  async invalidateAll(): Promise<void> {
    await this.store.clear();
  }
}
