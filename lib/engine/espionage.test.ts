import { describe, expect, it } from "vitest";
import { runScoutRecon, runSpyMission } from "./espionageOps";
import { newEmpire } from "./newEmpire";
import { seededRng } from "./rng";
import type { Player } from "./types";

function spymaster(): Player {
  const p = newEmpire({ id: "spy", name: "Spymaster", race: "human" });
  p.buildings.shadow_guild = 6;
  p.army.spies = 20;
  p.research.levels.tradecraft = 3;
  return p;
}

function victim(lodge: number, scouts: number): Player {
  const p = newEmpire({ id: "v", name: "Victim", race: "human" });
  p.buildings.rangers_lodge = lodge;
  p.army.scouts = scouts;
  p.army.siegeGear = { ropes: 0, ladders: 0, rams: 2, ballistae: 3, trebuchets: 3 };
  return p;
}

describe("spy missions", () => {
  it("a lodge-4 empire is blind to level-3 ops — zero catch risk", () => {
    const res = runSpyMission(spymaster(), victim(4, 30), "sabotage_engines", 8, 1000, seededRng(1));
    expect(res.catchChance).toBe(0);
    expect(res.caught).toBe(false);
  });

  it("lodge 5 can see level-3 ops (the worked example: ~28% catch)", () => {
    const v = victim(5, 30);
    v.research.levels.pathfinding = 2;
    const res = runSpyMission(spymaster(), v, "sabotage_engines", 8, 1000, seededRng(2));
    // 8 × 0.5% × 5 × 1 × 1.4 = 28%, ±20% luck
    expect(res.catchChance).toBeGreaterThan(0.2);
    expect(res.catchChance).toBeLessThan(0.36);
  });

  it("no scouts home = no catches, regardless of lodge", () => {
    const res = runSpyMission(spymaster(), victim(10, 0), "sabotage_engines", 8, 1000, seededRng(3));
    expect(res.catchChance).toBe(0);
  });

  it("caught spies are all executed and the attacker is named", () => {
    const v = victim(10, 100);
    v.research.levels.pathfinding = 5;
    // 20 spies vs lodge 10: ~90% — find a seed that catches
    const res = runSpyMission(spymaster(), v, "sabotage_engines", 20, 1000, seededRng(11));
    expect(res.caught).toBe(true);
    expect(res.attacker.army.spies).toBe(0); // massacre
    expect(res.defender.recentAttackers.some((a) => a.playerId === "spy")).toBe(true);
  });

  it("sabotage wrecks gear, heaviest engines first", () => {
    const res = runSpyMission(spymaster(), victim(2, 5), "sabotage_engines", 8, 1000, seededRng(4));
    expect(res.caught).toBe(false);
    const gear = res.defender.army.siegeGear;
    // ≥ 4 pieces × guild/tradecraft multipliers — trebs and ballistae go first
    expect(gear.trebuchets).toBe(0);
    expect(gear.trebuchets + gear.ballistae + gear.rams).toBeLessThan(8);
  });

  it("tradecraft gates the op list", () => {
    const weak = spymaster();
    weak.research.levels.tradecraft = 1;
    expect(() =>
      runSpyMission(weak, victim(1, 1), "torch_stores", 5, 1000, seededRng(1)),
    ).toThrowError(/Tradecraft/);
  });

  it("incite unrest sets the 24h window (refreshes, never stacks)", () => {
    const s = spymaster();
    s.research.levels.tradecraft = 5;
    const res = runSpyMission(s, victim(1, 1), "incite_unrest", 10, 1000, seededRng(6));
    expect(res.caught).toBe(false);
    expect(res.defender.unrestUntilTick).toBe(1000 + 144);
  });
});

describe("scout recon", () => {
  it("costs 2 turns and returns a fuzzy report", () => {
    const s = newEmpire({ id: "s", name: "Scout", race: "human" });
    s.army.scouts = 5;
    const target = victim(1, 0);
    target.army.footmen.light = 100;
    const { attacker, detail } = runScoutRecon(s, target, seededRng(9));
    expect(attacker.turnsAvailable).toBe(198);
    expect(detail).toMatch(/troops under arms/);
  });
});
