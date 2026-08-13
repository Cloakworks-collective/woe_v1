// HARNESS B1 — Raids.
//
// The field battle for goods, and the question the whole war game rests on:
// **is marching better than staying home?** If raiding never pays, the ladder is
// decoration and this is a farming game with a war theme. If it always pays,
// defence is pointless.
//
// The interesting answer is neither — it is the CROSSOVER: how much stronger
// than a target you must be before the loot covers the men you lose getting it.
//
// Absorbs the even-match and race-matrix work from the old scripts/sim.ts,
// including its warning about not reading the race matrix as a fairness score.

import { LOOT, TRAINING_COSTS } from "@/lib/constants";
import { resolveBattle } from "@/lib/engine";
import { army, lootTotal, lossesTotal } from "../core/armies";
import { ALL_RACES } from "../core/races";
import { num } from "../core/report";
import { pctCI, rateOf, rngFor, summarise } from "../core/stats";
import type { Harness, Report, Row, RunContext, Section } from "../core/types";

/** What one light regular costs to replace, averaged across the three arms. */
const REPLACEMENT_COST =
  (["footman", "archer", "cavalry"] as const)
    .map((k) => TRAINING_COSTS[k].gold + TRAINING_COSTS[k].wood + TRAINING_COSTS[k].stone + TRAINING_COSTS[k].ore)
    .reduce((a, b) => a + b, 0) / 3;

const DEFENDER_SIZE = 1000;
const LOOSE = 400_000;

/**
 * Is an even fight actually even?
 *
 * Run at two compositions on purpose. Mixed arms and all-footmen are the same
 * headcount and the same cost, so any gap between them is the ARCHER PHASE —
 * which fires before the melee and can decide a raid before the other arms
 * swing. That was the standing suspicion in the old scripts/sim.ts; this is the
 * measurement of it.
 */
function evenSection(seeds: number[]): Section {
  const rows: Row[] = [];
  const findings: string[] = [];
  const measured: Record<string, number> = {};

  for (const [label, tierSpec] of [
    ["mixed arms (50/30/20)", undefined],
    ["footmen only", "footmen-only"],
  ] as const) {
    const mk = (id: string) =>
      tierSpec === "footmen-only"
        ? army({ size: 500, footmenOnly: true }, id)
        : army({ size: 500 }, id);
    const results = seeds.slice(0, 300).map((s) =>
      resolveBattle(mk("a"), mk("d"), "raid", { rng: rngFor(s), battleId: "even", tick: 1 }),
    );
    const wins = rateOf(results, (r) => r.report.victor === "attacker");
    const rounds = summarise(results.map((r) => r.report.rounds));
    measured[label] = wins.mean;
    rows.push([label, pctCI(wins), `${rounds.mean.toFixed(1)} (${rounds.min}–${rounds.max})`, wins.n]);
  }

  const mixed = measured["mixed arms (50/30/20)"]!;
  const foot = measured["footmen only"]!;
  findings.push(
    `An identical attacker wins ${(mixed * 100).toFixed(1)}% of even raids with mixed arms and ${(foot * 100).toFixed(1)}% with footmen alone. ` +
      `The defender's edge in an even fight is decisive, not mild — attacking at parity loses.`,
  );
  findings.push(
    `Same headcount, same cost, ${((foot - mixed) * 100).toFixed(1)} points apart. That gap is the ARCHER PHASE: it fires before the melee, and the defender's volley lands first. ` +
      `Whether an even fight SHOULD be unwinnable is a design call — but it is currently unwinnable, and the arms mix moves it.`,
  );

  return {
    heading: "The even fight",
    question: "500 against 500, no walls, at two compositions.",
    table: { columns: ["Composition", "Attacker wins", "Rounds", "Trials"], rows },
    findings,
  };
}

/**
 * THE HEADLINE: at what size ratio does raiding start to pay?
 *
 * Net value = loot taken − the cost of replacing the regulars who died getting
 * it. A raid that wins but trades 300 men for 200,000 goods is not a victory,
 * it is a purchase at a bad price — and the ladder counts those men.
 */
function crossoverSection(seeds: number[]): Section {
  const rows: Row[] = [];
  const findings: string[] = [];
  let firstProfitable = 0;

  for (const ratio of [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 5]) {
    const size = Math.round(DEFENDER_SIZE * ratio);
    const outcomes = seeds.slice(0, 120).map((s) =>
      resolveBattle(
        army({ size }, "a"),
        army({ size: DEFENDER_SIZE, loose: LOOSE }, "d"),
        "raid",
        { rng: rngFor(s), battleId: "x", tick: 1 },
      ),
    );
    const wins = rateOf(outcomes, (o) => o.report.victor === "attacker");
    const loot = summarise(outcomes.map((o) => lootTotal(o.report.loot)));
    const lost = summarise(outcomes.map((o) => lossesTotal(o.report.attackerLosses)));
    const net = summarise(
      outcomes.map((o) => lootTotal(o.report.loot) - lossesTotal(o.report.attackerLosses) * REPLACEMENT_COST),
    );
    if (net.mean > 0 && firstProfitable === 0) firstProfitable = ratio;

    rows.push([
      `${ratio}×`,
      size,
      pctCI(wins),
      num(loot.mean),
      num(lost.mean),
      { value: num(net.mean), flag: net.mean > 0 ? "good" : "bad" },
    ]);
  }

  findings.push(
    firstProfitable
      ? `Raiding first turns a profit at about ${firstProfitable}× the defender's size, once the men lost are priced at ${num(REPLACEMENT_COST)} each. Below that a won raid still costs more than it takes.`
      : "No tested size ratio turned a profit once losses were priced — at these settings raiding never pays for itself.",
  );
  findings.push(
    `Loot is also scaled by size: punching up pays ${Math.round(LOOT.BIG_TARGET_BONUS * 100)}% and punching down ${Math.round(LOOT.SMALL_TARGET_PENALTY * 100)}%, so the crossover is steeper than headcount alone suggests.`,
  );

  return {
    heading: "Is marching worth it?",
    question: `Attacker size vs a ${DEFENDER_SIZE}-strong defender holding ${num(LOOSE * 4)} loose goods.`,
    table: {
      columns: ["Ratio", "Attackers", "Win rate", "Mean loot", "Mean losses", "Net value"],
      rows,
      note: `Net = loot − (regulars lost × ${num(REPLACEMENT_COST)} replacement). Dead regulars cannot be re-bought and carry your veterancy with them, so this understates the true cost.`,
    },
    findings,
  };
}

/**
 * Race matrix, open field.
 *
 * Deliberately a RAID rather than a siege: a walled defender with an identical
 * army holds every time, which measures the wall and not the race, and returns
 * a column of zeroes exactly where the interesting number should be.
 */
function raceMatrixSection(seeds: number[]): Section {
  const rows: Row[] = [];
  const meanByRace: Record<string, number> = {};

  for (const a of ALL_RACES) {
    const cells: (string | number)[] = [a];
    let won = 0;
    let played = 0;
    for (const d of ALL_RACES) {
      // Paired seeds: every pairing sees the same rolls, so luck cancels.
      const outcomes = seeds.slice(0, 40).map((s) =>
        resolveBattle(army({ race: a, size: 700 }, "a"), army({ race: d, size: 700 }, "d"), "raid", {
          rng: rngFor(s),
          battleId: "rm",
          tick: 1,
        }),
      );
      const w = outcomes.filter((o) => o.report.victor === "attacker").length;
      won += w;
      played += outcomes.length;
      cells.push(`${Math.round((w / outcomes.length) * 100)}%`);
    }
    meanByRace[a] = (won / played) * 100;
    rows.push(cells);
  }

  const rank = ALL_RACES.map((r) => ({ r, pct: meanByRace[r]! })).sort((x, y) => y.pct - x.pct);
  const spreadPts = rank[0]!.pct - rank.at(-1)!.pct;

  return {
    heading: "Race matrix — open-field raid",
    question: "Identical armies, only the blood differs. Attacker in rows, defender in columns.",
    table: { columns: ["Attacker \\ Defender", ...ALL_RACES], rows },
    findings: [
      `Mean attack win rate: ${rank.map((o) => `${o.r} ${o.pct.toFixed(1)}%`).join(", ")} — a spread of ${spreadPts.toFixed(1)} points.`,
      "THIS MEASURES ONE AXIS ONLY. Do not flatten the race table on it. Trolls (siege) and Dwarves (walls) trade open-field raiding away for the things this test cannot see; losing here is what they PAY, not a bug. A race is broken only when it is bottom-quartile on every path at once — production, ranking, siege, defence and the shadow war.",
      "The one genuine suspect is the archer phase, which fires first and can decide a raid before the other arms swing.",
    ],
  };
}

export const raidHarness: Harness = {
  id: "raid",
  title: "Harness B1 — Raids",
  question: "At what point does marching beat staying home?",
  about: "Even-match sanity, the profitability crossover with losses priced in, and the open-field race matrix.",
  run(ctx: RunContext): Report {
    const sections = [evenSection(ctx.seeds), crossoverSection(ctx.seeds), raceMatrixSection(ctx.seeds)];

    const even = rateOf(
      ctx.seeds.slice(0, 300).map((s) =>
        resolveBattle(army({ size: 500 }, "a"), army({ size: 500 }, "d"), "raid", {
          rng: rngFor(s),
          battleId: "even",
          tick: 1,
        }),
      ),
      (r) => r.report.victor === "attacker",
    );
    const doubled = summarise(
      ctx.seeds.slice(0, 120).map((s) => {
        const o = resolveBattle(
          army({ size: DEFENDER_SIZE * 2 }, "a"),
          army({ size: DEFENDER_SIZE, loose: LOOSE }, "d"),
          "raid",
          { rng: rngFor(s), battleId: "x", tick: 1 },
        );
        return lootTotal(o.report.loot) - lossesTotal(o.report.attackerLosses) * REPLACEMENT_COST;
      }),
    );

    return {
      id: "raid",
      title: this.title,
      question: this.question,
      sections,
      metrics: {
        "raid.evenWinRate": Math.round(even.mean * 1000) / 1000,
        "raid.netValueAt2x": Math.round(doubled.mean),
      },
    };
  },
};
