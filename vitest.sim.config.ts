import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/sim.ts"],
    testTimeout: 120000,
  },
});
