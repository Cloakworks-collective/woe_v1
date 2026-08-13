// HARNESS D — Progression pacing.
//
// The only harness here that PLAYS. Everything else measures a formula or a
// single battle; this one runs a builder across a season and asks how fast an
// empire actually grows — and, once the ladders are priced, how many days it
// takes to finish them.
//
// It is deliberately not clever. A legible hand-tuned build order beats an
// optimiser, because when a result surprises you, you need to be able to read
// the policy and say "ah, of course". That legibility is also the caveat: this
// measures ONE way of playing, and a different policy gives a different curve.
//
// ── The 2026-08 correction ──────────────────────────────────────────────────
// The first version of this policy never traded, and it stranded itself: it
// spent its starting wood on a Grange, could not then afford the Sawyer's Mill,
// and sat at 170 souls with zero wood income for the remaining fifty-nine days
// while gold piled to nine figures. That was not a slow empire, it was a dead
// one, and every number this harness printed was meaningless.
//
// A policy that cannot use the Black Market cannot play the coin-rich economy,
// so `topUp` below is not a convenience — it is the difference between a
// simulation and a stuck loop. The guard against the opposite failure (an
// empire that frittters its whole treasury toward a Citadel it cannot reach) is
// that it only ever buys a shortfall it can close COMPLETELY.

import {
  ARMY_FLOORS,
  BLACK_MARKET,
  CIVILIAN_LEVELLED_IDS,
  POP_GROWTH,
  RACES,
  TROOPS_PER_MUSTER_HALL,
  TURNS_PER_DAY,
  maxLevel,
} from "@/lib/constants";
import type { BuildingId } from "@/lib/constants/buildings";
import {
  assignWorkers,
  blackMarketBuy,
  build,
  buildingCost,
  civilians,
  foodUpkeepPerTurn,
  level,
  military,
  musterVacancy,
  newEmpire,
  processDailyReset,
  processTurnTick,
  productionPerWorker,
  rankingScore,
  settlementTitle,
  totalPopulation,
  trainTroops,
  vacantHousing,
  type Cost,
  type Player,
} from "@/lib/engine";
import type { Race } from "@/lib/constants/races";
import { ALL_RACES } from "../core/races";
import { num, turnsToHuman } from "../core/report";
import type { Harness, Report, Row, RunContext, Section } from "../core/types";

/** Commands throw when unaffordable; a policy that cannot pay simply waits. */
const attempt = (fn: () => { player: Player }, p: Player): Player => {
  try {
    return fn().player;
  } catch {
    return p;
  }
};

/** Everything a ruler is trying to finish, in the order they pursue it.
 *  Producers first because they compound; walls last because they are the
 *  most expensive thing in the game and buy no economy. */
const TARGETS: BuildingId[] = [
  "grange",
  "sawyers_mill",
  "masons_quarry",
  "deepvein_mine",
  "granary",
  "timberyard",
  "masons_yard",
  "ironhold",
  "counting_house",
  "market_square",
  "collegium",
  "shadow_guild",
  "rangers_lodge",
  "walls",
];

const RESOURCES = ["wood", "stone", "ore"] as const;

/**
 * Close a materials shortfall at the Black Market, or do nothing at all.
 *
 * All-or-nothing on purpose. Buying "some of the way there" would let the
 * policy pour a whole treasury into a Citadel it is still weeks from affording,
 * starving every cheap build behind it — which looks like a pacing result and
 * is really just a bad shopper.
 */
function topUp(p: Player, cost: Cost, keepGold: number): Player {
  let short = 0;
  for (const r of RESOURCES) short += Math.max(0, cost[r] - p.resources[r]);
  if (short === 0) return p;

  const bill = short * BLACK_MARKET.BUY_PRICE + cost.gold + keepGold;
  if (p.gold < bill) return p; // cannot close it — leave the coin alone

  let q = p;
  for (const r of RESOURCES) {
    const need = Math.ceil(cost[r] - q.resources[r]);
    if (need > 0) q = attempt(() => blackMarketBuy(q, r, need), q);
  }
  return q;
}

/** One level of one building, buying the materials if that is what it takes. */
function raise(p: Player, id: BuildingId, keepGold: number): Player {
  const target = level(p, id) + 1;
  if (target > maxLevel(id)) return p;
  const withGoods = topUp(p, buildingCost(id, target), keepGold);
  return attempt(() => build(withGoods, id), withGoods);
}

export interface DaySnapshot {
  day: number;
  population: number;
  regulars: number;
  civilianLevels: number;
  walls: number;
  score: number;
  gold: number;
  title: string;
}

export interface Season {
  timeline: DaySnapshot[];
  /** Day each target reached its cap — absent if it never did. */
  maxedOn: Partial<Record<BuildingId, number>>;
  dayAllMaxed?: number;
}

/** One empire, one build order, as many days as you give it. */
function play(race: Race, days: number): Season {
  let p = newEmpire({ id: "sim", name: "Simton", race });
  const timeline: DaySnapshot[] = [];
  const maxedOn: Partial<Record<BuildingId, number>> = {};
  let dayAllMaxed: number | undefined;

  for (let day = 1; day <= days; day++) {
    // A float kept back so the empire is never coin-dry: mercenary upkeep and
    // troop training both draw on gold, and an empire that spent its last
    // piece on stone cannot muster.
    const keepGold = 2000 + civilians(p) * 20;

    // 1 · THE FOUR PRODUCERS, before anything else. A level-1 building is what
    //     makes a worker role assignable at all, and an empire with no Sawyer's
    //     Mill has no wood income for the rest of the age no matter how much
    //     gold it piles up. This is the step whose absence stranded the old
    //     policy — it is first for that reason.
    for (const id of ["grange", "sawyers_mill", "masons_quarry", "deepvein_mine"] as const) {
      if (level(p, id) === 0) p = raise(p, id, 0);
    }

    // 2 · FOOD. Nothing else matters if the people starve — production and tax
    //     both stop dead. Farmers are sized off the engine's own upkeep and
    //     per-worker figures rather than a guessed ratio, with a margin for the
    //     mouths that will arrive at dawn.
    const perFarmer = productionPerWorker(p, "grange") * RACES[p.race].production.food;
    if (perFarmer > 0) {
      const want = Math.ceil((foodUpkeepPerTurn(p) * 1.6) / perFarmer);
      const gap = want - p.workers.farmers;
      if (gap > 0) p = attempt(() => assignWorkers(p, "farmers", Math.min(gap, p.idlePeasants)), p);
    }

    // 3 · PUT EVERY IDLE HAND TO WORK, before building rather than after —
    //     a peasant assigned this morning digs all day. Assigning is free and
    //     reversible, so an idle peasant is pure waste.
    const spare = p.idlePeasants - Math.ceil(0.35 * civilians(p)) + military(p);
    if (spare > 0) {
      const each = Math.floor(spare / 4);
      for (const role of ["lumberjacks", "quarrymen", "miners"] as const) {
        if (each > 0) p = attempt(() => assignWorkers(p, role, each), p);
      }
    }

    // 4 · HOUSING, ahead of the growth it enables. Arrivals that find no bed
    //     are turned away, not queued, so a full town silently stops growing.
    //     Two days of maximum intake is the cushion.
    for (let i = 0; i < 60 && vacantHousing(p) < 2 * POP_GROWTH.MAX; i++) {
      const before = p;
      p = raise(p, "hearthstead", keepGold);
      if (p === before) break;
    }

    // 5 · GARRISON at 35% of civilians — above the scattering floor (20%) and
    //     into the top settler-safety tier (30%).
    //
    //     Sized from musterVacancy and trained in ONE call. The earlier version
    //     trained one at a time and treated ANY failure as "need more barracks",
    //     so a missing Drill Yard on day one had it build twenty-three Muster
    //     Halls in an afternoon and spend the treasury on beds for troops it
    //     could not train. Ask the engine what fits; do not learn it by error.
    if (level(p, "drill_yard") < 1) p = raise(p, "drill_yard", keepGold);
    if (level(p, "forge") < 1) p = raise(p, "forge", keepGold);
    if (level(p, "drill_yard") >= 1 && level(p, "forge") >= 1) {
      const wanted = Math.ceil(0.35 * civilians(p)) - military(p);
      if (wanted > 0) {
        const shortBeds = wanted - musterVacancy(p);
        for (let i = 0; i < Math.ceil(shortBeds / TROOPS_PER_MUSTER_HALL) && i < 30; i++) {
          const before = p;
          p = raise(p, "muster_hall", keepGold);
          if (p === before) break; // cannot afford beds — the muster waits
        }
        const n = Math.min(wanted, musterVacancy(p), p.idlePeasants);
        if (n > 0) p = attempt(() => trainTroops(p, "footman", "light", n), p);
      }
    }

    // 6 · BUILD. Walk the priority list; anything unaffordable is skipped
    //     rather than blocking, so a Citadel being out of reach never stalls a
    //     Granary behind it.
    for (let pass = 0; pass < 3; pass++) {
      for (const id of TARGETS) {
        if (level(p, id) >= maxLevel(id)) continue;
        p = raise(p, id, keepGold);
      }
    }

    // 7 · Anything still idle goes to the Collegium — research is the only
    //     sink left once the fields are staffed.
    if (p.idlePeasants > 0 && level(p, "collegium") > 0) {
      const rest = p.idlePeasants;
      p = attempt(() => assignWorkers(p, "researchers", rest), p);
    }

    for (let t = 0; t < TURNS_PER_DAY; t++) {
      p = processTurnTick(p, { currentTick: day * TURNS_PER_DAY + t }).player;
    }
    p = processDailyReset(p, day * TURNS_PER_DAY).player;

    for (const id of TARGETS) {
      if (maxedOn[id] === undefined && level(p, id) >= maxLevel(id)) maxedOn[id] = day;
    }
    if (dayAllMaxed === undefined && TARGETS.every((id) => maxedOn[id] !== undefined)) {
      dayAllMaxed = day;
    }

    timeline.push({
      day,
      population: totalPopulation(p),
      regulars: military(p),
      civilianLevels: CIVILIAN_LEVELLED_IDS.reduce((s, id) => s + (p.buildings[id] ?? 0), 0),
      walls: level(p, "walls"),
      score: rankingScore(p),
      gold: Math.round(p.gold + p.bankedGold),
      title: settlementTitle(p),
    });
  }

  return { timeline, maxedOn, dayAllMaxed };
}

function curveSection(season: Season, days: number): Section {
  const { timeline } = season;
  const step = Math.max(1, Math.round(days / 12));
  const rows: Row[] = timeline
    .filter((d) => d.day === 1 || d.day % step === 0 || d.day === days)
    .map((d) => [
      d.day,
      num(d.population),
      num(d.regulars),
      d.civilianLevels,
      d.walls,
      num(d.score),
      num(d.gold),
      d.title,
    ]);

  const floorDay = timeline.find((d) => d.regulars >= ARMY_FLOORS.INDIVIDUAL)?.day;
  const last = timeline.at(-1)!;
  const findings = [
    floorDay
      ? `The solo victory floor (${num(ARMY_FLOORS.INDIVIDUAL)} regulars) is reached on day ${floorDay}.`
      : `The solo victory floor (${num(ARMY_FLOORS.INDIVIDUAL)} regulars) is NOT reached in ${days} days under this policy — the hold clocks would never start.`,
    `After ${last.day} days: ${num(last.population)} souls, ${num(last.regulars)} regulars, ${last.civilianLevels} civilian building levels, walls L${last.walls}, score ${num(last.score)}.`,
  ];

  return {
    heading: `${days} days of a builder who trades`,
    question: "How fast does an empire actually grow when it never fights?",
    table: {
      columns: ["Day", "Population", "Regulars", "Civ levels", "Walls", "Score", "Gold", "Title"],
      rows,
      note: "One policy, one race. A different build order gives a different curve — this is a reference line, not the ceiling.",
    },
    findings,
  };
}

/** The question the wall repricing is actually asked against: when is it done? */
function completionSection(season: Season, days: number): Section {
  const rows: Row[] = TARGETS.map((id) => {
    const day = season.maxedOn[id];
    return [
      id,
      maxLevel(id),
      day !== undefined
        ? { value: `day ${day}`, flag: "good" as const }
        : { value: `not in ${days}d`, flag: "warn" as const },
    ];
  });

  const findings: string[] = [];
  const finished = TARGETS.filter((id) => season.maxedOn[id] !== undefined).length;
  findings.push(
    season.dayAllMaxed
      ? `Everything is finished on day ${season.dayAllMaxed}.`
      : `${finished} of ${TARGETS.length} ladders are finished inside ${days} days; the rest are still climbing.`,
  );
  const walls = season.maxedOn.walls;
  findings.push(
    walls
      ? `The walls top out on day ${walls} — the last and dearest ladder in the game, so this is the figure the wall pricing is judged on.`
      : `The walls do NOT reach level ${maxLevel("walls")} inside ${days} days under this policy.`,
  );

  return {
    heading: "When each ladder is finished",
    question: "The pricing target is a season that ends with everything barely complete.",
    table: { columns: ["Building", "Cap", "Maxed on"], rows },
    findings,
  };
}

/** The same policy under every banner — where race actually lands over time. */
function raceSection(days: number): Section {
  const rows: Row[] = [];
  for (const race of ALL_RACES) {
    const season = play(race, days);
    const last = season.timeline.at(-1)!;
    const floorDay = season.timeline.find((d) => d.regulars >= ARMY_FLOORS.INDIVIDUAL)?.day;
    rows.push([
      race,
      num(last.population),
      num(last.regulars),
      last.walls,
      num(last.score),
      floorDay ?? "not reached",
      season.dayAllMaxed ?? "not finished",
    ]);
  }
  const scores = rows.map((r) => Number(String(r[4]).replace(/,/g, "")));
  const spreadPct = ((Math.max(...scores) - Math.min(...scores)) / Math.min(...scores)) * 100;
  return {
    heading: `Every race, same build order, ${days} days`,
    question: "Does the identical policy land differently depending on the blood running it?",
    table: {
      columns: ["Race", "Population", "Regulars", "Walls", "Score", "Floor reached", "All maxed"],
      rows,
    },
    findings: [
      `${spreadPct.toFixed(1)}% spread in final score across the six races under an identical build order.`,
      "The policy is tuned for nobody in particular, so this is not a fairness verdict — a race whose strengths this build order never uses will look worse than it plays.",
    ],
  };
}

export const pacingHarness: Harness = {
  id: "pacing",
  title: "Harness D — Progression pacing",
  question: "How fast does an empire grow, and how long does it take to finish the ladders?",
  about:
    "Plays a trading builder across a season, per race. The only harness here that actually plays the game — and the one the ladder pricing is judged against.",
  run(ctx: RunContext): Report {
    const DAYS = Number(process.env.SIM_DAYS ?? 60);
    void ctx;
    const human = play("human", DAYS);
    const sections = [curveSection(human, DAYS), completionSection(human, DAYS), raceSection(DAYS)];
    const last = human.timeline.at(-1)!;
    const floorDay = human.timeline.find((d) => d.regulars >= ARMY_FLOORS.INDIVIDUAL)?.day;
    void turnsToHuman;
    return {
      id: "pacing",
      title: this.title,
      question: this.question,
      sections,
      metrics: {
        "pacing.dayN.population": last.population,
        "pacing.dayN.regulars": last.regulars,
        "pacing.dayN.score": last.score,
        "pacing.dayN.civLevels": last.civilianLevels,
        "pacing.dayN.walls": last.walls,
        "pacing.dayFloorReached": floorDay ?? -1,
        "pacing.dayWallsMaxed": human.maxedOn.walls ?? -1,
        "pacing.dayAllMaxed": human.dayAllMaxed ?? -1,
      },
    };
  },
};
