import { describe, expect, it } from "vitest";
import { GOLD_PER_CIVILIAN_AT_FULL_TAX, researchOrdinalCost, workerOutputAtLevel } from "../constants";
import { newEmpire } from "./newEmpire";
import { processTurnTick } from "./tick";
import { mercTotal, type Player } from "./types";

function fresh(): Player {
  return newEmpire({ id: "t", name: "Test", race: "human" });
}

describe("turn tick", () => {
  it("collects tax from every civilian at 50%", () => {
    const { player } = processTurnTick(fresh());
    // 80 civilians × 400 × 0.5 = 16,000. Coin is deliberately abundant now —
    // the scarce half of the economy is what a worker digs, below.
    expect(player.gold).toBe(5000 + 80 * GOLD_PER_CIVILIAN_AT_FULL_TAX * 0.5);
  });

  it("deducts food upkeep before production (0.1 × pop)", () => {
    const { player } = processTurnTick(fresh());
    // 80 civilians + 20 footmen = 100 pop → 10 food
    expect(player.resources.food).toBe(990);
  });

  it("output scales with building level and is UNCAPPED by slots (5×level per worker)", () => {
    const p = fresh();
    p.buildings.grange = 1;
    p.workers.farmers = 30; // no slot cap — all 30 produce
    p.idlePeasants = 50;
    const { player } = processTurnTick(p);
    // 30 farmers × (5 × 1 level × (1−0.5) tax) × 1.25 human = 93.75 → floored
    // to 93 (stocks are whole; see ROUNDING in tick.ts). Upkeep 10 taken first.
    expect(workerOutputAtLevel(1)).toBe(5);
    expect(player.resources.food).toBe(1000 - 10 + 93);
  });

  it("a bombarded production building yields proportionally less", () => {
    const p = fresh();
    p.buildings.grange = 1;
    p.workers.farmers = 20;
    p.idlePeasants = 60;
    p.buildingIntegrity = { grange: 0.5 }; // cracked to the floor
    const { player } = processTurnTick(p);
    // 20 × (5 × 1 × 0.5 tax) × 0.5 integrity × 1.25 human = 31.25 → floored to
    // 31, minus upkeep 10.
    expect(player.resources.food).toBe(1000 - 10 + 31);
  });

  it("a cracked Collegium banks research slower", () => {
    const p = fresh();
    p.buildings.collegium = 1;
    p.workers.researchers = 20;
    p.idlePeasants = 60;
    p.research.activeField = "masonry";
    p.buildingIntegrity = { collegium: 0.5 };
    const { player } = processTurnTick(p);
    // 20 scholars × (50 × 1 level × 0.5 tax) × 0.5 integrity = 250 RP.
    // Scholars are on their own curve and did NOT take the tenfold goods cut —
    // making goods scarce should not silently make the tech tree ten times
    // slower against a fixed research price.
    expect(player.research.banked.masonry).toBe(250);
  });

  it("research needs no Collegium gate — any level completes when the RP is banked", () => {
    const p = fresh();
    p.buildings.collegium = 1; // a tiny library — old model would have gated level 2+
    p.research.activeField = "masonry";
    p.research.levels.masonry = 3; // going for level 4 at a level-1 Collegium
    p.research.banked.masonry = researchOrdinalCost(4) + 5; // total done = 3 → next is the 4th
    p.workers.researchers = 0; // no new RP this tick; just resolve the level-up
    const { player } = processTurnTick(p);
    expect(player.research.levels.masonry).toBe(4);
  });

  it("research cost is global + progressive (the Nth level costs by its ordinal)", () => {
    const p = fresh();
    p.research.levels = { masonry: 3, siegecraft: 1, pathfinding: 2 }; // 6 done
    p.research.activeField = "statecraft";
    // The next level (statecraft's 1st) is the 7th research overall.
    p.research.banked.statecraft = researchOrdinalCost(7) + 1;
    p.workers.researchers = 0;
    const { player } = processTurnTick(p);
    expect(player.research.levels.statecraft).toBe(1);
    // ...and it cost the 7th-ordinal price, more than the 1st ever did.
    expect(researchOrdinalCost(7)).toBeGreaterThan(researchOrdinalCost(1));
  });

  it("statecraft no longer touches production — it is the treasury\u2019s field", () => {
    const p = fresh();
    p.buildings.grange = 2;
    p.workers.farmers = 20;
    p.research.levels.statecraft = 5;
    const { player } = processTurnTick(p);
    // 20 × (5 × 2 level × 0.5 tax) × 1.25 human = 125 food, minus upkeep 12 —
    // statecraft multiplies none of it.
    expect(player.resources.food).toBe(1000 - 12 + 125);
  });

  it("the granary vault feeds the people when loose food runs dry", () => {
    const p = fresh();
    p.resources.food = 4; // upkeep is 10
    p.bankedResources = { food: 50, wood: 0, stone: 0, ore: 0 };
    const { player } = processTurnTick(p);
    expect(player.starving).toBe(false);
    expect(player.resources.food).toBe(0);
    expect(player.bankedResources!.food).toBe(44); // vault paid the 6 short
  });

  it("the Steward auto-vaults loose goods for Charter holders", () => {
    const p = fresh();
    p.premium = true;
    const { player } = processTurnTick(p);
    // Food: 1000 − 10 upkeep = 990 loose, then vaulted. Wood: all 1000 vaulted.
    expect(player.resources.food).toBe(0);
    expect(player.bankedResources!.food).toBe(990);
    expect(player.resources.wood).toBe(0);
    expect(player.bankedResources!.wood).toBe(1000);
  });

  it("starves at 0 food: no tax, no production, flag set, event emitted", () => {
    const p = fresh();
    p.resources.food = 5; // upkeep is 10
    p.buildings.grange = 1;
    p.workers.farmers = 10;
    const { player, events } = processTurnTick(p);
    expect(player.starving).toBe(true);
    expect(player.resources.food).toBe(0); // no same-tick harvest rescue
    expect(player.gold).toBe(5000); // no tax income
    expect(events).toContainEqual({ type: "starvation" });
  });

  it("recovers from starvation once fed", () => {
    const p = fresh();
    p.starving = true;
    p.resources.food = 500;
    const { player, events } = processTurnTick(p);
    expect(player.starving).toBe(false);
    expect(events).toContainEqual({ type: "fed" });
  });

  it("unpaid mercenaries all defect at once", () => {
    const p = fresh();
    p.army.mercenaries.footmen.light = 3;
    p.army.mercenaries.cavalry.heavy = 2; // 5 mercs, 5 g due
    p.gold = 0;
    p.taxRate = 0; // no income this tick
    const { player, events } = processTurnTick(p);
    expect(mercTotal(player.army.mercenaries)).toBe(0);
    expect(events).toContainEqual({ type: "mercsDefected", count: 5 });
  });

  it("banks research points and completes levels behind the Collegium gate", () => {
    const p = fresh();
    p.buildings.collegium = 1; // gate: field level 1 needs Collegium 1
    p.workers.researchers = 20;
    p.research.activeField = "masonry";
    p.research.banked.masonry = 1900; // +200 RP this tick → 2,100 ≥ 2,000
    const { player, events } = processTurnTick(p);
    expect(player.research.levels.masonry).toBe(1);
    expect(events).toContainEqual({ type: "researchComplete", field: "masonry", level: 1 });
    // level 2 needs Collegium 3 — blocked even with banked RP
    expect(player.research.levels.masonry).not.toBe(2);
  });

  it("accrues 2 action turns per tick, capped at 500", () => {
    const p = fresh();
    p.turnsAvailable = 499;
    const { player } = processTurnTick(p);
    expect(player.turnsAvailable).toBe(500);
  });

  it("onVacation empires earn half tax", () => {
    const p = fresh();
    p.onVacation = true;
    const { player } = processTurnTick(p);
    // 80 × 400 × 0.5 tax × 0.5 vacation
    expect(player.gold).toBe(5000 + 80 * GOLD_PER_CIVILIAN_AT_FULL_TAX * 0.5 * 0.5);
  });
});

it("statecraft doubles the tax take at mastery, and nothing else", () => {
  const plain = fresh();
  plain.workers.farmers = 20;
  plain.buildings.grange = 2;
  const studied = structuredClone(plain);
  studied.research.levels.statecraft = 5;

  const a = processTurnTick(plain).player;
  const b = processTurnTick(studied).player;

  // Gold: double. Food: identical — production is the four fields' business.
  expect(b.gold - 5000).toBeCloseTo((a.gold - 5000) * 2, 5);
  expect(b.resources.food).toBe(a.resources.food);
});
