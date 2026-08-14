import { describe, expect, it } from "vitest";
import { COUNTED_HP_PER_UNIT, HOUSING_PER_HEARTHSTEAD, TROOPS_PER_MUSTER_HALL } from "../constants";
import { buildingHealth } from "./combat/walls";
import { musterVacancy, trainTroops } from "./commands";
import { buildingCost, repairCost } from "./costs";
import { vacantHousing } from "./dailyReset";
import { newEmpire } from "./newEmpire";
import { civilians, type Player } from "./types";

// Shelling a roof does NOT evict anyone. That is the whole design of making the
// Hearthstead and Muster Hall bombardable: the peasants stay, the garrison
// stays, and what falls is CAPACITY — so tomorrow's settlers find no bed and no
// fresh troops can be raised until the roofs are mended. A slow strangling
// rather than a massacre.

function town(over: Partial<Player> = {}): Player {
  const p = newEmpire({ id: "t", name: "Test", race: "human" });
  p.buildings.hearthstead = 100;
  p.buildings.muster_hall = 50;
  p.gold = 10_000_000;
  p.resources = { wood: 1_000_000, stone: 1_000_000, ore: 1_000_000, food: 1_000_000 };
  p.buildingIntegrity ??= {};
  return Object.assign(p, over);
}

describe("counted structures take damage linearly in the count", () => {
  it("prices health per instance, not per level squared", () => {
    const p = town();
    expect(buildingHealth(p, "hearthstead")).toBe(100 * COUNTED_HP_PER_UNIT.hearthstead);
    expect(buildingHealth(p, "muster_hall")).toBe(50 * COUNTED_HP_PER_UNIT.muster_hall);
  });

  it("scales, so a bigger empire is not a squarer one", () => {
    // The bug this exists to prevent: level() returns the COUNT, so a quadratic
    // would read 240 halls as level 240 — 172,800,000 health, fifty-seven
    // Citadels. Doubling the halls must exactly double the punishment they take.
    const small = town({ buildings: { ...town().buildings, muster_hall: 120 } });
    const big = town({ buildings: { ...town().buildings, muster_hall: 240 } });
    expect(buildingHealth(big, "muster_hall")).toBe(2 * buildingHealth(small, "muster_hall"));
  });

  it("makes a barracks twice the work of a cottage to knock down", () => {
    expect(COUNTED_HP_PER_UNIT.muster_hall).toBe(2 * COUNTED_HP_PER_UNIT.hearthstead);
  });
});

describe("damaged roofs cost capacity, not occupants", () => {
  it("housing capacity falls by the percentage destroyed", () => {
    const p = town();
    const roofs = 100 * HOUSING_PER_HEARTHSTEAD;
    const here = civilians(p);
    expect(vacantHousing(p)).toBe(roofs - here);
    p.buildingIntegrity!.hearthstead = 0.6;
    expect(vacantHousing(p)).toBe(Math.floor(roofs * 0.6) - here);
  });

  it("does NOT scatter the peasants already under a roof", () => {
    const p = town();
    const housed = 100 * HOUSING_PER_HEARTHSTEAD;
    p.idlePeasants = housed;
    p.buildingIntegrity!.hearthstead = 0.5;

    // Half the roofs are gone and the town is over its new capacity. Nobody
    // leaves — the population is untouched — but there is no room for one more.
    expect(p.idlePeasants).toBe(housed);
    expect(vacantHousing(p)).toBe(0);
  });

  it("bunks fall the same way, and the standing army stays whole", () => {
    const p = town();
    const beds = 50 * TROOPS_PER_MUSTER_HALL;
    p.army.footmen.light = beds;
    expect(musterVacancy(p)).toBe(0);

    p.buildingIntegrity!.muster_hall = 0.5;
    // The garrison is still there — every last one of them.
    expect(p.army.footmen.light).toBe(beds);
    // But the halls now shelter fewer than the army standing in them, so there
    // is no room to raise more until they are mended.
    expect(musterVacancy(p)).toBeLessThan(0);
  });

  it("turns away tomorrow's recruits until the roofs are mended", () => {
    const p = town();
    p.idlePeasants = 500;
    p.buildings.drill_yard = 3;
    p.buildingIntegrity!.muster_hall = 0.5;
    p.army.footmen.light = 50 * TROOPS_PER_MUSTER_HALL - 30;

    expect(() => trainTroops(p, "footman", "light", 20)).toThrowError(/Muster Hall/);

    // Mend the halls and the same muster goes through.
    p.buildingIntegrity!.muster_hall = 1;
    expect(() => trainTroops(p, "footman", "light", 20)).not.toThrow();
  });
});

describe("the repair bill follows the count", () => {
  it("mends a quarter of two hundred cottages, not a quarter of one", () => {
    const one = repairCost("hearthstead", 1, 0.75);
    const many = repairCost("hearthstead", 200, 0.75);
    expect(many.gold).toBe(200 * one.gold);
  });

  it("charges per instance even though buildingCost quotes one", () => {
    // buildingCost is flat forever for a counted structure — a tenth cottage is
    // another cottage — so repair MUST reintroduce the count or shelling a
    // two-hundred-hall barracks would be mended for the price of one shed.
    expect(buildingCost("hearthstead", 200)).toEqual(buildingCost("hearthstead", 1));
    expect(repairCost("hearthstead", 200, 0.5).gold).toBeGreaterThan(
      repairCost("hearthstead", 1, 0.5).gold,
    );
  });
});
