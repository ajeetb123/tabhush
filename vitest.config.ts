import { defineConfig } from "vitest/config";

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify("test-build") },
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
  },
});
