// Spending from the WHOLE purse — loose first, then the vault.
//
// The bug this pins: `pay` used to read the loose piles alone, so anything
// banked was invisible to every build, muster and repair. Quietly fatal for a
// Royal Charter holder, whose Steward sweeps loose goods into store every tick:
// they would withdraw by hand and the Steward would put it straight back, so a
// granary holding millions could not buy a single Hearthstead.

import { describe, expect, it } from "vitest";
import { build, hireMercenaries, trainSpies } from "./commands";
import { newEmpire } from "./newEmpire";
import { bankedRes, purseGold, purseRes, spendGold, spendRes, type Player } from "./types";

function fresh(): Player {
  const p = newEmpire({ id: "t", name: "T", race: "human" });
  p.gold = 0;
  p.bankedGold = 0;
  p.resources = { food: 0, wood: 0, stone: 0, ore: 0 };
  p.bankedResources = { food: 0, wood: 0, stone: 0, ore: 0 };
  return p;
}

describe("the purse reads loose + vaulted", () => {
  it("counts both halves", () => {
    const p = fresh();
    p.gold = 100;
    p.bankedGold = 400;
    p.resources.wood = 10;
    p.bankedResources = { food: 0, wood: 90, stone: 0, ore: 0 };
    expect(purseGold(p)).toBe(500);
    expect(purseRes(p, "wood")).toBe(100);
  });
});

describe("spending takes LOOSE first", () => {
  it("leaves the vault untouched while loose covers it", () => {
    const p = fresh();
    p.gold = 100;
    p.bankedGold = 900;
    expect(spendGold(p, 60)).toBe(true);
    expect(p.gold).toBe(40);
    expect(p.bankedGold).toBe(900);
  });

  it("dips into the vault only for the remainder", () => {
    const p = fresh();
    p.gold = 100;
    p.bankedGold = 900;
    expect(spendGold(p, 250)).toBe(true);
    expect(p.gold).toBe(0);
    expect(p.bankedGold).toBe(750);
  });

  it("does the same for goods", () => {
    const p = fresh();
    p.resources.ore = 30;
    p.bankedResources = { food: 0, wood: 0, stone: 0, ore: 500 };
    expect(spendRes(p, "ore", 80)).toBe(true);
    expect(p.resources.ore).toBe(0);
    expect(bankedRes(p).ore).toBe(450);
  });

  it("refuses and changes NOTHING when the whole purse is short", () => {
    const p = fresh();
    p.gold = 10;
    p.bankedGold = 5;
    expect(spendGold(p, 100)).toBe(false);
    expect(p.gold).toBe(10);
    expect(p.bankedGold).toBe(5);
  });
});

describe("purchases can reach the vault", () => {
  it("builds with vaulted goods when nothing is loose", () => {
    const p = fresh();
    p.gold = 0;
    p.bankedGold = 50_000_000;
    p.bankedResources = { food: 0, wood: 5_000_000, stone: 5_000_000, ore: 5_000_000 };
    const before = p.buildings.hearthstead ?? 0;
    const out = build(p, "hearthstead", 1).player;
    expect(out.buildings.hearthstead).toBe(before + 1);
    expect(out.bankedGold).toBeLessThan(50_000_000); // paid from the vault
  });

  it("musters with vaulted coin", () => {
    const p = fresh();
    p.bankedGold = 1_000_000;
    p.buildings.shadow_guild = 1;
    // Specialists are capped against the REGULAR LINE now, so the muster has to
    // exist before the shadow service can. This case is about the purse
    // reaching the vault; the cap is not what it is testing.
    p.army.footmen.light = 200;
    const out = trainSpies(p, 2).player;
    expect(out.army.spies).toBe(2);
    expect(out.bankedGold).toBeLessThan(1_000_000);
  });

  it("hires sellswords with vaulted coin", () => {
    const p = fresh();
    p.bankedGold = 10_000_000;
    p.buildings.drill_yard = 1;
    p.buildings.muster_hall = 50;
    p.army.footmen.light = 300; // regulars to command them
    const out = hireMercenaries(p, "footman", "light", 5).player;
    expect(out.army.mercenaries.footmen.light).toBe(5);
    expect(out.bankedGold).toBeLessThan(10_000_000);
  });

  it("still refuses when loose AND vault together fall short", () => {
    const p = fresh();
    p.gold = 1;
    p.bankedGold = 1;
    expect(() => build(p, "hearthstead", 1)).toThrow();
  });
});
