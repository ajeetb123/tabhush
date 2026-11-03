// Build-time step (Q-14): writes the redaction lists into the extension package.
//   dictionary   SCOWL 2020.12.07, english-words + american-words, sizes up to 35 (49,811 words)
//   first names  SSA national baby names: the top N names by total births, all years, both sexes
// Nothing is fetched at runtime (INV-05). SCOWL's copyright notice ships with the list, as its
// license requires. ssa.gov refuses automated downloads, so names.zip is downloaded by hand.
//
// Usage:
//   node scripts/build-lexicons.mjs --names ~/Downloads/names.zip [--scowl <scowl .tar.gz path or URL>]

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { REDACTION } from "../packages/core/src/constants.ts";
import { fileURLToPath } from "node:url";

const SCOWL_URL = "https://downloads.sourceforge.net/wordlist/scowl-2020.12.07.tar.gz";
const SCOWL_CATEGORIES = ["english-words", "american-words"];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const namesZip = arg("names");
const scowlSrc = arg("scowl") ?? SCOWL_URL;
const outDir = arg("out") ?? fileURLToPath(new URL("../apps/desktop/public/lexicon/", import.meta.url));
if (!namesZip || !existsSync(namesZip)) {
  console.error("Pass --names <path to SSA names.zip> (download it by hand from ssa.gov).");
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "tabhush-lexicon-"));

// ───────────── dictionary ─────────────
let tarball = scowlSrc;
if (/^https?:/.test(scowlSrc)) {
  const res = await fetch(scowlSrc);
  if (!res.ok) throw new Error(`${scowlSrc}: HTTP ${res.status}`);
  tarball = join(work, "scowl.tar.gz");
  writeFileSync(tarball, Buffer.from(await res.arrayBuffer()));
}
execFileSync("tar", ["-xzf", tarball, "-C", work]);
const root = readdirSync(work).map((d) => join(work, d)).find((d) => existsSync(join(d, "final")));
if (!root) throw new Error("no final/ directory in the SCOWL archive");

const words = new Set();
for (const f of readdirSync(join(root, "final"))) {
  const m = f.match(/^(.+)\.(\d+)$/);
  if (!m || !SCOWL_CATEGORIES.includes(m[1]) || Number(m[2]) > REDACTION.DICTIONARY_MAX_SCOWL_SIZE) continue;
  // SCOWL v1 lists are ISO-8859-1.
  for (const w of readFileSync(join(root, "final", f), "latin1").split(/\r?\n/)) if (w.trim()) words.add(w.trim().toLowerCase());
}
const notice = ["Copyright", "README"].map((f) => join(root, f)).find(existsSync);
if (!notice) throw new Error("SCOWL copyright notice not found in the archive");

// ───────────── first names ─────────────
const totals = new Map();
const raw = execFileSync("unzip", ["-p", namesZip, "yob*.txt"], { maxBuffer: 1 << 30 }).toString("utf8");
for (const line of raw.split(/\r?\n/)) {
  const [name, , count] = line.split(",");
  if (!name || !count) continue;
  const k = name.trim().toLowerCase();
  totals.set(k, (totals.get(k) ?? 0) + Number(count));
}
const firstNames = [...totals.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .slice(0, REDACTION.FIRST_NAME_COUNT)
  .map(([n]) => n);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "dictionary.txt"), [...words].sort().join("\n") + "\n");
writeFileSync(join(outDir, "first-names.txt"), firstNames.join("\n") + "\n");
writeFileSync(join(outDir, "SCOWL-NOTICE.txt"), readFileSync(notice, "latin1"));
console.log(`dictionary   ${words.size} words (SCOWL sizes <= ${REDACTION.DICTIONARY_MAX_SCOWL_SIZE})`);
console.log(`first names  ${firstNames.length} of ${totals.size} SSA names`);
