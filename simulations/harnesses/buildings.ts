// HARNESS A — Building & growth.
//
// "Is anything too cheap, or too dear?" answered with a number instead of a
// feeling. No randomness and no opponent: cost and output are pure functions of
// level, so this sweeps a grid and the answers are exact.
//
// The measure is PAYBACK PERIOD — turns until a level repays what it cost. Too
// short and the decision is a no-brainer; too long and nobody ever builds it.
//
// The race twist that makes this more than a spreadsheet: race multiplies
// OUTPUT while a building's price is fixed in resources. The cost of a Mason's
// Quarry is identical for everyone; the time to afford it is not. So every
// payback figure has six answers, and the resource that GATES the build differs
// by race — which is the thing worth printing.

import { CIVILIAN_LEVELLED_IDS, TURNS_PER_DAY, maxLevel, workerOutputAtLevel } from "@/lib/constants";
import { BUILDING_INFO } from "@/lib/constants";
import type { BuildingId } from "@/lib/constants/buildings";
import { buildingCost, type Cost } from "@/lib/engine";
import { ALL_RACES, NEUTRAL, byRace, modifiersFor, spread } from "../core/races";
import { num, turnsToHuman } from "../core/report";
import type { Harness, Report, Row, Section } from "../core/types";
import type { Race, RaceModifiers } from "@/lib/constants/races";

/** The four that turn workers into goods — the only ones with a real payback. */
const PRODUCERS: { id: BuildingId; resource: "food" | "wood" | "stone" | "ore" }[] = [
  { id: "grange", resource: "food" },
  { id: "sawyers_mill", resource: "wood" },
  { id: "masons_quarry", resource: "stone" },
  { id: "deepvein_mine", resource: "ore" },
];

const RESOURCES = ["wood", "stone", "ore"] as const;

const name = (id: BuildingId) => BUILDING_INFO[id]?.title ?? id;

/**
 * How long a race takes to afford a cost, in turns, at a given workforce.
 *
 * The binding constraint is whichever resource takes longest — that is the one
 * actually gating the build, and it is why an ore-heavy building is a different
 * proposition for an Orc (ore 1.4) than an Elf (ore 0.5).
 *
 * Gold is deliberately excluded from the bottleneck: since the 2026-08 economy
 * swing it accumulates orders of magnitude faster than goods and would never be
 * the constraint. If that ever stops being true, this is the line to revisit.
 */
function timeToAfford(
  cost: Cost,
  mods: RaceModifiers,
  workersEach: number,
  producerLevel: number,
): { turns: number; bottleneck: string } {
  const perTurn = (r: (typeof RESOURCES)[number]) =>
    workersEach * workerOutputAtLevel(producerLevel) * mods.production[r];
  let worst = 0;
  let bottleneck = "—";
  for (const r of RESOURCES) {
    const rate = perTurn(r);
    const t = cost[r] > 0 ? (rate > 0 ? cost[r] / rate : Infinity) : 0;
    if (t > worst) {
      worst = t;
      bottleneck = r;
    }
  }
  return { turns: worst, bottleneck };
}

/** Extra output per turn this level adds, for one race, at a given workforce. */
function marginalOutput(
  id: BuildingId,
  level: number,
  mods: RaceModifiers,
  workers: number,
): number {
  const producer = PRODUCERS.find((p) => p.id === id);
  if (!producer) return 0;
  const gain = workerOutputAtLevel(level) - workerOutputAtLevel(level - 1);
  return workers * gain * mods.production[producer.resource];
}

function producerSection(workers: number): Section {
  const rows: Row[] = [];
  const findings: string[] = [];

  for (const { id } of PRODUCERS) {
    for (let level = 1; level <= maxLevel(id); level++) {
      const cost = buildingCost(id, level);
      // Payback in turns: total resource cost ÷ extra output per turn.
      const paybackByRace = byRace((mods) => {
        const gain = marginalOutput(id, level, mods, workers);
        const totalGoods = cost.wood + cost.stone + cost.ore;
        return gain > 0 ? totalGoods / gain : Infinity;
      });
      const neutralGain = marginalOutput(id, level, NEUTRAL, workers);
      const neutralPayback = neutralGain > 0 ? (cost.wood + cost.stone + cost.ore) / neutralGain : Infinity;
      const sp = spread(neutralPayback, paybackByRace);

      rows.push([
        name(id),
        level,
        num(cost.wood + cost.stone + cost.ore),
        num(neutralGain, 1),
        turnsToHuman(neutralPayback),
        turnsToHuman(sp.min),
        `${sp.maxRace} ${turnsToHuman(sp.max)}`,
        { value: sp.ratio.toFixed(2) + "×", flag: sp.ratio > 2 ? "warn" : undefined },
      ]);
    }
  }

  // Findings are observations, never verdicts.
  //
  // The first one is the headline, and it falls straight out of the two curves
  // disagreeing about their shape: cost is geometric and output is linear, so
  // every level costs 1.5× the last while adding exactly the same output.
  const first = buildingCost("grange", 1);
  const last = buildingCost("grange", maxLevel("grange"));
  const gain1 = marginalOutput("grange", 1, NEUTRAL, workers);
  const gainN = marginalOutput("grange", maxLevel("grange"), NEUTRAL, workers);
  const pay1 = (first.wood + first.stone + first.ore) / gain1;
  const payN = (last.wood + last.stone + last.ore) / gainN;
  findings.push(
    `Cost is geometric (BUILDING_COST_CURVE ${"1.5 ^ (x−1)"}) while output is linear (WORKER_OUTPUT_CURVE ${workerOutputAtLevel(1)} × level). ` +
      `Marginal output is therefore FLAT — every level adds the same ${num(gain1)} /turn at ${workers} workers — while each costs 1.5× the last.`,
  );
  findings.push(
    `Payback therefore degrades ${(payN / pay1).toFixed(0)}× across the ladder: L1 repays in ${turnsToHuman(pay1)}, L${maxLevel("grange")} in ${turnsToHuman(payN)}. ` +
      `Whether that is the intended shape is a design call, not a harness one.`,
  );

  const paybacks = rows.map((r) => r[4] as string);
  const instant = paybacks.filter((p) => p.endsWith("t") && parseInt(p) < 40).length;
  if (instant > 0) {
    findings.push(
      `${instant} of ${rows.length} producer levels repay in under 40 turns (~7 hours) at ${workers} workers — at that speed the build is not a decision.`,
    );
  }
  const never = rows.filter((r) => (r[4] as string) === "never").length;
  if (never > 0) findings.push(`${never} levels never repay at this workforce.`);

  return {
    heading: `Producers — payback at ${workers} workers per building`,
    question: "How long until a level repays what it cost, and how far does race move that?",
    table: {
      columns: ["Building", "Lvl", "Goods cost", "+output/turn", "Payback (neutral)", "Fastest race", "Slowest race", "Spread"],
      rows,
      note: `Payback = total goods cost ÷ extra output per turn. Neutral = all race modifiers 1.0, NOT Human (who is 1.25 across the board). ${TURNS_PER_DAY} turns = 1 day.`,
    },
    findings,
  };
}

/** Which resource actually gates each building, per race. */
function bottleneckSection(workers: number): Section {
  const rows: Row[] = [];
  for (const { id } of PRODUCERS) {
    const level = 5; // mid-curve: the shape is the same, the numbers are legible
    const cost = buildingCost(id, level);
    const cells = ALL_RACES.map((race) => {
      const { bottleneck } = timeToAfford(cost, modifiersFor(race), workers, level - 1);
      return bottleneck;
    });
    rows.push([name(id), ...cells]);
  }
  const distinct = new Set(rows.flatMap((r) => r.slice(1).map(String)));
  return {
    heading: "What gates the build (level 5)",
    question: "Which resource does each race actually wait on?",
    table: { columns: ["Building", ...ALL_RACES], rows },
    findings:
      distinct.size <= 1
        ? ["Every race waits on the same resource — race is not shaping build order here."]
        : [`${distinct.size} different bottleneck resources across the races — build order should differ by race.`],
  };
}

/** Housing and storage have no output, so they are priced per unit of what they
 *  DO give: beds and shelter. */
function flatSection(): Section {
  const rows: Row[] = [];
  for (const id of CIVILIAN_LEVELLED_IDS) {
    if (PRODUCERS.some((p) => p.id === id)) continue;
    for (const level of [1, 5, 10]) {
      if (level > maxLevel(id)) continue;
      const c = buildingCost(id, level);
      rows.push([name(id), level, num(c.gold), num(c.wood + c.stone + c.ore)]);
    }
  }
  return {
    heading: "Non-producers — what a level costs",
    question: "Storage and the rest have no output; this is the price ladder only.",
    table: { columns: ["Building", "Lvl", "Gold", "Goods"], rows },
  };
}

/** Does the cost curve ever get CHEAPER per point of output as it climbs? */
function monotonicSection(workers: number): Section {
  const rows: Row[] = [];
  const findings: string[] = [];
  for (const { id } of PRODUCERS) {
    let previous = Infinity;
    for (let level = 1; level <= maxLevel(id); level++) {
      const cost = buildingCost(id, level);
      const gain = marginalOutput(id, level, NEUTRAL, workers);
      const perPoint = gain > 0 ? (cost.wood + cost.stone + cost.ore) / gain : Infinity;
      const cheaper = perPoint < previous;
      if (cheaper && level > 1) {
        findings.push(
          `${name(id)} L${level} costs LESS per point of output than L${level - 1} — the level below it is strictly dominated.`,
        );
        rows.push([name(id), level, num(perPoint, 1), "cheaper than the level below"]);
      }
      previous = perPoint;
    }
  }
  if (rows.length === 0) findings.push("No level is cheaper per point of output than the one below it.");
  return {
    heading: "Dominated levels",
    question: "Is any level strictly better value than the one beneath it?",
    table: rows.length ? { columns: ["Building", "Lvl", "Goods / output point", "Note"], rows } : undefined,
    findings,
  };
}

export const buildingsHarness: Harness = {
  id: "buildings",
  title: "Harness A — Buildings & growth",
  question: "Is anything too cheap, or too dear — and does that answer change by race?",
  about:
    "Sweeps every producer level 1→10 across all six races plus a neutral reference. Deterministic: no rolls, no opponent, exact answers.",
  run(): Report {
    const workers = 50;
    const sections = [
      producerSection(workers),
      bottleneckSection(workers),
      monotonicSection(workers),
      flatSection(),
    ];

    // Headline figures for the baseline diff. Deliberately few.
    const metrics: Record<string, number> = {};
    for (const { id } of PRODUCERS) {
      for (const level of [1, 5, 10]) {
        const cost = buildingCost(id, level);
        const gain = marginalOutput(id, level, NEUTRAL, workers);
        metrics[`payback.${id}.L${level}`] = gain > 0 ? Math.round((cost.wood + cost.stone + cost.ore) / gain) : -1;
      }
    }
    return { id: "buildings", title: this.title, question: this.question, sections, metrics };
  },
};

export type { Race };
