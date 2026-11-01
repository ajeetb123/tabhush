// Build-time step (Q-08, Q-48): writes the shipped domain-category lists into the extension
// package. Source: the UT1 web blacklists (Université Toulouse Capitole), CC BY-SA 4.0, taken
// from the olbat/ut1-blacklists mirror at a pinned commit. Nothing is fetched at runtime (INV-05).
//
// Usage:
//   node scripts/build-categories.mjs [--from <dir containing blacklists/<category>/domains>] [--out <dir>]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CATEGORY_LIST } from "../packages/core/src/constants.ts";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const from = arg("from");
const outDir = arg("out") ?? new URL("../apps/extension/public/categories/", import.meta.url).pathname;
const base = `https://raw.githubusercontent.com/${CATEGORY_LIST.MIRROR_REPO}/${CATEGORY_LIST.MIRROR_COMMIT}/blacklists`;

async function domainsOf(ut1Category) {
  let text;
  if (from) text = readFileSync(join(from, "blacklists", ut1Category, "domains"), "utf8");
  else {
    const res = await fetch(`${base}/${ut1Category}/domains`);
    if (!res.ok) throw new Error(`${ut1Category}: HTTP ${res.status}`);
    text = await res.text();
  }
  return [...new Set(text.split(/\r?\n/).map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith("#")))].sort();
}

mkdirSync(outDir, { recursive: true });
const written = [];
for (const [ut1, ours] of Object.entries(CATEGORY_LIST.MAPPING)) {
  const list = await domainsOf(ut1);
  writeFileSync(join(outDir, `${ours}.txt`), list.join("\n") + "\n");
  written.push(`${ours}.txt  ${list.length} domains  (UT1 ${ut1})`);
}
const bank = await domainsOf(CATEGORY_LIST.BANKING);
writeFileSync(join(outDir, "banking.txt"), bank.join("\n") + "\n");
written.push(`banking.txt  ${bank.length} domains  (UT1 ${CATEGORY_LIST.BANKING})`);

// CC BY-SA 4.0: credit the source, link the license, say what changed, keep adaptations BY-SA.
writeFileSync(
  join(outDir, "NOTICE.txt"),
  `These lists are adapted from the UT1 web blacklists by Université Toulouse Capitole
(https://dsi.ut-capitole.fr/blacklists/), via the mirror https://github.com/${CATEGORY_LIST.MIRROR_REPO}
at commit ${CATEGORY_LIST.MIRROR_COMMIT}.

Licensed under Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0),
https://creativecommons.org/licenses/by-sa/4.0/. These adapted lists are shared under the same license.

Changes: only the categories ${Object.keys(CATEGORY_LIST.MAPPING).join(", ")} and ${CATEGORY_LIST.BANKING} are kept;
they are renamed ${Object.entries(CATEGORY_LIST.MAPPING).map(([a, b]) => `${a} -> ${b}`).join(", ")}, ${CATEGORY_LIST.BANKING} -> banking;
entries are lowercased, de-duplicated and sorted.
`,
);
for (const w of written) console.log(w);
