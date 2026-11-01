// Content scripts cannot be ES modules, so content.js is built on its own as one IIFE file.
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: false,
    target: "chrome120",
    lib: {
      entry: resolve(__dirname, "src/content/content.ts"),
      formats: ["iife"],
      name: "lockinContent",
      fileName: () => "content.js",
    },
  },
});
