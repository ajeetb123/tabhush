// IndexedDB storage (EXT-04): task registry, verdict cache, labels, review records, the tier 3
// call log, and ended sessions. chrome.storage holds only small settings.

import type { CacheEntry, CacheStore, Label, ReviewRecord, Task } from "@lockin/core";
import { BRAND } from "@lockin/core";

const DB_NAME = BRAND.ID;
const DB_VERSION = 1;

export type StoreName = "tasks" | "cache" | "labels" | "review" | "tier3log" | "sessions";

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("tasks", { keyPath: "id" });
      db.createObjectStore("cache", { keyPath: "key" });
      db.createObjectStore("labels", { autoIncrement: true });
      db.createObjectStore("review", { autoIncrement: true });
      db.createObjectStore("tier3log", { autoIncrement: true });
      db.createObjectStore("sessions", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const req = fn(tx.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const db = {
  get: <T>(store: StoreName, key: IDBValidKey) => run<T | undefined>(store, "readonly", (s) => s.get(key)),
  all: <T>(store: StoreName) => run<T[]>(store, "readonly", (s) => s.getAll()),
  put: (store: StoreName, value: unknown) => run(store, "readwrite", (s) => s.put(value)),
  add: (store: StoreName, value: unknown) => run(store, "readwrite", (s) => s.add(value)),
  delete: (store: StoreName, key: IDBValidKey) => run(store, "readwrite", (s) => s.delete(key)),
  clear: (store: StoreName) => run(store, "readwrite", (s) => s.clear()),
  count: (store: StoreName) => run<number>(store, "readonly", (s) => s.count()),
};

export const idbCacheStore: CacheStore = {
  get: (key) => db.get<CacheEntry>("cache", key),
  put: async (entry) => void (await db.put("cache", entry)),
  delete: async (key) => void (await db.delete("cache", key)),
  clear: async () => void (await db.clear("cache")),
};

export const tasks = {
  all: () => db.all<Task>("tasks"),
  get: (id: string) => db.get<Task>("tasks", id),
  put: (t: Task) => db.put("tasks", t),
};

export const labels = {
  add: (l: Label) => db.add("labels", l),
};

export const review = {
  add: (r: ReviewRecord) => db.add("review", r),
  count: () => db.count("review"),
};
