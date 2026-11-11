import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/core/**/*.test.ts"],
    setupFiles: ["tests/support/load-env.ts"],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    // Test files run in parallel: every test builds its own Brand, so tenants never collide.
    maxWorkers: 4,
  },
});
