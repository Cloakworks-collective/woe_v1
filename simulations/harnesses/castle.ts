// HARNESS B2 — The castle assault.
//
// The full chain: the counter-engine duel, then the walls, then the storm — and
// only then the treasury. It is the expensive attack, and the question is
// whether the wall you paid for actually buys you anything.
//
// The measure is HOW MANY ATTACKERS a wall level is worth. If a Citadel turns
// away three times its own weight, walls are the best defensive purchase in the
// game; if it turns away 1.1×, nobody should ever build past level 1.
//
// Absorbs the "siege matchups" grid from the old scripts/sim.ts, with the
// single fixed seed replaced by a real seed grid — one seed told you what
// happened once, not what happens.

import { WALL_NAMES } from "@/lib/constants";
import { resolveBattle } from "@/lib/engine";
import { army, lossesTotal } from "../core/armies";
import { num } from "../core/report";
import { pctCI, rateOf, rngFor, summarise } from "../core/stats";
import type { Harness, Report, Row, RunContext, Section } from "../core/types";

const DEFENDER = 500;
const TREASURY = 500_000;

/** Smallest attacker that takes the castle at least half the time. */
function breakpointFor(walls: number, seeds: number[]): { size: number; ratio: number } | null {
  for (const size of [500, 625, 750, 1000, 1250, 1500, 2000, 3000, 4000, 6000]) {
    const wins = rateOf(
      seeds.slice(0, 40).map((s) =>
        resolveBattle(
          army({ size, siegePer100: 4 }, "a"),
          army({ size: DEFENDER, walls, gold: TREASURY }, "d"),
          "siege",
          { rng: rngFor(s), battleId: "b", tick: 1 },
        ),
      ),
      (o) => o.report.victor === "attacker",
    );
    if (wins.mean >= 0.5) return { size, ratio: size / DEFENDER };
  }
  return null;
}

/** What each wall level is worth, in attackers turned away. */
function wallValueSection(seeds: number[]): Section {
  const rows: Row[] = [];
  const findings: string[] = [];
  let previous: number | null = null;

  for (const walls of [0, 1, 3, 5, 8, 10]) {
    const bp = breakpointFor(walls, seeds);
    const marginal = bp && previous ? bp.ratio - previous : null;
    rows.push([
      walls === 0 ? "none" : `L${walls} ${WALL_NAMES[walls] ?? ""}`,
      bp ? bp.size : "> 6,000",
      bp ? `${bp.ratio.toFixed(2)}×` : "—",
      marginal !== null ? `+${marginal.toFixed(2)}×` : "—",
    ]);
    if (bp) previous = bp.ratio;
  }

  const first = rows.find((r) => r[0] === "none");
  const last = rows.at(-1);
  findings.push(
    `A ${DEFENDER}-strong garrison behind no wall falls to ${first?.[1]} attackers; behind a Citadel it takes ${last?.[1]}.`,
  );
  findings.push(
    "The marginal column is the one that matters for pricing: if a level adds little to the ratio while costing 1.5× the last, it is a level nobody should buy.",
  );

  return {
    heading: "What a wall is worth",
    question: `Smallest attacker that takes a ${DEFENDER}-strong castle at least half the time.`,
    table: {
      columns: ["Wall", "Attackers needed", "Ratio", "Marginal gain"],
      rows,
      note: "Attackers bring a siege train scaled to their numbers (4 engines per 100 regulars, fully crewed) — without engines the wall is never engaged and its level cannot matter.",
    },
    findings,
  };
}

/** Castle takes GOLD; the harness should show what actually comes home. */
function spoilsSection(seeds: number[]): Section {
  const rows: Row[] = [];
  for (const walls of [0, 5, 10]) {
    for (const size of [1000, 2000]) {
      const outcomes = seeds.slice(0, 60).map((s) =>
        resolveBattle(
          army({ size, siegePer100: 4 }, "a"),
          army({ size: DEFENDER, walls, gold: TREASURY }, "d"),
          "siege",
          { rng: rngFor(s), battleId: "sp", tick: 1 },
        ),
      );
      const wins = rateOf(outcomes, (o) => o.report.victor === "attacker");
      const gold = summarise(outcomes.map((o) => o.report.loot.gold));
      const lost = summarise(outcomes.map((o) => lossesTotal(o.report.attackerLosses)));
      const wallDmg = summarise(outcomes.map((o) => o.report.wallIntegrityDamage ?? 0));
      rows.push([
        walls === 0 ? "none" : `L${walls}`,
        size,
        pctCI(wins),
        num(gold.mean),
        num(lost.mean),
        `${Math.round(wallDmg.mean * 100)}%`,
      ]);
    }
  }
  return {
    heading: "What the storm brings home",
    question: `Against a treasury of ${num(TREASURY)} gold.`,
    table: {
      columns: ["Wall", "Attackers", "Win rate", "Mean gold", "Mean losses", "Wall damage"],
      rows,
      note: "A castle assault takes gold and never goods — that is what makes bombard→raid→castle a campaign rather than one button.",
    },
  };
}

export const castleHarness: Harness = {
  id: "castle",
  title: "Harness B2 — The castle assault",
  question: "How much wall stops how much army, and what does each level actually buy?",
  about: "Finds the attacker size that takes a castle at each wall level, and prices the spoils against the losses.",
  run(ctx: RunContext): Report {
    const sections = [wallValueSection(ctx.seeds), spoilsSection(ctx.seeds)];
    const none = breakpointFor(0, ctx.seeds);
    const citadel = breakpointFor(10, ctx.seeds);
    return {
      id: "castle",
      title: this.title,
      question: this.question,
      sections,
      metrics: {
        "castle.breakpoint.noWall": none?.size ?? -1,
        "castle.breakpoint.citadel": citadel?.size ?? -1,
        "castle.citadelRatio": citadel ? Math.round(citadel.ratio * 100) / 100 : -1,
      },
    };
  },
};
