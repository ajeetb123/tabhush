import {
  itemKeyFor,
  judge,
  MemoryCacheStore,
  tier1,
  VerdictCache,
  type JudgeDeps,
  type Tier1Context,
  type Tier3Cached,
} from "../src";

export const CTX: Tier1Context = {
  essentials: [],
  schoolCoursewareDomains: [],
  coursewareFingerprint: false,
  ownExtensionId: "ownextensionid",
};

export function makeCache(now = 1_000_000, sessionId = "s1", configVersion = 1) {
  const store = new MemoryCacheStore();
  const state = { now, sessionId: sessionId as string | null, configVersion };
  const cache = new VerdictCache(store, {
    now: () => state.now,
    sessionId: () => state.sessionId,
    configVersion: () => state.configVersion,
  });
  return { store, cache, state };
}

export interface Scenario {
  url: string;
  s?: number;
  memory?: "related" | "unrelated" | null;
  tier3?: Tier3Cached | "throws" | null;
  overridden?: boolean;
  askBudget?: boolean;
  onDeviceParkingPath?: boolean;
  onDeviceCategory?: JudgeDeps["onDeviceCategory"];
  ctx?: Partial<Tier1Context>;
  order?: JudgeDeps["order"];
  cache?: VerdictCache;
}

export async function run(sc: Scenario) {
  const calls = { tier3: 0, relatedness: 0 };
  const cache = sc.cache ?? makeCache().cache;
  const tier3 =
    sc.tier3 === null || sc.tier3 === undefined
      ? null
      : async () => {
          calls.tier3++;
          if (sc.tier3 === "throws") throw new Error("backend down");
          return sc.tier3 as Tier3Cached;
        };
  const decision = await judge({
    taskId: "t1",
    itemKey: itemKeyFor(sc.url)!,
    tier1: tier1(sc.url, { ...CTX, ...sc.ctx }),
    overridden: sc.overridden ?? false,
    cache,
    relatedness: async () => {
      calls.relatedness++;
      return sc.s ?? 0.1;
    },
    memory: async () => sc.memory ?? null,
    tier3,
    onDeviceParkingPath: sc.onDeviceParkingPath ?? false,
    onDeviceCategory: sc.onDeviceCategory ?? null,
    askBudgetAvailable: () => sc.askBudget ?? true,
    ...(sc.order ? { order: sc.order } : {}),
  });
  return { decision, calls };
}

export const UNRELATED_SURE: Tier3Cached = { verdict: "unrelated", confidence: 0.95, category: "entertainment" };
export const UNRELATED_WEAK: Tier3Cached = { verdict: "unrelated", confidence: 0.5, category: "entertainment" };
export const RELATED: Tier3Cached = { verdict: "related", confidence: 0.3, category: "reference" };
export const UNSURE_V: Tier3Cached = { verdict: "unsure", confidence: 0.9, category: "other" };
