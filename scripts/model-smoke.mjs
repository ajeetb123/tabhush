// Gate A helper: loads the bundled tier 2 model the way the offscreen document does (local files
// only, int8) and prints the CLS-33 label term for each item. Run after fetch-model:
//   node scripts/model-smoke.mjs "Lab report chemistry" "Titration lab report draft docs.google.com" ...
// Node uses native ONNX Runtime, so timings here are not the browser's (QA-50 is measured in Chrome).
import { env, pipeline } from "@huggingface/transformers";
import { EMBEDDING } from "../packages/core/src/constants.ts";

const [label, ...items] = process.argv.slice(2);
if (!label || items.length === 0) {
  console.error('usage: node scripts/model-smoke.mjs "<task label>" "<title domain>" ...');
  process.exit(1);
}
env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = new URL("../apps/desktop/public/models/", import.meta.url).pathname;
const fe = await pipeline("feature-extraction", EMBEDDING.HF_REPO, { dtype: EMBEDDING.TRANSFORMERS_DTYPE });
const [l, ...v] = (await fe([label, ...items], { pooling: "mean", normalize: true })).tolist();
const cos = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
items.forEach((t, i) => console.log(cos(l, v[i]).toFixed(3), t));
