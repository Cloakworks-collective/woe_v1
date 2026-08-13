// The Steward (spec/clans.md): queues + standing orders, premium-gated.

import { describe, expect, it } from "vitest";
import { researchOrdinalCost } from "../constants";
import {
  addStandingOrder,
  dequeueBuild,
  processSteward,
  queueBuild,
  queueResearch,
  removeStandingOrder,
} from "./steward";
import { newEmpire } from "./newEmpire";
import { EngineError, level, researchLevel, type Player } from "./types";

function charterHolder(): Player {
  const p = newEmpire({ id: "p1", name: "Test", race: "human" });
  p.premium = true;
  return p;
}

describe("premium gating", () => {
  it("rejects queue and order commands without the Charter", () => {
    const p = newEmpire({ id: "p1", name: "Pauper", race: "human" });
    expect(() => queueBuild(p, "grange")).toThrow(EngineError);
    expect(() => queueResearch(p, "masonry")).toThrow(EngineError);
    expect(() =>
      addStandingOrder(p, "o1", { kind: "gold", amount: 1 }, { kind: "setTax", rate: 0.5 }),
    ).toThrow(EngineError);
  });

  it("steward tick is a no-op without the Charter", () => {
    const p = newEmpire({ id: "p1", name: "Pauper", race: "human" });
    const r = processSteward(p);
    expect(r.player).toBe(p);
    expect(r.events).toEqual([]);
  });
});

describe("build queue", () => {
  it("builds the head entry when affordable, in order", () => {
    let p = charterHolder(); // starts with 5,000g + 1,000 each resource
    p = queueBuild(p, "grange").player;
    p = queueBuild(p, "sawyers_mill").player;
    const r = processSteward(p);
    // Timber is the early bottleneck now (560 wood for a level-1 civilian
    // build), so the starting woodpile funds the head of the queue and the
    // second entry waits on the lumberjacks.
    expect(level(r.player, "grange")).toBe(1);
    expect(r.player.buildQueue).toEqual(["sawyers_mill"]);
  });

  it("waits (keeps order) when the head is unaffordable", () => {
    let p = charterHolder();
    p.resources.wood = 0; // grange L1 needs 480 wood
    p = queueBuild(p, "grange").player;
    p = queueBuild(p, "hearthstead").player; // affordable, but behind the grange
    const r = processSteward(p);
    expect(level(r.player, "grange")).toBe(0);
    expect(r.player.buildQueue).toEqual(["grange", "hearthstead"]); // no skipping
  });

  it("builds when resources arrive later", () => {
    let p = charterHolder();
    p.resources.wood = 0;
    p = queueBuild(p, "grange").player;
    p = processSteward(p).player;
    expect(level(p, "grange")).toBe(0);
    p.resources.wood = 2000;
    p.resources.stone = 2000; // the lumberjacks and quarrymen came through
    p = processSteward(p).player;
    expect(level(p, "grange")).toBe(1);
    expect(p.buildQueue).toEqual([]);
  });

  it("caps the queue and rejects queueing past max level", () => {
    let p = charterHolder();
    p.buildings.drill_yard = 3; // maxed tiered building
    expect(() => queueBuild(p, "drill_yard")).toThrow(/max/i);
    for (let i = 0; i < 10; i++) p = queueBuild(p, "hearthstead").player;
    expect(() => queueBuild(p, "hearthstead")).toThrow(/full/i);
    p = dequeueBuild(p, 0).player;
    expect(p.buildQueue!.length).toBe(9);
  });
});

describe("research queue", () => {
  it("directs the scholars and advances to the next entry when a level lands", () => {
    let p = charterHolder();
    p.buildings.collegium = 3;
    p = queueResearch(p, "masonry").player; // → level 1
    p = queueResearch(p, "crop_rotation").player; // then → level 1
    expect(p.researchQueue).toEqual([
      { field: "masonry", toLevel: 1 },
      { field: "crop_rotation", toLevel: 1 },
    ]);

    p = processSteward(p).player;
    expect(p.research.activeField).toBe("masonry");

    // The tick banks RP and completes the level; the Steward then rotates.
    p.research.levels.masonry = 1;
    p = processSteward(p).player;
    expect(p.research.activeField).toBe("crop_rotation");
    expect(p.researchQueue).toEqual([{ field: "crop_rotation", toLevel: 1 }]);
  });

  it("queueing the same field twice targets successive levels", () => {
    let p = charterHolder();
    p = queueResearch(p, "masonry").player;
    p = queueResearch(p, "masonry").player;
    expect(p.researchQueue!.map((e) => e.toLevel)).toEqual([1, 2]);
    expect(researchOrdinalCost(2)).toBeGreaterThan(researchOrdinalCost(1)); // sanity: progressive cost
  });
});

describe("standing orders", () => {
  it("'once this building is built, train N troops' — waits, then fulfills partially", () => {
    let p = charterHolder();
    p.gold = 100_000;
    p.resources = { food: 9000, wood: 20000, stone: 9000, ore: 9000 };
    p.idlePeasants = 500;
    p.buildings.hearthstead = 60;
    p.buildings.muster_hall = 2; // 20 slots, all taken by starting footmen
    p = addStandingOrder(
      p,
      "o1",
      { kind: "building", building: "drill_yard", level: 1 },
      { kind: "trainTroops", type: "footman", tier: "light", count: 40, remaining: 40 },
    ).player;

    // Condition not met — nothing happens.
    p = processSteward(p).player;
    expect(p.army.footmen.light).toBe(20); // just the 20 starters
    expect(p.standingOrders!.length).toBe(1);

    // Drill Yard + Forge rise; 3 more halls open 30 free slots — 40 wanted, 30 fit.
    p.buildings.drill_yard = 1;
    p.buildings.forge = 1;
    p.buildings.muster_hall = 5;
    p = processSteward(p).player;
    expect(p.army.footmen.light).toBe(50); // 20 + 30 (partial: 40→20, +10…)
    const order = p.standingOrders![0];
    expect(order.then).toMatchObject({ kind: "trainTroops", remaining: 10 });

    // More barracks → the remainder trains and the order retires.
    p.buildings.muster_hall = 7;
    p = processSteward(p).player;
    expect(p.army.footmen.light).toBe(60); // 20 + 40
    expect(p.standingOrders).toEqual([]);
  });

  it("resource conditions and one-shot actions (build, setTax)", () => {
    let p = charterHolder();
    p = addStandingOrder(
      p,
      "o1",
      { kind: "gold", amount: 6000 },
      { kind: "setTax", rate: 1 },
    ).player;
    p = addStandingOrder(
      p,
      "o2",
      { kind: "resource", resource: "stone", amount: 200 },
      { kind: "build", building: "masons_quarry" },
    ).player;

    p = processSteward(p).player; // gold 5,000 < 6,000; stone 1,000 ≥ 200
    expect(p.taxRate).toBe(0.5);
    expect(level(p, "masons_quarry")).toBe(1);
    expect(p.standingOrders!.map((o) => o.id)).toEqual(["o1"]);

    p.gold = 6001;
    p = processSteward(p).player;
    expect(p.taxRate).toBe(1);
    expect(p.standingOrders).toEqual([]);
  });

  it("orders can be removed, and the cap holds", () => {
    let p = charterHolder();
    for (let i = 0; i < 10; i++) {
      p = addStandingOrder(
        p,
        `o${i}`,
        { kind: "gold", amount: 10 ** 9 },
        { kind: "setTax", rate: 0.1 },
      ).player;
    }
    expect(() =>
      addStandingOrder(p, "o10", { kind: "gold", amount: 1 }, { kind: "setTax", rate: 0.1 }),
    ).toThrow(/10/);
    p = removeStandingOrder(p, "o3").player;
    expect(p.standingOrders!.length).toBe(9);
  });

  it("train-troops orders respect tier gates by retrying, not crashing", () => {
    let p = charterHolder();
    p.gold = 100_000;
    p.resources = { food: 9000, wood: 20000, stone: 9000, ore: 9000 };
    p.idlePeasants = 80;
    p.buildings.muster_hall = 8; // 80 slots, 20 used → 60 free
    p = addStandingOrder(
      p,
      "o1",
      { kind: "gold", amount: 1 },
      { kind: "trainTroops", type: "footman", tier: "light", count: 50, remaining: 50 },
    ).player;
    // No Drill Yard/Forge yet: the order stays pending.
    p = processSteward(p).player;
    expect(p.standingOrders!.length).toBe(1);
    p.buildings.drill_yard = 1;
    p.buildings.forge = 1;
    p = processSteward(p).player;
    expect(p.army.footmen.light).toBe(20 + 50); // 20 starting + 50 trained
    expect(p.standingOrders).toEqual([]);
  });
});

describe("integration: queue feeds orders in the same pass", () => {
  it("a queued build can satisfy a building condition within one steward pass", () => {
    let p = charterHolder();
    p.gold = 50_000;
    p.resources = { food: 5000, wood: 20000, stone: 5000, ore: 5000 };
    p.buildings.muster_hall = 5; // room for 30 more troops
    p.buildings.forge = 1; // the Forge is already up; the queue raises the yard
    p = queueBuild(p, "drill_yard").player;
    p = addStandingOrder(
      p,
      "o1",
      { kind: "building", building: "drill_yard", level: 1 },
      { kind: "trainTroops", type: "footman", tier: "light", count: 10, remaining: 10 },
    ).player;
    p = processSteward(p).player; // builds the yard, then the order fires
    expect(level(p, "drill_yard")).toBe(1);
    expect(p.army.footmen.light).toBe(30); // 20 starters + 10 trained
    expect(p.standingOrders).toEqual([]);
  });
});
