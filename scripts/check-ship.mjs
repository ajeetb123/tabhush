// Release guard (AGENTS.md section 2): a build that still carries a TODO_Q<nn>
// placeholder in the constants module cannot ship. Lists every placeholder and exits 1.
import { readFileSync } from "node:fs";

const file = new URL("../packages/core/src/constants.ts", import.meta.url);
const src = readFileSync(file, "utf8");
const hits = [...src.matchAll(/TODO_Q\d+/g)].map((m) => m[0]);
const unique = [...new Set(hits)].sort();
if (unique.length > 0) {
  console.error(`Cannot ship: ${unique.length} open questions still have placeholders:`);
  for (const q of unique) console.error(`  ${q}  (docs/16-open-questions.md)`);
  process.exit(1);
}
console.log("No TODO_Q placeholders in the constants module.");
