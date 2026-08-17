import { describe, expect, it } from "vitest";
import {
  GOLD_PER_CIVILIAN_AT_FULL_TAX,
  WORKER_FOOD_PER_TURN,
  researchOrdinalCost,
  workerOutputAtLevel,
} from "../constants";
import { newEmpire } from "./newEmpire";
import { foodUpkeepPerTurn, processTurnTick } from "./tick";
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

  it("output scales with building level and is UNCAPPED by slots (10×level per worker)", () => {
    const p = fresh();
    p.buildings.grange = 1;
    p.workers.farmers = 30; // no slot cap — all 30 produce
    p.idlePeasants = 50;
    const { player } = processTurnTick(p);
    // 30 farmers × (10 × 1 level × (1−0.5) tax) × 1.25 human = 187.5 → floored
    // to 187 (stocks are whole; see ROUNDING in tick.ts). Upkeep taken first:
    // 10 for the people, plus 30 workers × 5 rations = 160.
    expect(workerOutputAtLevel(1)).toBe(10);
    expect(player.resources.food).toBe(1000 - 160 + 187);
  });

  it("a bombarded production building yields proportionally less", () => {
    const p = fresh();
    p.buildings.grange = 1;
    p.workers.farmers = 20;
    p.idlePeasants = 60;
    p.buildingIntegrity = { grange: 0.5 }; // cracked to the floor
    const { player } = processTurnTick(p);
    // 20 × (10 × 1 × 0.5 tax) × 0.5 integrity × 1.25 human = 62.5 → floored to
    // 62, minus upkeep 10 + 20 workers × 5 = 110.
    expect(player.resources.food).toBe(1000 - 110 + 62);
  });

  it("a cracked Collegium banks research slower", () => {
    const p = fresh();
    p.buildings.collegium = 1;
    p.workers.researchers = 20;
    p.idlePeasants = 60;
    p.research.activeField = "masonry";
    p.buildingIntegrity = { collegium: 0.5 };
    const { player } = processTurnTick(p);
    // 20 scholars × (10 × 1 level × 0.5 tax) × 0.5 integrity = 50 RP.
    // Scholars are on their own curve (RESEARCH_OUTPUT_CURVE) — what it sets is
    // how far up the progressive research price an age can climb.
    expect(player.research.banked.masonry).toBe(50);
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
    // 20 × (10 × 2 level × 0.5 tax) × 1.25 human = 250 food, minus upkeep
    // 12 + 20 workers × 5 = 112 — statecraft multiplies none of it.
    expect(player.resources.food).toBe(1000 - 112 + 250);
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

  it("mercenaries draw no wage and never desert a broke treasury", () => {
    // Hiring is a one-time price now: the contract is bought, not rented. The
    // check on a sellsword army is MERCENARIES.CAP_RATIO (they are paid off when
    // the regulars of their arm die), never the treasury.
    const p = fresh();
    p.army.mercenaries.footmen.light = 3;
    p.army.mercenaries.cavalry.heavy = 2;
    p.gold = 0;
    p.taxRate = 0; // no income this tick either
    const { player, events } = processTurnTick(p);
    expect(mercTotal(player.army.mercenaries)).toBe(5);
    expect(player.gold).toBe(0);
    expect(events.some((e) => e.type === "mercsDefected")).toBe(false);
  });

  it("charges every assigned worker a ration on top of the head count", () => {
    const p = fresh();
    const idle = foodUpkeepPerTurn(p); // nobody assigned yet
    p.workers.farmers = 7;
    p.idlePeasants = Math.max(0, p.idlePeasants - 7);
    // Assigning does not change the head count — the same people, now working —
    // so the whole difference is the worker ration.
    expect(foodUpkeepPerTurn(p) - idle).toBe(7 * WORKER_FOOD_PER_TURN);
  });

  it("a level-1 worker exactly feeds himself at the default tax", () => {
    // The floor the ration is set against: L1 output is 10 × 0.5 tax = 5, and a
    // worker eats 5. Every building level after the first is real surplus.
    expect(workerOutputAtLevel(1) * 0.5).toBe(WORKER_FOOD_PER_TURN);
  });

  it("production stops entirely when there is no food to eat", () => {
    const p = fresh();
    p.buildings.grange = 5;
    p.buildings.deepvein_mine = 5;
    p.workers.farmers = 20;
    p.workers.miners = 20;
    p.resources = { food: 0, wood: 0, stone: 0, ore: 0 };
    p.bankedResources = { food: 0, wood: 0, stone: 0, ore: 0 };
    const { player, events } = processTurnTick(p);
    expect(player.starving).toBe(true);
    expect(events.some((e) => e.type === "starvation")).toBe(true);
    // Nothing produced — not the ore either, though miners do not eat ore.
    expect(player.resources.ore).toBe(0);
    expect(player.resources.food).toBe(0);
  });

  it("the Steward's vaulting keeps stocks whole", () => {
    // The shelter curve is fractional at nearly every level, so moving
    // `capacity − banked` used to put a fraction of a sack in the vault.
    const p = fresh();
    p.premium = true;
    p.buildings.granary = 12;
    p.buildings.timberyard = 12;
    p.resources = { food: 50_000_000, wood: 50_000_000, stone: 0, ore: 0 };
    p.bankedResources = { food: 0, wood: 0, stone: 0, ore: 0 };
    const { player } = processTurnTick(p);
    for (const r of ["food", "wood", "stone", "ore"] as const) {
      expect(Number.isInteger(player.resources[r]), `loose ${r}`).toBe(true);
      expect(Number.isInteger(player.bankedResources![r]), `vaulted ${r}`).toBe(true);
    }
  });

  it("recovers 1 stamina a turn from the GRANARY, not just loose food", () => {
    // The bug this pins: loose food is what raiders take, so the game teaches
    // you to bank it — and a ruler who did exactly that had a full granary and
    // an army whose stamina never moved.
    const p = fresh();
    p.army.stamina = 40;
    p.resources.food = 0;
    p.bankedResources = { food: 5_000, wood: 0, stone: 0, ore: 0 };
    const { player } = processTurnTick(p);
    expect(player.starving).toBe(false);
    expect(player.army.stamina).toBe(41);
  });

  it("does not recover when there is no food anywhere", () => {
    const p = fresh();
    p.army.stamina = 40;
    p.resources.food = 0;
    p.bankedResources = { food: 0, wood: 0, stone: 0, ore: 0 };
    const { player } = processTurnTick(p);
    expect(player.starving).toBe(true);
    expect(player.army.stamina).toBe(40);
  });

  it("stops at the ceiling", () => {
    const p = fresh();
    p.army.stamina = 100;
    p.resources.food = 5_000;
    expect(processTurnTick(p).player.army.stamina).toBe(100);
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

describe("the tick's purity waiver", () => {
  it("stays pure by default — the input is untouched", () => {
    const p = newEmpire({ id: "pure", name: "Pure", race: "human" });
    p.workers.farmers = 50;
    const before = JSON.stringify(p);
    processTurnTick(p, { currentTick: 1 });
    expect(JSON.stringify(p)).toBe(before);
  });

  it("unsafeInPlace mutates the input and returns the same object", () => {
    // The waiver exists for exactly one caller — runOneTick, which replaces
    // the player with the result in the same breath. Everyone else clones.
    const p = newEmpire({ id: "mut", name: "Mut", race: "human" });
    const { player } = processTurnTick(p, { currentTick: 1, unsafeInPlace: true });
    expect(player).toBe(p);
  });
});
