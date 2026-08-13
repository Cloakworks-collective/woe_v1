// HARNESS C — Ranking.
//
// "What is the cheapest ranking point?" Whatever it is, that is what the ladder
// is REALLY asking players to build — and it may not be what anyone intended.
//
// `rankingScore` is a pure function with no rolls, so this sweeps rather than
// samples: build a player, change exactly one thing, re-score, and take the
// difference. That is the same trick the in-game Ranking Calculator uses, for
// the same reason — a measured component can never drift from the function it
// claims to explain.

import { COUNTER_TYPES, RACES, SCORE, TIER_COST_MULT, TRAINING_COSTS, wallsScoreAtLevel } from "@/lib/constants";
import type { Race } from "@/lib/constants/races";
import { EMPTY_ARMY, buildSandboxPlayer, rankingScore, type SandboxArmy } from "@/lib/engine";
import { buildingCost } from "@/lib/engine";
import { ALL_RACES } from "../core/races";
import { num } from "../core/report";
import type { Harness, Report, Row, Section } from "../core/types";

/** A mid-game empire to measure marginal changes against. Every component is
 *  present, so nothing is being measured from zero. */
const BASE: SandboxArmy = {
  ...EMPTY_ARMY,
  name: "ref",
  race: "human",
  peasants: 2000,
  footmen: [400, 200, 100],
  archers: [300, 150, 80],
  cavalry: [200, 100, 50],
  scouts: 60,
  spies: 60,
  engineers: 120,
  experience: 40,
  wallLevel: 5,
  // Built from COUNTER_TYPES so a new engine type cannot be silently missed.
  counters: Object.fromEntries(COUNTER_TYPES.map((t, i) => [t, 30 - i * 4])),
};

const scoreOf = (a: SandboxArmy) => rankingScore(buildSandboxPlayer(a, "sim"));

/**
 * Total gold+goods to field one troop of a given arm and tier.
 *
 * Base cost × the tier multiplier, exactly as the engine charges it — read from
 * TRAINING_COSTS and TIER_COST_MULT rather than restated, so a price change
 * moves this report without anybody remembering to update it.
 */
function troopCost(arm: "footmen" | "archers" | "cavalry", tier: 0 | 1 | 2): number {
  const key = (arm === "footmen" ? "footman" : arm === "archers" ? "archer" : "cavalry") as
    | "footman"
    | "archer"
    | "cavalry";
  const base = TRAINING_COSTS[key];
  const mult = TIER_COST_MULT[(["light", "medium", "heavy"] as const)[tier]];
  return (base.gold + base.wood + base.stone + base.ore) * mult;
}

/**
 * Marginal score per unit of spend, for every route to a point.
 *
 * This is the headline. If one route is dramatically cheaper than the rest,
 * that is the build the ladder rewards regardless of what the design intends —
 * and players will find it long before we do.
 */
function costPerPointSection(race: Race): Section {
  const base = { ...BASE, race };
  const before = scoreOf(base);
  const rows: Row[] = [];

  const add = (label: string, after: number, spend: number) => {
    const gained = after - before;
    rows.push([
      label,
      num(gained),
      num(spend),
      { value: gained > 0 ? num(spend / gained, 1) : "—", flag: undefined },
    ]);
  };

  // Troops: 100 of each arm/tier.
  const N = 100;
  for (const arm of ["footmen", "archers", "cavalry"] as const) {
    for (const tier of [0, 1, 2] as const) {
      const next = { ...base, [arm]: base[arm].map((v, i) => (i === tier ? v + N : v)) } as SandboxArmy;
      add(`${arm} ${(["light", "medium", "heavy"] as const)[tier]} ×${N}`, scoreOf(next), troopCost(arm, tier) * N);
    }
  }

  // Walls: one more level.
  const wallNext = { ...base, wallLevel: base.wallLevel + 1 };
  const wallC = buildingCost("walls", base.wallLevel + 1);
  add(`walls L${base.wallLevel}→${base.wallLevel + 1}`, scoreOf(wallNext), wallC.gold + wallC.wood + wallC.stone + wallC.ore);

  // People: 500 more peasants. They cost nothing to hold — they arrive.
  add("peasants ×500 (free)", scoreOf({ ...base, peasants: base.peasants + 500 }), 0);

  // Veterancy: 10 more points. Also unpurchasable — it is won in battle.
  add("veterancy +10 (won, not bought)", scoreOf({ ...base, experience: base.experience + 10 }), 0);

  // Only PURCHASABLE routes compete. Peasants arrive and veterancy is won, so
  // both score at zero cost — true, and useless as advice about what to buy.
  const cheapest = rows
    .map((r) => ({ label: String(r[0]), spend: Number(String(r[2]).replace(/,/g, "")), per: parseFloat(String((r[3] as { value: string }).value).replace(/,/g, "")) }))
    .filter((x) => x.spend > 0 && Number.isFinite(x.per))
    .sort((a, b) => a.per - b.per)[0];

  return {
    heading: `Cost per ranking point — ${race}`,
    question: "Which purchase buys the most score per coin-and-goods spent?",
    table: {
      columns: ["Purchase", "Score gained", "Spend", "Spend / point"],
      rows,
      note: "Measured by re-scoring with one component changed — the same method the in-game calculator uses, so it cannot drift from rankingScore.",
    },
    findings: cheapest
      ? [
          `Cheapest route you can BUY for ${race}: ${cheapest.label}, at ${num(cheapest.per, 1)} per point.`,
          "Peasants and veterancy score at zero cost because neither is purchased — they arrive, or they are won in battle. That makes population the cheapest score in the game by a distance, which is worth knowing when reading the ladder.",
        ]
      : [],
  };
}

/** Does the cheapest route differ by race? If not, race is not shaping the
 *  ladder at all. */
function raceRoutesSection(): Section {
  const rows: Row[] = [];
  for (const race of ALL_RACES) {
    const base = { ...BASE, race };
    const before = scoreOf(base);
    const routes: { label: string; per: number }[] = [];
    for (const arm of ["footmen", "archers", "cavalry"] as const) {
      for (const tier of [0, 1, 2] as const) {
        const next = { ...base, [arm]: base[arm].map((v, i) => (i === tier ? v + 100 : v)) } as SandboxArmy;
        const gained = scoreOf(next) - before;
        const spend = troopCost(arm, tier) * 100;
        if (gained > 0 && spend > 0) {
          const armName = arm === "footmen" ? "footman" : arm === "archers" ? "archer" : "cavalry";
          routes.push({ label: `${armName} ${(["L", "M", "H"] as const)[tier]}`, per: spend / gained });
        }
      }
    }
    routes.sort((a, b) => a.per - b.per);
    rows.push([race, num(before), routes[0]?.label ?? "—", num(routes[0]?.per ?? 0, 1), routes.at(-1)?.label ?? "—"]);
  }
  const best = new Set(rows.map((r) => String(r[2])));
  return {
    heading: "Cheapest troop route, by race",
    question: "Does race change what the ladder rewards you for building?",
    table: { columns: ["Race", "Base score", "Cheapest", "per point", "Dearest"], rows },
    findings:
      best.size <= 1
        ? [`Every race's cheapest troop route is the same (${[...best][0]}) — race is not shaping ladder strategy.`]
        : [`${best.size} different cheapest routes across six races — the ladder asks different things of different peoples.`],
  };
}

/** What the score of a typical empire is actually made of. */
function compositionSection(): Section {
  const rows: Row[] = [];
  const zero = (patch: Partial<SandboxArmy>) => scoreOf({ ...BASE, ...patch });
  const total = scoreOf(BASE);
  const parts: [string, Partial<SandboxArmy>][] = [
    ["People (civilians + scouts)", { peasants: 0, scouts: 0 }],
    ["Regulars", { footmen: [0, 0, 0], archers: [0, 0, 0], cavalry: [0, 0, 0] }],
    ["Engineers", { engineers: 0 }],
    ["Defensive works", { counters: {} }],
    ["Walls", { wallLevel: 0 }],
    ["Veterancy", { experience: 0 }],
  ];
  for (const [label, patch] of parts) {
    const value = total - zero(patch);
    rows.push([label, num(value), `${Math.round((value / total) * 100)}%`]);
  }
  const dominant = rows.filter((r) => parseInt(String(r[2])) > 50);
  return {
    heading: "What a mid-game score is made of",
    question: "Does one term swamp the rest?",
    table: { columns: ["Component", "Points", "Share"], rows, note: `Reference empire scores ${num(total)}.` },
    findings: dominant.length
      ? [`${dominant[0]![0]} alone is ${dominant[0]![2]} of the score — the ladder is largely a measure of that one thing.`]
      : ["No single component exceeds half the score."],
  };
}

export const rankingHarness: Harness = {
  id: "ranking",
  title: "Harness C — Ranking",
  question: "What is the cheapest ranking point, and does the answer differ by race?",
  about:
    "Sweeps marginal score per unit of spend across every purchase route and all six races. Deterministic — rankingScore has no rolls.",
  run(): Report {
    const sections = [
      costPerPointSection("human"),
      raceRoutesSection(),
      compositionSection(),
    ];
    const total = scoreOf(BASE);
    const metrics: Record<string, number> = {
      "ranking.reference.total": total,
      "ranking.perXpPoint": SCORE.PER_XP_POINT,
      "ranking.wallsAtL10": wallsScoreAtLevel(10),
    };
    for (const race of ALL_RACES) metrics[`ranking.race.${race}`] = scoreOf({ ...BASE, race });
    void RACES;
    return { id: "ranking", title: this.title, question: this.question, sections, metrics };
  },
};
