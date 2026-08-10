import { describe, expect, it } from "vitest";
import { ARMY_FLOORS, LOOT } from "../constants";
import { build } from "./commands";
import { lootKind, lootShare } from "./combat/loot";
import { newEmpire } from "./newEmpire";
import { regularTroops } from "./types";

const nearOne = () => 0.999999999;
const zero = () => 0;

describe("clan war — what changes and what does not", () => {
  it("raid and castle take EVERYTHING unbanked; nothing is rolled", () => {
    for (const mode of ["raid", "siege"] as const) {
      expect(lootShare(nearOne, mode, false, 1, 1, true)).toBe(LOOT.WAR_SHARE);
      expect(lootShare(zero, mode, false, 1, 1, true)).toBe(1);
      // Even a yield against a minnow — war removes the band entirely.
      expect(lootShare(zero, mode, true, 1, 0.1, true)).toBe(1);
    }
  });

  it("bombard and revenge STILL carry nothing home, war or not", () => {
    // War doubles their damage, not their nature. If they looted, bombard would
    // stop being a setup move and revenge would become a way to farm someone.
    expect(lootKind("bombard")).toBe("none");
    expect(lootKind("revenge")).toBe("none");
    expect(lootKind("raid")).toBe("goods");
    expect(lootKind("siege")).toBe("gold"); // "siege" is the castle attack
  });

  it("peacetime shares are 15% lighter than the raw bands", () => {
    // Ceiling was 0.70 × 1.25 = 87.5%; the 15% relief takes it to 74.375%.
    const ceiling = lootShare(nearOne, "raid", false, 1, 2);
    expect(ceiling).toBeLessThan(LOOT.RAID_WIN.max * LOOT.BIG_TARGET_BONUS);
    expect(ceiling).toBeCloseTo(0.7 * 1.25 * LOOT.PEACE_MULTIPLIER, 3);
    // The floor moves with it: 50% → 45% at even weight.
    expect(lootShare(zero, "raid", false, 1, 1)).toBeCloseTo(0.5 * LOOT.PEACE_MULTIPLIER, 5);
  });

  it("war is strictly worse for the victim than any peacetime roll", () => {
    const worstPeace = lootShare(nearOne, "raid", false, 1, 2); // biggest peacetime bite
    expect(lootShare(zero, "raid", false, 1, 0.1, true)).toBeGreaterThan(worstPeace);
  });
});

describe("victory floors — regulars, not gold and not people", () => {
  it("counts the battle line only: no mercenaries, no engineers", () => {
    const p = newEmpire({ id: "x", name: "x", race: "human" });
    p.army.footmen = { light: 100, medium: 50, heavy: 25 };
    p.army.archers = { light: 40, medium: 0, heavy: 0 };
    p.army.cavalry = { light: 10, medium: 0, heavy: 0 };
    p.army.siegeEngineers = 500;
    p.army.mercenaries.footmen = { light: 9999, medium: 0, heavy: 0 };
    expect(regularTroops(p)).toBe(225);
  });

  it("an empire cannot buy its way over the floor with sellswords", () => {
    const p = newEmpire({ id: "x", name: "x", race: "human" });
    p.army.mercenaries.footmen = { light: ARMY_FLOORS.INDIVIDUAL * 10, medium: 0, heavy: 0 };
    expect(regularTroops(p)).toBeLessThan(ARMY_FLOORS.INDIVIDUAL);
  });
});

describe("batch building", () => {
  it("charges each level at its own price — the batch is no discount", () => {
    const one = newEmpire({ id: "a", name: "a", race: "human" });
    one.gold = 10_000_000;
    one.resources = { food: 9e6, wood: 9e6, stone: 9e6, ore: 9e6 };
    const batched = build(one, "hearthstead", 5).player;

    let stepwise = one;
    for (let i = 0; i < 5; i++) stepwise = build(stepwise, "hearthstead").player;

    expect(batched.buildings.hearthstead).toBe(stepwise.buildings.hearthstead);
    expect(batched.gold).toBe(stepwise.gold);
    expect(batched.resources).toEqual(stepwise.resources);
  });

  it("buys what the purse allows and stops, rather than failing the lot", () => {
    const p = newEmpire({ id: "b", name: "b", race: "human" });
    const before = p.buildings.hearthstead ?? 0;
    const r = build(p, "hearthstead", 50); // far beyond a founding treasury
    expect(r.events.length).toBeGreaterThan(0);
    expect(r.events.length).toBeLessThan(50);
    expect(r.player.buildings.hearthstead).toBe(before + r.events.length);
  });

  it("still errors when you cannot afford even the first", () => {
    const p = newEmpire({ id: "c", name: "c", race: "human" });
    p.gold = 0;
    p.resources = { food: 0, wood: 0, stone: 0, ore: 0 };
    expect(() => build(p, "hearthstead", 10)).toThrowError();
  });
});
