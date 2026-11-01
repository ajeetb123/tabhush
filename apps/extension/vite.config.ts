// MV3 build (Q-02: TypeScript + Vite). Pages, the service worker and the offscreen document are
// ES modules; the content script is built separately as one classic file (vite.content.config.ts).
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import { manifest } from "./manifest";

const src = resolve(__dirname, "src");

// INV-05 belt and braces: Transformers.js carries a jsdelivr default for the ONNX Runtime files.
// The offscreen document overrides it, and the string is removed from the bundle as well.
const CDN_DEFAULTS = ["https://cdn.jsdelivr.net/npm/onnxruntime-web@"];

function stripRemoteDefaults(): Plugin {
  return {
    name: "lockin-strip-remote-defaults",
    renderChunk(code) {
      let out = code;
      for (const s of CDN_DEFAULTS) out = out.split(s).join("./unavailable-remote/");
      return out === code ? null : { code: out, map: null };
    },
  };
}

function writeManifest(): Plugin {
  return {
    name: "lockin-manifest",
    writeBundle(opts) {
      const dir = opts.dir ?? resolve(__dirname, "dist");
      mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig({
  root: src,
  publicDir: resolve(__dirname, "public"),
  base: "",
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    target: "chrome120",
    modulePreload: false,
    rollupOptions: {
      input: {
        background: resolve(src, "background/index.ts"),
        popup: resolve(src, "ui/popup.html"),
        session: resolve(src, "ui/session.html"),
        consent: resolve(src, "ui/consent.html"),
        options: resolve(src, "ui/options.html"),
        blocked: resolve(src, "ui/blocked.html"),
        report: resolve(src, "ui/report.html"),
        offscreen: resolve(src, "offscreen/offscreen.html"),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
      },
    },
  },
  plugins: [stripRemoteDefaults(), writeManifest()],
});
