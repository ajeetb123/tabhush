// The app's pages and the classifier window (Q-70). Built into dist/renderer and served to the
// windows from app://tabhush/. Public files (model, category lists, fonts, icons) are copied as is.
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const src = resolve(import.meta.dirname, "src/renderer");

// INV-05 belt and braces: Transformers.js carries a jsdelivr default for the ONNX Runtime files.
// The classifier window overrides it, and the string is removed from the bundle as well.
const CDN_DEFAULTS = ["https://cdn.jsdelivr.net/npm/onnxruntime-web@"];

function stripRemoteDefaults(): Plugin {
  return {
    name: "tabhush-strip-remote-defaults",
    renderChunk(code) {
      let out = code;
      for (const s of CDN_DEFAULTS) out = out.split(s).join("./unavailable-remote/");
      return out === code ? null : { code: out, map: null };
    },
  };
}

export default defineConfig({
  root: src,
  publicDir: resolve(import.meta.dirname, "public"),
  base: "",
  build: {
    outDir: resolve(import.meta.dirname, "dist/renderer"),
    emptyOutDir: true,
    target: "chrome130",
    modulePreload: false,
    rollupOptions: {
      input: {
        session: resolve(src, "session.html"),
        report: resolve(src, "report.html"),
        settings: resolve(src, "settings.html"),
        embedder: resolve(src, "embedder.html"),
      },
    },
  },
  plugins: [stripRemoteDefaults()],
});
