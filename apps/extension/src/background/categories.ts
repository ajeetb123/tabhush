// Shipped domain-category list and banking domains (Q-08, Q-48), bundled at build time by
// scripts/build-categories.mjs. Missing files mean no category signal: the on-device parking
// path then never parks (it needs a category, CLS-21) and banking falls back to the static lists.

import { CATEGORY_LIST, type Category } from "@lockin/core";

async function readList(path: string): Promise<string[]> {
  try {
    const res = await fetch(chrome.runtime.getURL(path));
    if (!res.ok) return [];
    return (await res.text()).split("\n").map((d) => d.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

let table: Promise<ReadonlyMap<string, Category>> | null = null;
let banking: Promise<ReadonlySet<string>> | null = null;

/** Domain → category. When a domain is in two lists, the first in CATEGORY_LIST.MAPPING wins. */
export function getCategoryTable(): Promise<ReadonlyMap<string, Category>> {
  table ??= (async () => {
    const map = new Map<string, Category>();
    for (const category of Object.values(CATEGORY_LIST.MAPPING)) {
      for (const d of await readList(`categories/${category}.txt`)) if (!map.has(d)) map.set(d, category);
    }
    return map;
  })();
  return table;
}

export function getBankingDomains(): Promise<ReadonlySet<string>> {
  banking ??= readList("categories/banking.txt").then((l) => new Set(l));
  return banking;
}
