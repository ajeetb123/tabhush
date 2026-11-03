// The classifier window: tier 2 embedding with Transformers.js on ONNX Runtime Web (CLS-20), in a
// hidden window of the app (DSK-01: the same WASM module as the extension, not rewritten).
// The model and the WASM runtime are bundled in the app (INV-05); remote loading is off.

import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";
import { EMBEDDING } from "@tabhush/core";
import "./common"; // the window.tabhush type
// The ONNX Runtime WASM binary, emitted into the package by Vite (no CDN, INV-05). The default
// onnxruntime-web build embeds its JS glue, so only the .wasm path is set.
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm?url";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.useBrowserCache = false;
env.localModelPath = new URL("models/", location.href).href;
env.remoteHost = new URL("models/", location.href).href; // never the Hugging Face Hub, even if a flag regresses
const wasm = env.backends.onnx.wasm;
if (wasm) {
  // Replaces Transformers.js's CDN default ({mjs, wasm} on jsdelivr) set at import time.
  wasm.wasmPaths = { wasm: new URL(ortWasmUrl, location.href).href };
  // Threads need cross-origin isolation; one thread keeps the document simple.
  wasm.numThreads = 1;
}

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function load(): Promise<FeatureExtractionPipeline> {
  extractor ??= pipeline("feature-extraction", EMBEDDING.HF_REPO, {
    dtype: EMBEDDING.TRANSFORMERS_DTYPE,
    device: "wasm",
  }) as Promise<FeatureExtractionPipeline>;
  return extractor;
}

async function embed(texts: string[]): Promise<number[][]> {
  const fe = await load();
  // Item text is cut to 64 tokens (EMBEDDING.MAX_INPUT_TOKENS) before the model sees it.
  const cut = texts.map((t) => {
    const ids = fe.tokenizer.encode(t, { add_special_tokens: false });
    return ids.length <= EMBEDDING.MAX_INPUT_TOKENS ? t : fe.tokenizer.decode(ids.slice(0, EMBEDDING.MAX_INPUT_TOKENS));
  });
  const output = await fe(cut, { pooling: "mean", normalize: true });
  return output.tolist() as number[][];
}

window.tabhush.onEmbed(embed);
