import { describe, expect, it } from "vitest";
import {
  assignWorkers,
  bankGold,
  build,
  buyMercenaries,
  disbandTroops,
  equipTroops,
  restTroops,
  setTax,
  trainWarriors,
} from "./commands";
import { buildingCost } from "./costs";
import { newEmpire } from "./newEmpire";
import type { Player } from "./types";

function fresh(): Player {
  return newEmpire({ id: "t", name: "Test", race: "human" });
}

describe("building costs (spec/buildings.md examples)", () => {
  it("buildings never cost ore — it's reserved for troops", () => {
    for (const id of ["grange", "walls", "forge", "hearthstead", "muster_hall"] as const) {
      expect(buildingCost(id, 1).ore).toBe(0);
    }
  });

  it("civilian level 1: 400g + 480 wood / 320 stone / no ore", () => {
    expect(buildingCost("grange", 1)).toEqual({ gold: 400, wood: 480, stone: 320, ore: 0 });
  });

  it("military level 1: 600g + 540 wood / 660 stone / no ore", () => {
    expect(buildingCost("walls", 1)).toEqual({ gold: 600, wood: 540, stone: 660, ore: 0 });
  });

  it("hearthstead: flat 150g + 180 wood / 120 stone / no ore", () => {
    expect(buildingCost("hearthstead", 99)).toEqual({ gold: 150, wood: 180, stone: 120, ore: 0 });
  });

  it("tiered level 3 uses the top band — stone-heavy, ore-free", () => {
    const c = buildingCost("forge", 3);
    expect(c.ore).toBe(0);
    expect(c.stone).toBeGreaterThan(c.wood);
  });
});

describe("build command", () => {
  it("pays the cost and raises the level", () => {
    const { player, events } = build(fresh(), "grange");
    expect(player.buildings.grange).toBe(1);
    expect(player.gold).toBe(5000 - 400);
    expect(player.resources.wood).toBe(1000 - 480);
    expect(events).toContainEqual({ type: "buildComplete", building: "grange", level: 1 });
  });

  it("rejects when resources are short", () => {
    const p = fresh();
    p.resources.wood = 100;
    expect(() => build(p, "grange")).toThrowError(/wood/i);
  });

  it("the starting purse buys 2 civilian builds, not 3 (wood-bound)", () => {
    let p = fresh();
    p = build(p, "grange").player;
    p = build(p, "sawyers_mill").player;
    expect(() => build(p, "masons_quarry")).toThrow(); // 3rd waits on production
  });
});

describe("training & army", () => {
  it("fresh empire's Muster Halls are exactly full — training throws", () => {
    expect(() => trainWarriors(fresh(), 1)).toThrowError(/muster/i);
  });

  it("a new Muster Hall opens 10 slots", () => {
    let p = fresh();
    p = build(p, "muster_hall").player; // 3rd hall → 30 slots, 20 used
    const { player } = trainWarriors(p, 5);
    expect(player.warriors).toBe(5);
    expect(player.idlePeasants).toBe(75);
  });

  it("equipping needs trainer AND forge at the tier level", () => {
    let p = fresh();
    p = build(p, "muster_hall").player;
    p = trainWarriors(p, 5).player;
    expect(() => equipTroops(p, "footman", "light", 5)).toThrowError(/drill_yard/i);
    p.buildings.drill_yard = 1;
    expect(() => equipTroops(p, "footman", "light", 5)).toThrowError(/forge/i);
    p.buildings.forge = 1;
    const { player } = equipTroops(p, "footman", "light", 5);
    expect(player.army.footmen.light).toBe(25);
    expect(player.warriors).toBe(0);
  });

  it("medium tier costs ×2 and needs level 2", () => {
    const p = fresh();
    p.buildings = { ...p.buildings, muster_hall: 5, drill_yard: 2, forge: 2 };
    p.warriors = 1;
    const before = p.gold;
    const { player } = equipTroops(p, "footman", "medium", 1);
    expect(before - player.gold).toBe(200); // 100 × 2
  });

  it("disband strips equipment and returns warriors", () => {
    const p = fresh();
    const { player } = disbandTroops(p, "footman", "light", 10);
    expect(player.army.footmen.light).toBe(10);
    expect(player.warriors).toBe(10);
  });

  it("mercenaries cap at 25% of the regular army", () => {
    const p = fresh();
    p.gold = 100000;
    // regular army = 20 → cap 5
    expect(() => buyMercenaries(p, 6)).toThrowError(/capped/i);
    const { player } = buyMercenaries(p, 5);
    expect(player.army.mercenaries).toBe(5);
    expect(player.gold).toBe(100000 - 5 * 500);
  });

  it("rest costs 5 turns + 0.2 food per troop, +20 stamina", () => {
    const p = fresh();
    p.army.stamina = 60;
    const { player } = restTroops(p);
    expect(player.turnsAvailable).toBe(195);
    expect(player.resources.food).toBe(1000 - 0.2 * 20);
    expect(player.army.stamina).toBe(80);
  });
});

describe("economy commands", () => {
  it("tax rate is clamped to [0, 1]", () => {
    expect(() => setTax(fresh(), 1.5)).toThrow();
    expect(setTax(fresh(), 0.75).player.taxRate).toBe(0.75);
  });

  it("worker assignment respects building slots", () => {
    const p = fresh();
    expect(() => assignWorkers(p, "farmers", 5)).toThrowError(/slots/i); // no Grange
    p.buildings.grange = 1;
    const { player } = assignWorkers(p, "farmers", 20);
    expect(player.workers.farmers).toBe(20);
    expect(() => assignWorkers(player, "farmers", 1)).toThrowError(/slots/i);
  });

  it("banking respects Counting House capacity", () => {
    const p = fresh();
    expect(() => bankGold(p, 1000)).toThrowError(/full/i); // no Counting House
    p.buildings.counting_house = 1; // 20k capacity
    const { player } = bankGold(p, 3000);
    expect(player.bankedGold).toBe(3000);
    expect(player.gold).toBe(2000);
    const back = bankGold(player, -3000).player;
    expect(back.gold).toBe(5000);
  });
});
