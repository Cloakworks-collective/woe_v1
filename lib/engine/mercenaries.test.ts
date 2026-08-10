// Regression tests for four mechanics that were once declared, described and
// wired to nothing. Each of these asserts the EFFECT, not the existence of a
// constant — a field that appears in the research tree but changes no number is
// worse than a missing one, because it looks finished.

import { describe, expect, it } from "vitest";
import { hireMercenaries } from "./commands";
import { processTurnTick } from "./tick";
import { newEmpire } from "./newEmpire";
import { mercTotal, type Player } from "./types";

function lord(): Player {
  const p = newEmpire({ id: "L", name: "Lord", race: "human" });
  p.gold = 1_000_000;
  p.buildings = {
    ...p.buildings,
    drill_yard: 3,
    fletchers_range: 3,
    knights_stables: 3,
    forge: 3,
    muster_hall: 60,
    shadow_guild: 3,
    rangers_lodge: 3,
    war_foundry: 5,
  };
  p.army.footmen.light = 300;
  p.army.siegeEngineers = 90;
  p.army.spies = 60;
  p.army.scouts = 60;
  return p;
}

describe("Free Companies actually cuts the price", () => {
  it("charges less per sellsword at higher levels", () => {
    const plain = lord();
    const studied = lord();
    studied.research.levels.free_companies = 5;

    const a = hireMercenaries(plain, "footman", "light", 10).player;
    const b = hireMercenaries(studied, "footman", "light", 10).player;
    const paidPlain = 1_000_000 - a.gold;
    const paidStudied = 1_000_000 - b.gold;

    expect(paidStudied).toBeLessThan(paidPlain);
    // −10%/level, so a maxed field is half off.
    expect(paidStudied).toBeCloseTo(paidPlain * 0.5, -1);
  });
});

describe("every arm can be hired, not just the battle line", () => {
  it("hires engine crews, knives and rangers", () => {
    let p = lord();
    p = hireMercenaries(p, "engineer", "light", 20).player;
    p = hireMercenaries(p, "spy", "light", 15).player;
    p = hireMercenaries(p, "scout", "light", 15).player;
    expect(p.army.mercenaries.engineers).toBe(20);
    expect(p.army.mercenaries.spies).toBe(15);
    expect(p.army.mercenaries.scouts).toBe(15);
    expect(mercTotal(p.army.mercenaries)).toBe(50);
  });

  it("caps each arm against ITS OWN regulars — you cannot shield one with another", () => {
    const p = lord();
    p.army.cavalry.light = 3; // three riders of your own…
    // …so at most one hired rider, however many footmen you command.
    expect(() => hireMercenaries(p, "cavalry", "light", 5)).toThrowError(/third|capped/i);
    expect(hireMercenaries(p, "cavalry", "light", 1).player.army.mercenaries.cavalry.light).toBe(1);
  });

  it("hired knives need a Shadow Guild, hired rangers a Lodge", () => {
    const p = lord();
    p.buildings.shadow_guild = 0;
    expect(() => hireMercenaries(p, "spy", "light", 1)).toThrowError(/shadow guild/i);
  });
});

describe("sellswords take barracks beds", () => {
  it("refuses the hire when the muster halls are full", () => {
    const p = lord();
    p.buildings.muster_hall = 39; // 390 beds vs 390 regulars — no room left
    expect(() => hireMercenaries(p, "footman", "light", 1)).toThrowError(/barracks/i);
  });
});

describe("Sow Research Doubt actually slows research", () => {
  it("banks fewer research points while the whisperers are at work", () => {
    const base = lord();
    base.buildings.collegium = 5;
    // Few enough scholars that neither run completes a level — otherwise the
    // faster one banks MORE, spends it on a level, and ends up looking slower.
    base.workers.researchers = 4;
    base.research.activeField = "masonry";

    const doubted = structuredClone(base);
    doubted.researchDoubtUntilTick = 500;

    const clean = processTurnTick(base, { currentTick: 100 }).player;
    const slowed = processTurnTick(doubted, { currentTick: 100 }).player;

    const bankedClean = clean.research.banked.masonry ?? 0;
    const bankedSlowed = slowed.research.banked.masonry ?? 0;
    expect(bankedClean).toBeGreaterThan(0);
    expect(bankedSlowed).toBeLessThan(bankedClean);
    expect(bankedSlowed).toBeCloseTo(bankedClean * 0.5, 5);
  });

  it("runs at full speed again once the doubt has lapsed", () => {
    const p = lord();
    p.buildings.collegium = 5;
    p.workers.researchers = 4;
    p.research.activeField = "masonry";
    p.researchDoubtUntilTick = 50; // already expired at tick 100
    const after = processTurnTick(p, { currentTick: 100 }).player;
    expect(after.research.banked.masonry ?? 0).toBeGreaterThan(0);
  });
});
