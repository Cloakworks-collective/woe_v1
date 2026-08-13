import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // The simulations guard runs with the normal suite on purpose: a check that
    // the harnesses cannot reach the database is worthless if it only runs when
    // somebody remembers to run the harnesses.
    include: ["lib/**/*.test.ts", "simulations/**/*.test.ts"],
  },
  resolve: {
    // Mirror the `@/*` alias from tsconfig. Engine tests use relative imports and
    // never needed it, but anything reaching into app-facing modules (the balance
    // catalog, for one) hits `@/` on the way in.
    alias: { "@": path.resolve(__dirname) },
  },
});
