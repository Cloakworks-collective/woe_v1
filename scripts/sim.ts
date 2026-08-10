// Balance simulations on the pure engine (todo task 9). Run: pnpm sim
// Executed through vitest so the TS engine loads without a build step.

import { it } from "vitest";
import {
  build,
  assignWorkers,
  trainTroops,
  civilians,
  level,
  military,
  newEmpire,
  processDailyReset,
  processTurnTick,
  rankingScore,
  resolveBattle,
  seededRng,
  settlementTitle,
  totalPopulation,
  vacantHousing,
  type Player,
} from "../lib/engine";
import { CIVILIAN_LEVELLED_IDS, SCORE, TURNS_PER_DAY } from "../lib/constants";
import type { BuildingId } from "../lib/constants/buildings";

const attempt = (fn: () => { player: Player }, p: Player): Player => {
  try {
    return fn().player;
  } catch {
    return p;
  }
};

it("economy pacing — greedy builder, 60 days", () => {
  let p = newEmpire({ id: "sim", name: "Simton", race: "human" });
  const rows: string[] = [];

  for (let day = 1; day <= 60; day++) {
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

    // The garrison is now trained straight into light footmen — ensure the
    // Drill Yard and Forge exist first, then keep at 35% of civilians.
    if (level(p, "drill_yard") < 1) p = attempt(() => build(p, "drill_yard"), p);
    if (level(p, "forge") < 1) p = attempt(() => build(p, "forge"), p);
    while (military(p) < 0.35 * civilians(p)) {
      const before = p;
      p = attempt(() => trainTroops(p, "footman", "light", 1), p);
      if (p === before) {
        p = attempt(() => build(p, "muster_hall"), p);
        if (p === before) break; // can't afford either — wait for income
      }
    }

    // Housing ahead of growth (only when beds run short), then round-robin.
    if (vacantHousing(p) < 6) p = attempt(() => build(p, "hearthstead"), p);
    const targets: BuildingId[] = [
      "grange",
      "sawyers_mill",
      "masons_quarry",
      "deepvein_mine",
      "collegium",
      "granary",
      "timberyard",
      "masons_yard",
      "ironhold",
      "counting_house",
      "market_square",
      "shadow_guild",
      "rangers_lodge",
    ];
    p = attempt(() => build(p, targets[day % targets.length]), p);

    // Fill work slots evenly.
    for (const role of ["farmers", "lumberjacks", "quarrymen", "miners", "researchers"] as const) {
      p = attempt(() => assignWorkers(p, role, 1), p);
    }

    p = processDailyReset(p, day * TURNS_PER_DAY).player;

    if (day % 10 === 0 || day === 1) {
      const L = CIVILIAN_LEVELLED_IDS.reduce((s, id) => s + (p.buildings[id] ?? 0), 0);
      // Score composition — treasury must not dominate (the old 40g bug).
      const treasury =
        (p.gold + p.bankedGold) / 100 +
        (p.resources.food + p.resources.wood + p.resources.stone + p.resources.ore) /
          2000;
      const total = rankingScore(p);
      rows.push(
        `day ${String(day).padStart(2)}: pop ${String(totalPopulation(p)).padStart(5)}  ` +
          `civLevels ${String(L).padStart(3)}  ${settlementTitle(p).padEnd(7)}  ` +
          `score ${String(total).padStart(7)}  ` +
          `treasury ${String(Math.round((treasury / total) * 100)).padStart(3)}% of score  ` +
          `gold ${Math.round(p.gold + p.bankedGold)}`,
      );
    }
  }
  console.log("\n=== Economy pacing (greedy builder) ===\n" + rows.join("\n"));
});

it("combat — luck spread and size matchups", () => {
  const makeArmy = (n: number, walls: number): Player => {
    const p = newEmpire({ id: "x", name: "X", race: "human" });
    p.army.footmen = { light: n, medium: 0, heavy: 0 };
    p.buildings.muster_hall = Math.ceil(n / 10) + 2;
    p.buildings.walls = walls;
    return p;
  };

  // Even open-field fight: how often does the attacker win across the ±10% luck?
  let aWins = 0;
  const N = 300;
  for (let s = 0; s < N; s++) {
    const r = resolveBattle(makeArmy(100, 0), makeArmy(100, 0), "raid", {
      rng: seededRng(s * 7 + 1),
      battleId: "s",
      tick: 1,
    });
    if (r.report.victor === "attacker") aWins++;
  }
  console.log(`\n=== Even 100v100 raid: attacker wins ${aWins}/${N} (${Math.round((aWins / N) * 100)}%) — defender's edge should be mild`);

  // Attacker size needed to crack walls without escalade.
  const lines: string[] = [];
  for (const walls of [0, 3, 5, 8]) {
    for (const size of [100, 150, 200, 300]) {
      const r = resolveBattle(makeArmy(size, 0), makeArmy(100, walls), "siege", {
        rng: seededRng(42),
        battleId: "s",
        tick: 1,
      });
      lines.push(
        `walls ${walls}, ${size} vs 100: ${r.report.victor.padEnd(8)} in ${r.report.rounds} rounds ` +
          `(atk lost ${r.report.attackerLosses.footmen}, def lost ${r.report.defenderLosses.footmen})`,
      );
    }
  }
  console.log("=== Siege matchups (no escalade) ===\n" + lines.join("\n"));
});

// ═══════════════════════════════════════════════════════════════════════════
// BALANCE GUARDRAILS
//
// Two checks that answer questions no single battle can. Neither asserts a
// pass/fail — they print, because balance is a judgement and these are the
// numbers to judge from. Run: pnpm sim
// ═══════════════════════════════════════════════════════════════════════════

it("race symmetry — every pairing, equal investment", () => {
  const RACES_LIST = ["human", "elf", "orc", "troll", "dwarf", "gnoll"] as const;
  const ROUNDS = 40;

  /** Identical build, identical numbers — only the blood is different. */
  const banner = (race: (typeof RACES_LIST)[number]): Player => {
    const p = newEmpire({ id: race, name: race, race });
    p.army.footmen = { light: 400, medium: 200, heavy: 100 };
    p.army.archers = { light: 300, medium: 150, heavy: 60 };
    p.army.cavalry = { light: 200, medium: 100, heavy: 40 };
    p.buildings = { ...p.buildings, muster_hall: 200 };
    p.shieldUntilTick = 0;
    return p;
  };

  // OPEN FIELD, not a siege. A walled defender with an identical army holds
  // every time, which measures the wall rather than the race — the result is a
  // column of zeroes that hides exactly what we came to look at.
  const grid: string[] = [];
  const attackWins: Record<string, number> = {};
  const attackPlayed: Record<string, number> = {};

  for (const a of RACES_LIST) {
    const cells: string[] = [];
    for (const d of RACES_LIST) {
      let aWon = 0;
      for (let i = 0; i < ROUNDS; i++) {
        const r = resolveBattle(banner(a), banner(d), "raid", {
          rng: seededRng(i * 977 + 13),
          battleId: "rs",
          tick: 1,
        });
        if (r.report.victor === "attacker") aWon++;
      }
      attackWins[a] = (attackWins[a] ?? 0) + aWon;
      attackPlayed[a] = (attackPlayed[a] ?? 0) + ROUNDS;
      cells.push(String(Math.round((aWon / ROUNDS) * 100)).padStart(4) + "%");
    }
    grid.push(a.padEnd(7) + cells.join(" "));
  }

  console.log(
    "\n=== Race symmetry: raid win % as ATTACKER (rows) vs defender (cols) ===\n" +
      "       " + RACES_LIST.map((r) => r.slice(0, 5).padStart(5)).join(" ") + "\n" +
      grid.join("\n"),
  );

  // Every race attacks the same six opponents with the same army, so these
  // figures are directly comparable. A flat column means the races differ only
  // in flavour; a spread means one of them is buying more war per gold.
  const rank = RACES_LIST.map((r) => ({ r, pct: (attackWins[r] / attackPlayed[r]) * 100 }))
    .sort((x, y) => y.pct - x.pct);
  const spread = rank[0].pct - rank[rank.length - 1].pct;
  console.log(
    "\nMean attack win rate (identical army, same six opponents):\n" +
      rank.map((o) => `  ${o.r.padEnd(7)} ${o.pct.toFixed(1)}%`).join("\n") +
      `\n  spread ${spread.toFixed(1)} points\n` +
      "\n  ⚠ THIS MEASURES ONE AXIS ONLY. Do not flatten the race table on it.\n" +
      "  Trolls (siege 1.4, stone 1.6) and Dwarves (walls 1.25, ore 1.4) are the\n" +
      "  siege and fortress races — losing open-field raids is what they trade\n" +
      "  away, not a bug. A race is broken only when it is bottom-quartile on\n" +
      "  EVERY path to winning an age: production, ranking, siege, defence and\n" +
      "  the shadow war. See the tuning backlog in todo.md before touching a\n" +
      "  multiplier. The one genuine suspect here is the ARCHER PHASE, which\n" +
      "  fires first and can decide a raid before the other arms swing.",
  );
});

it("ranking honesty — points per gold across every path", () => {
  // THE CONDITION that protects scouting. Rank publishes ONE number, and the
  // design leans on many different empires producing the same number: a turtle
  // and a hammer rank alike, so rank says WHETHER to attack and only a scout
  // says HOW. That property survives only while no single path buys rank
  // appreciably cheaper than the others. If one does, everyone builds that one
  // thing, every empire converges on the same shape, and scouting is pointless.
  const base = () => {
    const p = newEmpire({ id: "b", name: "B", race: "human" });
    p.buildings = { ...p.buildings, muster_hall: 500, war_foundry: 10, walls: 0 };
    return p;
  };

  const GOLD = 200_000;
  const paths: { name: string; apply: (p: Player) => void; gold: number }[] = [
    { name: "light footmen", gold: GOLD, apply: (p) => { p.army.footmen.light += Math.floor(GOLD / 150); } },
    { name: "heavy footmen", gold: GOLD, apply: (p) => { p.army.footmen.heavy += Math.floor(GOLD / 600); } },
    { name: "light archers", gold: GOLD, apply: (p) => { p.army.archers.light += Math.floor(GOLD / 150); } },
    { name: "light cavalry", gold: GOLD, apply: (p) => { p.army.cavalry.light += Math.floor(GOLD / 350); } },
    { name: "engineers", gold: GOLD, apply: (p) => { p.army.siegeEngineers += Math.floor(GOLD / 200); } },
    { name: "scouts", gold: GOLD, apply: (p) => { p.army.scouts += Math.floor(GOLD / 200); } },
    { name: "counter-engines", gold: GOLD, apply: (p) => {
        const n = Math.floor(GOLD / 2000);
        p.army.siegeCounters.counter_engine += n;
        p.army.siegeEngineers += n * 5; // must be crewed to score at all
      } },
    { name: "hired footmen", gold: GOLD, apply: (p) => {
        p.army.footmen.light += 200; // regulars to command them
        p.army.mercenaries.footmen.light += Math.floor(GOLD / 900);
      } },
    { name: "TREBUCHETS (dark)", gold: GOLD, apply: (p) => {
        const n = Math.floor(GOLD / 2000);
        p.army.siegeGear.trebuchets += n;
        p.army.siegeEngineers += n * 5;
      } },
  ];

  const zero = rankingScore(base());
  const rows = paths.map((path) => {
    const p = base();
    path.apply(p);
    const gained = rankingScore(p) - zero;
    return { name: path.name, gained, perGold: gained / path.gold };
  });

  const combat = rows.filter((r) => !r.name.includes("dark"));
  const median = [...combat].sort((a, b) => a.perGold - b.perGold)[Math.floor(combat.length / 2)].perGold;

  console.log(
    "\n=== Ranking honesty: points per 200k gold ===\n" +
      rows
        .map((r) => {
          const ratio = r.perGold / median;
          const flag = r.name.includes("dark")
            ? "  (deliberately invisible — only a scout reveals it)"
            : ratio > 1.3 || ratio < 0.77
              ? `  ⚠ ${ratio.toFixed(2)}× the median — an outlier`
              : `  ${ratio.toFixed(2)}× median`;
          return `  ${r.name.padEnd(18)} ${String(r.gained).padStart(7)} pts${flag}`;
        })
        .join("\n") +
      "\n\nAn outlier here is a real bug: it collapses every empire onto one\n" +
      "shape and takes the value of scouting down with it.",
  );
});
