import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
  },
  resolve: {
    // Mirror the `@/*` alias from tsconfig. Engine tests use relative imports and
    // never needed it, but anything reaching into app-facing modules (the balance
    // catalog, for one) hits `@/` on the way in.
    alias: { "@": path.resolve(__dirname) },
  },
});
