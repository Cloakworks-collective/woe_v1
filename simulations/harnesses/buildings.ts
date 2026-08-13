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

import {
  BLACK_MARKET,
  CIVILIAN_LEVELLED_IDS,
  DEFAULT_TAX_RATE,
  GOLD_PER_CIVILIAN_AT_FULL_TAX,
  TURNS_PER_DAY,
  maxLevel,
  workerOutputAtLevel,
} from "@/lib/constants";
import { BUILDING_INFO } from "@/lib/constants";
import type { BuildingId } from "@/lib/constants/buildings";
import { buildingCost, type Cost } from "@/lib/engine";
import { ALL_RACES, NEUTRAL, byRace, modifiersFor, spread } from "../core/races";
import { num, turnsToHuman } from "../core/report";
import type { Cell, Harness, Report, Row, Section } from "../core/types";
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

      // Workforce-free version of the same question: payback scales inversely
      // with headcount, so "how many diggers make this repay in a day" is the
      // figure that survives an empire growing.
      const perWorker = marginalOutput(id, level, NEUTRAL, 1);
      const workersForADay = perWorker > 0 ? (cost.wood + cost.stone + cost.ore) / (perWorker * TURNS_PER_DAY) : Infinity;

      rows.push([
        name(id),
        level,
        num(cost.wood + cost.stone + cost.ore),
        num(neutralGain, 1),
        turnsToHuman(neutralPayback),
        Number.isFinite(workersForADay) ? Math.ceil(workersForADay) : "—",
        turnsToHuman(sp.min),
        `${sp.maxRace} ${turnsToHuman(sp.max)}`,
        // NOT flagged. Race spread here is wide by design — dwarves are meant to
        // be poor at wood and elves poor at ore — so a threshold on this column
        // only ever cries wolf. Universal advantage is the thing worth flagging,
        // and it has its own section below.
        sp.ratio.toFixed(2) + "×",
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
      columns: ["Building", "Lvl", "Goods cost", "+output/turn", "Payback (neutral)", "Diggers for 1d", "Fastest race", "Slowest race", "Spread"],
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

// ── Dig or buy ──────────────────────────────────────────────────────────────
//
// The question that decides whether any of the above matters.
//
// Since the 2026-08 swing a civilian mints GOLD_PER_CIVILIAN_AT_FULL_TAX × tax
// every turn, and the Black Market sells any resource at BLACK_MARKET.BUY_PRICE
// with no building, no cap, no cooldown and no counterparty. So every peasant
// is already worth a fixed number of goods per turn before a single Grange
// exists — and a producer building is only worth its price above that floor.
//
// Note the tax dial pulls BOTH ways at once: it multiplies the gold and it
// divides the digging, because productionPerWorker scales by (1 − taxRate).
// That is why the break-even is a curve and not a number.

/** Goods per civilian per turn, bought from the fence out of their own tax. */
const fenceGoodsPerCivilian = (tax: number) =>
  (GOLD_PER_CIVILIAN_AT_FULL_TAX * tax) / BLACK_MARKET.BUY_PRICE;

/** Goods per worker per turn dug at a producer of this level, after tax. */
const dugGoodsPerWorker = (level: number, tax: number) =>
  workerOutputAtLevel(level) * (1 - tax);

function fenceSection(): Section {
  const rows: Row[] = [];
  const findings: string[] = [];
  const taxes = [0.25, DEFAULT_TAX_RATE, 0.75];

  for (const tax of taxes) {
    const fence = fenceGoodsPerCivilian(tax);
    // The level at which one worker's digging first beats one civilian's
    // purchasing power. Read off the real curves, not solved algebraically —
    // change WORKER_OUTPUT_CURVE to something non-linear and this still works.
    let breakEven: number | null = null;
    for (let l = 1; l <= 10; l++) {
      if (dugGoodsPerWorker(l, tax) > fence) {
        breakEven = l;
        break;
      }
    }
    rows.push([
      `${Math.round(tax * 100)}%`,
      num(GOLD_PER_CIVILIAN_AT_FULL_TAX * tax),
      num(fence, 1),
      num(dugGoodsPerWorker(1, tax), 1),
      num(dugGoodsPerWorker(5, tax), 1),
      num(dugGoodsPerWorker(10, tax), 1),
      {
        value: breakEven ? `L${breakEven}` : "never",
        flag: breakEven === null || breakEven > 6 ? "warn" : undefined,
      },
    ]);
  }

  const mid = fenceGoodsPerCivilian(DEFAULT_TAX_RATE);
  const levelMatching = (tax: number) =>
    [...Array(10).keys()].map((i) => i + 1).find((l) => dugGoodsPerWorker(l, tax) >= fenceGoodsPerCivilian(tax));
  const midLevel = levelMatching(DEFAULT_TAX_RATE);
  findings.push(
    `At the default ${Math.round(DEFAULT_TAX_RATE * 100)}% tax every civilian is worth ${num(mid, 1)} goods/turn through the fence with no building at all — ${
      midLevel ? `the same as a producer at level ${midLevel}, for free` : "more than a producer at any level"
    }.`,
  );
  // Computed, never asserted: this line was once hardcoded to "at 75% tax no
  // level out-earns the fence", which stopped being true the moment a constant
  // moved and left the prose contradicting the table beside it.
  const high = levelMatching(0.75);
  findings.push(
    `Tax moves both sides at once: it multiplies the gold and divides the digging. At 75% tax ${
      high
        ? `a producer only catches up at level ${high}`
        : "no producer level in the game out-earns simply taxing that peasant and buying — the whole ladder is dominated by the fence"
    }.`,
  );
  findings.push(
    `The fence is also unconditional: blackMarketBuy needs no Market Square, has no cap and no delivery time, and its supply is unlimited (it is a system counterparty, not a caravan). Whatever this table says about levels, that is the real competition.`,
  );

  return {
    heading: "Dig or buy — what a peasant is worth without any building",
    question: `The Black Market sells anything at ${BLACK_MARKET.BUY_PRICE} gold/unit. When does digging beat that?`,
    table: {
      columns: ["Tax", "Gold/civ/turn", "Fence goods/civ", "Dug L1", "Dug L5", "Dug L10", "Digging wins at"],
      rows,
      note: "Per head, per turn. A civilian pays tax whether or not you assign them, so this is not an either/or for the player — it is the floor a producer level has to clear to be worth its price.",
    },
    findings,
  };
}

/**
 * The tuning slider, laid out level by level.
 *
 * One peasant, one turn, at the default tax. What they dig at each producer
 * level, against what their own taxes would buy at the fence — for the current
 * GOLD_PER_CIVILIAN_AT_FULL_TAX and for the candidates under consideration.
 *
 * This is the table the coin-rich swing is actually decided from: it shows
 * where digging overtakes buying for each setting, so the choice is a reading
 * rather than an argument. The current value is always included, whatever it is.
 */
const GOLD_CANDIDATES = [400, 200, 100, 50, 40];

function sliderSection(): Section {
  const tax = DEFAULT_TAX_RATE;
  const candidates = [...new Set([GOLD_PER_CIVILIAN_AT_FULL_TAX, ...GOLD_CANDIDATES])].sort((a, b) => b - a);
  const buys = (gold: number) => (gold * tax) / BLACK_MARKET.BUY_PRICE;

  // What a peasant is worth as a taxpayer under each candidate.
  const purse: Row[] = candidates.map((g) => [
    { value: g === GOLD_PER_CIVILIAN_AT_FULL_TAX ? `${num(g)}  ← current` : num(g) },
    num(g * tax),
    num(buys(g), 2),
  ]);

  // Level by level: dug vs bought, as a ratio. Below 1.0 the fence wins.
  const rows: Row[] = [];
  for (let level = 1; level <= 10; level++) {
    const dug = dugGoodsPerWorker(level, tax);
    rows.push([
      level,
      num(dug, 1),
      ...candidates.map((g) => {
        const ratio = dug / buys(g);
        return {
          value: `${ratio.toFixed(2)}×`,
          flag: ratio < 1 ? ("bad" as const) : ratio < 1.5 ? ("warn" as const) : ("good" as const),
        };
      }),
    ]);
  }

  const findings = candidates.map((g) => {
    const first = [...Array(10).keys()].map((i) => i + 1).find((l) => dugGoodsPerWorker(l, tax) > buys(g));
    return `At ${num(g)} gold/civ: a peasant earns ${num(g * tax)} gold/turn, which buys ${num(buys(g), 2)} goods. Digging overtakes that at ${first ? `level ${first}` : "no level in the game"}.`;
  });

  return {
    heading: `The gold slider — dig or buy, level by level, at ${Math.round(tax * 100)}% tax`,
    question: "One peasant, one turn. How many times better is digging than buying, at each setting?",
    body: [
      "Two tables. The first is what a peasant is worth as a TAXPAYER under each candidate value of",
      "GOLD_PER_CIVILIAN_AT_FULL_TAX. The second is how their DIGGING compares, level by level:",
      "1.00× means the producer exactly matches what their own taxes would have bought, so every",
      "level below that line is a building that earns less than nothing.",
    ].join(" "),
    table: {
      columns: ["Level", "Dug/peasant", ...candidates.map((g) => `vs ${num(g)}`)],
      rows,
      note: `✗ = the fence wins outright · ! = digging wins by less than half · ✓ = digging clearly ahead. Goods bought at ${BLACK_MARKET.BUY_PRICE} gold/unit.`,
    },
    findings: [
      "The taxpayer side of the same table:",
      ...purse.map((r) => `    ${String((r[0] as Cell).value).padEnd(18)} → ${r[1]} gold/turn → buys ${r[2]} goods/turn`),
      ...findings,
    ],
  };
}

/** What the whole producer tree costs, measured against the gold faucet. */
function ladderCostSection(): Section {
  let goods = 0;
  let gold = 0;
  for (const { id } of PRODUCERS) {
    for (let level = 1; level <= maxLevel(id); level++) {
      const c = buildingCost(id, level);
      goods += c.wood + c.stone + c.ore;
      gold += c.gold;
    }
  }
  const goldEquivalent = goods * BLACK_MARKET.BUY_PRICE + gold;

  const rows: Row[] = [100, 500, 1000, 5000].map((civ) => {
    const perTurn = civ * GOLD_PER_CIVILIAN_AT_FULL_TAX * DEFAULT_TAX_RATE;
    const turns = goldEquivalent / perTurn;
    return [
      num(civ),
      num(perTurn),
      turnsToHuman(turns),
      { value: turnsToHuman(turns / 4), flag: turns / 4 < TURNS_PER_DAY ? "warn" : undefined },
    ];
  });

  return {
    heading: "What the whole producer tree costs, in tax income",
    question: `All four producers, levels 1→10: ${num(goods)} goods and ${num(gold)} gold.`,
    table: {
      columns: ["Civilians", "Gold/turn", "To buy the whole tree", "To max one producer"],
      rows,
      note: `Goods valued at the fence's ${BLACK_MARKET.BUY_PRICE} gold/unit, which is what they actually cost to obtain when gold is the abundant resource. ${Math.round(DEFAULT_TAX_RATE * 100)}% tax.`,
    },
    findings: [
      `The complete tree is ${num(goldEquivalent)} gold-equivalent. Whether that is a real commitment depends entirely on the size of the empire buying it — which is the shape worth deciding on.`,
    ],
  };
}

/** Is any race simply ahead of the others at production, rather than traded off? */
function raceProductionSection(): Section {
  const RES = ["food", "wood", "stone", "ore"] as const;
  const rows: Row[] = [];
  const totals: { race: Race; mean: number; worst: number }[] = [];

  for (const race of ALL_RACES) {
    const mods = modifiersFor(race).production;
    const values = RES.map((r) => mods[r]);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const worst = Math.min(...values);
    totals.push({ race, mean, worst });
    rows.push([
      race,
      ...values.map((v) => v.toFixed(2)),
      { value: mean.toFixed(3), flag: undefined },
      { value: worst.toFixed(2), flag: worst >= 1 ? "warn" : undefined },
    ]);
  }

  const best = totals.reduce((a, b) => (b.mean > a.mean ? b : a));
  const noWeakness = totals.filter((t) => t.worst >= 1);
  const findings: string[] = [
    `${best.race} leads on total production at ${best.mean.toFixed(3)}; the rest sit between ${Math.min(...totals.filter((t) => t !== best).map((t) => t.mean)).toFixed(3)} and ${Math.max(...totals.filter((t) => t !== best).map((t) => t.mean)).toFixed(3)}.`,
  ];
  if (noWeakness.length) {
    findings.push(
      `${noWeakness.map((t) => t.race).join(", ")} ${noWeakness.length === 1 ? "has" : "have"} no production weakness at all — every resource at or above neutral. Lopsided races are the design; a race that is lopsided in only one direction is a different thing, and this is the column that shows it.`,
    );
  }

  return {
    heading: "Race at production — lopsided, or simply ahead?",
    question: "Trading strength for weakness is intended. Being ahead on all four is not the same thing.",
    table: {
      columns: ["Race", ...RES, "Mean", "Weakest"],
      rows,
      note: "A flagged 'Weakest' means that race gives up nothing anywhere. Per-building spread is in the producer table above and is expected to be wide — that is what a lopsided race looks like.",
    },
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
      // The fence first: it decides whether the rest of the tables matter.
      sliderSection(),
      fenceSection(),
      ladderCostSection(),
      producerSection(workers),
      raceProductionSection(),
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

    // The dig-or-buy line, as one number: the producer level at which a worker
    // first out-earns their own tax spent at the fence. Above 10 means never.
    const fence = fenceGoodsPerCivilian(DEFAULT_TAX_RATE);
    metrics["fence.breakEvenLevel"] =
      [...Array(10).keys()].map((i) => i + 1).find((l) => dugGoodsPerWorker(l, DEFAULT_TAX_RATE) > fence) ?? -1;
    metrics["fence.goodsPerCivilianPerTurn"] = Math.round(fence * 10) / 10;
    return { id: "buildings", title: this.title, question: this.question, sections, metrics };
  },
};

export type { Race };
