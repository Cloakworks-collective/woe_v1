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
        (p.gold + p.bankedGold) / SCORE.GOLD_DIVISOR +
        (p.resources.food + p.resources.wood + p.resources.stone + p.resources.ore) /
          SCORE.RESOURCE_DIVISOR;
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
