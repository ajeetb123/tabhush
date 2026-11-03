// Shipped domain-category lists (Q-08, Q-48), built by scripts/build-categories.mjs into the app's
// resources. Missing files mean no category signal (the on-device parking path then never parks).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORY_LIST, type Category } from "@tabhush/core";

export class Categories {
  private table: Map<string, Category> | null = null;
  private sets = new Map<string, Set<string>>();

  constructor(private readonly dir: string) {}

  private list(name: string): string[] {
    try {
      return readFileSync(join(this.dir, `${name}.txt`), "utf8").split("\n").map((d) => d.trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  private set(name: string): Set<string> {
    let s = this.sets.get(name);
    if (!s) this.sets.set(name, (s = new Set(this.list(name))));
    return s;
  }

  /** Domain → category. When a domain is in two lists, the first in CATEGORY_LIST.MAPPING wins. */
  categoryTable(): ReadonlyMap<string, Category> {
    if (!this.table) {
      this.table = new Map();
      for (const category of Object.values(CATEGORY_LIST.MAPPING)) for (const d of this.list(category)) if (!this.table.has(d)) this.table.set(d, category);
    }
    return this.table;
  }

  underground(): ReadonlySet<string> {
    return this.set("underground");
  }

  banking(): ReadonlySet<string> {
    return this.set("banking");
  }
}
