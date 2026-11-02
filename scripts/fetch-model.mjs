// Build-time step: puts the tier 2 model inside the app package (CLS-23, INV-05). The
// ONNX Runtime WASM binary is emitted by Vite from node_modules. Nothing is downloaded at runtime (no remote code).
//
// Model: Xenova/all-MiniLM-L6-v2 at a pinned revision (CONSTANTS.md EMBEDDING), int8 ONNX ~23 MB.
// Run: npm run fetch-model -w @lockin/desktop

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "Xenova/all-MiniLM-L6-v2";
const REVISION = "751bff37182d3f1213fa05d7196b954e230abad9";
const FILES = ["config.json", "tokenizer.json", "tokenizer_config.json", "onnx/model_int8.onnx"];
const EXPECTED_ONNX_BYTES = 22972370;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ext = join(root, "apps/desktop/public");
const modelDir = join(ext, "models", REPO);

for (const f of FILES) {
  const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${f}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (f.endsWith(".onnx") && buf.length !== EXPECTED_ONNX_BYTES) {
    throw new Error(`${f}: expected ${EXPECTED_ONNX_BYTES} bytes, got ${buf.length}`);
  }
  const out = join(modelDir, f);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, buf);
  console.log(`model  ${f}  ${buf.length} bytes`);
}
