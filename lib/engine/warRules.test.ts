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
      // Size scaling is gone too — war does not care that they were smaller.
      expect(lootShare(zero, mode, false, 1, 0.1, true)).toBe(1);
    }
  });

  it("surrender halves the bill in war as well as peace", () => {
    // This is the fix for a real hole: lootShare used to return WAR_SHARE before
    // it ever looked at `yielded`, so laying down arms to a clan at war cost
    // exactly as much as being cut apart — and there was no reason to do it.
    for (const mode of ["raid", "siege"] as const) {
      expect(lootShare(zero, mode, true, 1, 1, true)).toBe(LOOT.WAR_SHARE * LOOT.YIELD_FACTOR);
      const fought = lootShare(zero, mode, false, 1, 1);
      const surrendered = lootShare(zero, mode, true, 1, 1);
      expect(surrendered).toBeCloseTo(fought * LOOT.YIELD_FACTOR, 6);
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

  it("no peacetime blow, however lucky, gets past the ceiling", () => {
    // Best possible peacetime case: top of the band AND the big-target bonus.
    // Used to reach 0.70 × 1.25 × 0.85 = 74.4%, which was war money for a
    // peacetime raid and left war with nothing to escalate to.
    const best = lootShare(nearOne, "raid", false, 1, 2);
    expect(best).toBe(LOOT.PEACE_CEILING);
    // And a peacetime surrender is half of that.
    expect(lootShare(nearOne, "raid", true, 1, 2)).toBe(LOOT.PEACE_CEILING * LOOT.YIELD_FACTOR);
    // The floor still moves with the relief: 50% → 42.5% at even weight.
    expect(lootShare(zero, "raid", false, 1, 1)).toBeCloseTo(0.5 * LOOT.PEACE_MULTIPLIER, 5);
  });

  it("war is strictly worse for the victim than any peacetime roll", () => {
    const worstPeace = lootShare(nearOne, "raid", false, 1, 2); // biggest peacetime bite
    expect(lootShare(zero, "raid", false, 1, 0.1, true)).toBeGreaterThan(worstPeace);
    // …and even SURRENDERING at war costs as much as the worst peacetime defeat.
    expect(lootShare(zero, "raid", true, 1, 1, true)).toBeGreaterThanOrEqual(worstPeace);
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
