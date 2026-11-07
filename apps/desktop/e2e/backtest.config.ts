// Vitest config for the backtest only (not part of `npm test`): the real model runs in Node, so the
// Node build of transformers.js is used instead of the browser one Vite would pick. The package's
// exports map doesn't allow the deep import, so the file is aliased by path.
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { defineConfig } from "vitest/config";

// require() resolves the package to dist/transformers.node.cjs; the ESM build sits next to it.
const transformers = join(dirname(createRequire(import.meta.url).resolve("@huggingface/transformers")), "transformers.node.mjs");

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify("backtest") },
  resolve: { alias: { "@huggingface/transformers": transformers } },
  test: { include: ["e2e/backtest.ts"], testTimeout: 30 * 60 * 1000, silent: false, disableConsoleIntercept: true },
});
