// Builds the app (Q-70): the Swift helper (universal binary), the main process and preload
// (esbuild), and the pages (Vite). Output: build/tabhush-helper, dist/.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { build as viteBuild } from "vite";

const root = dirname(fileURLToPath(import.meta.url));
const out = join(root, "build");
mkdirSync(out, { recursive: true });

// 1. The macOS helper. Rebuilt only when the source is newer than the binary.
const swift = join(root, "native/helper.swift");
const helper = join(out, "tabhush-helper");
if (process.platform !== "darwin") {
  console.log("helper  skipped (macOS only)");
} else if (!existsSync(helper) || statSync(helper).mtimeMs < statSync(swift).mtimeMs) {
  for (const arch of ["arm64", "x86_64"]) {
    execFileSync("swiftc", ["-O", "-target", `${arch}-apple-macos13`, swift, "-o", join(out, `helper-${arch}`)], { stdio: "inherit" });
  }
  execFileSync("lipo", ["-create", join(out, "helper-arm64"), join(out, "helper-x86_64"), "-output", helper], { stdio: "inherit" });
  console.log("helper  build/tabhush-helper");
}

// 2. Main process (ESM) and preload (CommonJS, as sandboxed preloads require).
const common = { bundle: true, platform: "node", target: "node22", external: ["electron"], sourcemap: false, logLevel: "warning" };
// Bundled CommonJS packages (electron-updater and its fs-extra) call require() for Node built-ins;
// an ES module has no require, so the bundle gets one.
const requireShim = 'import { createRequire as __tabhushCreateRequire } from "node:module"; const require = __tabhushCreateRequire(import.meta.url);';
await build({ ...common, entryPoints: [join(root, "src/main/index.ts")], outfile: join(root, "dist/main.js"), format: "esm", banner: { js: requireShim } });
await build({ ...common, entryPoints: [join(root, "src/preload.ts")], outfile: join(root, "dist/preload.cjs"), format: "cjs" });
console.log("main    dist/main.js, dist/preload.cjs");

// 3. Pages and the classifier window.
await viteBuild({ configFile: join(root, "vite.config.ts"), logLevel: "warn" });
console.log("pages   dist/renderer");
