import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The harness runner is not a test suite — nothing in it asserts anything
    // about balance and nothing can fail. Vitest is only the TypeScript loader.
    include: ["simulations/run.ts"],
    testTimeout: 300000,
  },
  resolve: {
    // Same `@/*` alias as tsconfig and vitest.config.ts — the harnesses import
    // the real constants and engine, which reach app-facing modules.
    alias: { "@": path.resolve(__dirname) },
  },
});
