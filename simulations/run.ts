// The runner.  `pnpm sim`
//
// Executed through vitest so the TypeScript engine loads without a build step —
// the same trick scripts/sim.ts used. It is not a test suite: nothing here
// asserts anything about balance, and nothing can fail because a number moved.
// Vitest is the loader, not the judge.
//
// Reports go to the terminal always, and to simulations/reports/*.md only when
// asked (SIM_WRITE=1), because a harness must never change anything without
// being told to — including files.

import fs from "node:fs";
import path from "node:path";
import { it } from "vitest";
import { HARNESSES } from "./core/registry";
import { diffBaseline, loadBaseline, writeBaseline } from "./core/baseline";
import { toMarkdown, toTerminal } from "./core/report";
import { seedGrid } from "./core/stats";
import type { RunContext } from "./core/types";

const OUT = path.join(process.cwd(), "simulations", "reports");
const WRITE = process.env.SIM_WRITE === "1";
const UPDATE_BASELINE = process.env.SIM_BASELINE === "1";
const ONLY = process.env.SIM_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);

const ctx: RunContext = { seeds: seedGrid() };

const chosen = ONLY?.length ? HARNESSES.filter((h) => ONLY.includes(h.id)) : HARNESSES;

it("balance harnesses", () => {
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  const allMetrics: Record<string, number> = {};

  for (const harness of chosen) {
    const report = harness.run(ctx);
    console.log(toTerminal(report));

    for (const [k, v] of Object.entries(report.metrics)) allMetrics[k] = v;

    if (WRITE) {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, `${report.id}.md`), toMarkdown(report, stamp));
    }
  }

  // The diff is the actual product: it turns "I changed the cost curve and it
  // feels better" into "payback on Grange L7 fell from 340 turns to 210, and
  // nothing else moved".
  const baseline = loadBaseline();
  if (baseline) {
    const changes = diffBaseline(baseline, allMetrics, chosen.length !== HARNESSES.length);
    console.log(
      changes.length
        ? "\n" +
            ["── Since the baseline " + "─".repeat(56), ...changes.map((c) => "  " + c)].join("\n")
        : "\n  No headline metric moved since the baseline.",
    );
  } else {
    console.log("\n  No baseline recorded. Run with SIM_BASELINE=1 to write one.");
  }

  if (UPDATE_BASELINE) {
    // Merge rather than replace: a subset run must not silently drop every
    // metric the harnesses it skipped were responsible for.
    writeBaseline({ ...(baseline ?? {}), ...allMetrics });
    console.log(`  Baseline updated (${Object.keys(allMetrics).length} metrics).`);
  }

  if (WRITE) console.log(`\n  Reports written to simulations/reports/`);
  console.log(
    "\n  These reports describe the game as it is. They decide nothing — no constant\n" +
      "  was changed, and no harness can fail a build.\n",
  );
});
