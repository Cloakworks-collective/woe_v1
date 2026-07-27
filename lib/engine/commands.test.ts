import { describe, expect, it } from "vitest";
import {
  assignWorkers,
  bankGold,
  bankResource,
  build,
  dischargeTroops,
  hireMercenaries,
  restTroops,
  setResearch,
  setTax,
  trainTroops,
} from "./commands";
import { buildingCost } from "./costs";
import { newEmpire } from "./newEmpire";
import { mercTotal, normalizePlayer, type Player } from "./types";

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
    expect(() => trainTroops(fresh(), "footman", "light", 1)).toThrowError(/muster/i);
  });

  it("training goes peasant → footman directly (no warrior step); needs trainer AND forge", () => {
    let p = fresh();
    p = build(p, "muster_hall").player; // 3rd hall → 30 slots, 20 used → 10 free
    expect(() => trainTroops(p, "footman", "light", 5)).toThrowError(/drill_yard/i);
    p.buildings.drill_yard = 1;
    expect(() => trainTroops(p, "footman", "light", 5)).toThrowError(/forge/i);
    p.buildings.forge = 1;
    const { player } = trainTroops(p, "footman", "light", 5);
    expect(player.army.footmen.light).toBe(25); // 20 starter + 5
    expect(player.idlePeasants).toBe(75); // peasants spent directly
  });

  it("light footman folds the muster levy into its gold cost (150g)", () => {
    const p = fresh();
    p.buildings = { ...p.buildings, muster_hall: 5, drill_yard: 1, forge: 1 };
    const before = p.gold;
    const { player } = trainTroops(p, "footman", "light", 1);
    expect(before - player.gold).toBe(150); // 50 levy + 100 kit
  });

  it("medium tier costs ×2 and needs level 2", () => {
    const p = fresh();
    p.buildings = { ...p.buildings, muster_hall: 5, drill_yard: 2, forge: 2 };
    const before = p.gold;
    const { player } = trainTroops(p, "footman", "medium", 1);
    expect(before - player.gold).toBe(300); // 150 × 2
  });

  it("discharge sends troops home directly (gear lost)", () => {
    const p = fresh();
    const { player } = dischargeTroops(p, "footman", "light", 10);
    expect(player.army.footmen.light).toBe(10);
    expect(player.idlePeasants).toBe(90); // straight back to civilian life
  });

  it("mercenaries are typed, building-gated, and cap at 25% of the regular army", () => {
    const p = fresh();
    p.gold = 100000;
    p.buildings = { ...p.buildings, drill_yard: 1, forge: 1 };
    // regular army = 20 → cap 5
    expect(() => hireMercenaries(p, "footman", "light", 6)).toThrowError(/capped/i);
    const { player } = hireMercenaries(p, "footman", "light", 5);
    expect(player.army.mercenaries.footmen.light).toBe(5);
    expect(player.gold).toBe(100000 - 5 * 500); // 500 × race × light tier
  });

  it("hiring a merc tier needs the matching trainer + Forge", () => {
    const p = fresh();
    p.gold = 100000;
    expect(() => hireMercenaries(p, "cavalry", "heavy", 1)).toThrowError(/knights_stables/i);
  });

  it("normalizePlayer migrates legacy saves (flat mercs, warrior pool)", () => {
    const p = fresh() as Player & { warriors?: number };
    p.warriors = 7; // legacy unequipped pool
    (p.army as unknown as { mercenaries: number }).mercenaries = 4; // legacy flat count
    normalizePlayer(p);
    expect(p.warriors).toBeUndefined(); // warriors return to the idle pool
    expect(p.idlePeasants).toBe(80 + 7);
    expect(p.army.mercenaries.footmen.light).toBe(4); // flat mercs → light footmen
    expect(mercTotal(p.army.mercenaries)).toBe(4);
    // idempotent — a second pass is a no-op
    normalizePlayer(p);
    expect(mercTotal(p.army.mercenaries)).toBe(4);
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

describe("research", () => {
  it("switching to a new field halves the current field's banked progress", () => {
    const p = fresh();
    p.research.activeField = "art_of_war";
    p.research.banked.art_of_war = 400; // 40% toward a 1,000 next level, say
    const after = setResearch(p, "shieldcraft").player;
    expect(after.research.activeField).toBe("shieldcraft");
    expect(after.research.banked.art_of_war).toBe(200); // 40% → 20%
    expect(after.research.banked.shieldcraft ?? 0).toBe(0); // the new field is untouched
  });

  it("re-selecting the same field costs no progress", () => {
    const p = fresh();
    p.research.activeField = "art_of_war";
    p.research.banked.art_of_war = 400;
    const after = setResearch(p, "art_of_war").player;
    expect(after.research.banked.art_of_war).toBe(400);
  });
});

describe("economy commands", () => {
  it("tax rate is clamped to [0, 1]", () => {
    expect(() => setTax(fresh(), 1.5)).toThrow();
    expect(setTax(fresh(), 0.75).player.taxRate).toBe(0.75);
  });

  it("all workers are uncapped — you only need the building (no slot limits)", () => {
    const p = fresh();
    p.idlePeasants = 500;
    expect(() => assignWorkers(p, "farmers", 5)).toThrowError(/build the grange/i); // no Grange
    p.buildings.grange = 1;
    const farmed = assignWorkers(p, "farmers", 200).player; // no slot cap — 200 > any slot count
    expect(farmed.workers.farmers).toBe(200);
    // Merchants and researchers are uncapped too — just need their hall.
    farmed.buildings.market_square = 1;
    const merch = assignWorkers(farmed, "merchants", 100).player;
    expect(merch.workers.merchants).toBe(100);
  });

  it("banking respects Counting House capacity", () => {
    const p = fresh(); // starts with Counting House 1 → 20k capacity
    p.bankedGold = 19500;
    expect(() => bankGold(p, 1000)).toThrowError(/full/i); // would breach 20k
    p.bankedGold = 0;
    const { player } = bankGold(p, 3000);
    expect(player.bankedGold).toBe(3000);
    expect(player.gold).toBe(2000);
    const back = bankGold(player, -3000).player;
    expect(back.gold).toBe(5000);
  });

  it("vaults and withdraws goods within the store's capacity", () => {
    const p = fresh(); // granary 1 → 20k food capacity
    const { player } = bankResource(p, "food", 800);
    expect(player.resources.food).toBe(200);
    expect(player.bankedResources!.food).toBe(800);
    const back = bankResource(player, "food", -300).player;
    expect(back.resources.food).toBe(500);
    expect(back.bankedResources!.food).toBe(500);
    expect(() => bankResource(back, "food", -600)).toThrowError(/vaulted/i);
    const full = fresh();
    full.resources.food = 1000;
    full.bankedResources = { food: 19900, wood: 0, stone: 0, ore: 0 };
    expect(() => bankResource(full, "food", 200)).toThrowError(/full/i);
  });
});
