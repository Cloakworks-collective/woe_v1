import { describe, expect, it } from "vitest";
import { newEmpire } from "./newEmpire";
import { processTurnTick } from "./tick";
import type { Player } from "./types";

function fresh(): Player {
  return newEmpire({ id: "t", name: "Test", race: "human" });
}

describe("turn tick", () => {
  it("collects tax from every civilian at 50% (0.2 g each)", () => {
    const { player } = processTurnTick(fresh());
    // 80 civilians × 0.4 × 0.5 = 16
    expect(player.gold).toBe(5000 + 16);
  });

  it("deducts food upkeep before production (0.1 × pop)", () => {
    const { player } = processTurnTick(fresh());
    // 80 civilians + 20 footmen = 100 pop → 10 food
    expect(player.resources.food).toBe(990);
  });

  it("produces 10/turn per producer at 50% tax, capped by building slots", () => {
    const p = fresh();
    p.buildings.grange = 1; // 20 slots
    p.workers.farmers = 30; // 10 over cap
    p.idlePeasants = 50;
    const { player } = processTurnTick(p);
    // 20 effective farmers × 20 × (1−0.5) × 1.25 human = 250 food, minus upkeep 10
    expect(player.resources.food).toBe(1000 + 250 - 10);
  });

  it("a bombarded production building yields proportionally less", () => {
    const p = fresh();
    p.buildings.grange = 1;
    p.workers.farmers = 20;
    p.idlePeasants = 60;
    p.buildingIntegrity = { grange: 0.5 }; // cracked to the floor
    const { player } = processTurnTick(p);
    // 20 × 20 × 0.5 × 0.5 integrity × 1.25 human = 125 food, minus upkeep 10
    expect(player.resources.food).toBe(1000 + 125 - 10);
  });

  it("a cracked Collegium banks research slower", () => {
    const p = fresh();
    p.buildings.collegium = 1;
    p.workers.researchers = 20;
    p.idlePeasants = 60;
    p.research.activeField = "masonry";
    p.buildingIntegrity = { collegium: 0.5 };
    const { player } = processTurnTick(p);
    // 20 × 20 × 0.5 × 0.5 integrity = 100 RP
    expect(player.research.banked.masonry).toBe(100);
  });

  it("statecraft 5 doubles post-tax output", () => {
    const p = fresh();
    p.buildings.grange = 2;
    p.workers.farmers = 20;
    p.research.levels.statecraft = 5;
    const { player } = processTurnTick(p);
    // 20 × 20 × 0.5 × 2 × 1.25 human = 500 food, minus upkeep 12 (120 pop: farmers added on top)
    expect(player.resources.food).toBe(1000 + 500 - 12);
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
    p.army.mercenaries = 5; // 50 g due
    p.gold = 0;
    p.taxRate = 0; // no income this tick
    const { player, events } = processTurnTick(p);
    expect(player.army.mercenaries).toBe(0);
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

  it("surrendered empires earn half tax", () => {
    const p = fresh();
    p.surrendered = true;
    const { player } = processTurnTick(p);
    expect(player.gold).toBe(5000 + 8);
  });
});
