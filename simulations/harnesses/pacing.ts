// HARNESS D — Progression pacing.
//
// The only harness here that PLAYS. Everything else measures a formula or a
// single battle; this one runs a greedy builder across sixty days and asks how
// fast an empire actually grows.
//
// Migrated from scripts/sim.ts, which is where the policy below was written.
// It is deliberately not clever — a legible hand-tuned build order beats an
// optimiser, because when a result surprises you, you need to be able to read
// the policy and say "ah, of course". That legibility is also the caveat: this
// measures ONE way of playing, and a different policy would give a different
// curve. It is the seed of the fuller economy simulator described in
// spec/tuning_todo.md, not a replacement for it.

import { ARMY_FLOORS, CIVILIAN_LEVELLED_IDS, TURNS_PER_DAY } from "@/lib/constants";
import type { BuildingId } from "@/lib/constants/buildings";
import {
  assignWorkers,
  build,
  civilians,
  level,
  military,
  newEmpire,
  processDailyReset,
  processTurnTick,
  rankingScore,
  settlementTitle,
  totalPopulation,
  trainTroops,
  vacantHousing,
  type Player,
} from "@/lib/engine";
import type { Race } from "@/lib/constants/races";
import { ALL_RACES } from "../core/races";
import { num } from "../core/report";
import type { Harness, Report, Row, Section } from "../core/types";

/** Commands throw when unaffordable; a policy that cannot pay simply waits. */
const attempt = (fn: () => { player: Player }, p: Player): Player => {
  try {
    return fn().player;
  } catch {
    return p;
  }
};

const ROTATION: BuildingId[] = [
  "grange", "sawyers_mill", "masons_quarry", "deepvein_mine", "collegium",
  "granary", "timberyard", "masons_yard", "ironhold", "counting_house",
  "market_square", "shadow_guild", "rangers_lodge",
];

export interface DaySnapshot {
  day: number;
  population: number;
  regulars: number;
  civilianLevels: number;
  score: number;
  gold: number;
  title: string;
}

/** One empire, sixty days, one build order. */
function play(race: Race, days: number): DaySnapshot[] {
  let p = newEmpire({ id: "sim", name: "Simton", race });
  const out: DaySnapshot[] = [];

  for (let day = 1; day <= days; day++) {
    // First rule of empire: feed it. Grange first, farmers filled, always.
    if ((p.buildings.grange ?? 0) === 0) p = attempt(() => build(p, "grange"), p);
    for (let i = 0; i < 20; i++) {
      const before = p;
      p = attempt(() => assignWorkers(p, "farmers", 1), p);
      if (p === before) break;
      if (p.workers.farmers * 10 > 2 * 0.1 * totalPopulation(p) * 1.5) break; // 2× upkeep margin
    }
    if (p.workers.farmers * 10 < 0.1 * totalPopulation(p) * 1.3) {
      p = attempt(() => build(p, "grange"), p); // more slots when the margin thins
    }

    // Second rule: the wood chain — everything is built from lumber.
    if ((p.buildings.sawyers_mill ?? 0) === 0) p = attempt(() => build(p, "sawyers_mill"), p);
    for (let i = 0; i < 6; i++) {
      const before = p;
      p = attempt(() => assignWorkers(p, "lumberjacks", 1), p);
      if (p === before) break;
    }

    for (let t = 0; t < TURNS_PER_DAY; t++) {
      p = processTurnTick(p, { currentTick: day * TURNS_PER_DAY + t }).player;
    }

    // A garrison at 35% of civilians — the level that stops peasants scattering
    // and starts attracting settlers.
    if (level(p, "drill_yard") < 1) p = attempt(() => build(p, "drill_yard"), p);
    if (level(p, "forge") < 1) p = attempt(() => build(p, "forge"), p);
    while (military(p) < 0.35 * civilians(p)) {
      const before = p;
      p = attempt(() => trainTroops(p, "footman", "light", 1), p);
      if (p === before) {
        p = attempt(() => build(p, "muster_hall"), p);
        if (p === before) break; // cannot afford either — wait for income
      }
    }

    // Housing ahead of growth, then round-robin the rest.
    if (vacantHousing(p) < 6) p = attempt(() => build(p, "hearthstead"), p);
    p = attempt(() => build(p, ROTATION[day % ROTATION.length]!), p);

    for (const role of ["farmers", "lumberjacks", "quarrymen", "miners", "researchers"] as const) {
      p = attempt(() => assignWorkers(p, role, 1), p);
    }

    p = processDailyReset(p, day * TURNS_PER_DAY).player;

    out.push({
      day,
      population: totalPopulation(p),
      regulars: military(p),
      civilianLevels: CIVILIAN_LEVELLED_IDS.reduce((s, id) => s + (p.buildings[id] ?? 0), 0),
      score: rankingScore(p),
      gold: Math.round(p.gold + p.bankedGold),
      title: settlementTitle(p),
    });
  }
  return out;
}

function curveSection(timeline: DaySnapshot[]): Section {
  const rows: Row[] = timeline
    .filter((d) => d.day === 1 || d.day % 10 === 0)
    .map((d) => [d.day, num(d.population), num(d.regulars), d.civilianLevels, num(d.score), num(d.gold), d.title]);

  const floorDay = timeline.find((d) => d.regulars >= ARMY_FLOORS.INDIVIDUAL)?.day;
  const findings = [
    floorDay
      ? `The solo victory floor (${num(ARMY_FLOORS.INDIVIDUAL)} regulars) is reached on day ${floorDay}.`
      : `The solo victory floor (${num(ARMY_FLOORS.INDIVIDUAL)} regulars) is NOT reached in ${timeline.length} days under this policy — the hold clocks would never start.`,
  ];
  const last = timeline.at(-1)!;
  findings.push(
    `After ${last.day} days: ${num(last.population)} souls, ${num(last.regulars)} regulars, ${last.civilianLevels} civilian building levels, score ${num(last.score)}.`,
  );

  return {
    heading: "Sixty days of a greedy builder",
    question: "How fast does an empire actually grow when it never fights?",
    table: {
      columns: ["Day", "Population", "Regulars", "Civ levels", "Score", "Gold", "Title"],
      rows,
      note: "One policy, one race. A different build order gives a different curve — this is a reference line, not the ceiling.",
    },
    findings,
  };
}

/** The same policy under every banner — where race actually lands over time. */
function raceSection(days: number): Section {
  const rows: Row[] = [];
  for (const race of ALL_RACES) {
    const t = play(race, days);
    const last = t.at(-1)!;
    const floorDay = t.find((d) => d.regulars >= ARMY_FLOORS.INDIVIDUAL)?.day;
    rows.push([race, num(last.population), num(last.regulars), num(last.score), floorDay ?? "not reached"]);
  }
  const scores = rows.map((r) => Number(String(r[3]).replace(/,/g, "")));
  const spreadPct = ((Math.max(...scores) - Math.min(...scores)) / Math.min(...scores)) * 100;
  return {
    heading: `Every race, same build order, ${days} days`,
    question: "Does the identical policy land differently depending on the blood running it?",
    table: { columns: ["Race", "Population", "Regulars", "Score", "Floor reached"], rows },
    findings: [
      `${spreadPct.toFixed(1)}% spread in final score across the six races under an identical build order.`,
      "The policy is tuned for nobody in particular, so this is not a fairness verdict — a race whose strengths this build order never uses will look worse than it plays.",
    ],
  };
}

export const pacingHarness: Harness = {
  id: "pacing",
  title: "Harness D — Progression pacing",
  question: "How fast does an empire grow, and is the victory floor reachable?",
  about: "Plays a greedy builder across 60 days, per race. The only harness here that actually plays the game.",
  run(): Report {
    const DAYS = 60;
    const human = play("human", DAYS);
    const sections = [curveSection(human), raceSection(DAYS)];
    const last = human.at(-1)!;
    const floorDay = human.find((d) => d.regulars >= ARMY_FLOORS.INDIVIDUAL)?.day;
    return {
      id: "pacing",
      title: this.title,
      question: this.question,
      sections,
      metrics: {
        "pacing.day60.population": last.population,
        "pacing.day60.regulars": last.regulars,
        "pacing.day60.score": last.score,
        "pacing.day60.civLevels": last.civilianLevels,
        "pacing.dayFloorReached": floorDay ?? -1,
      },
    };
  },
};
