import { describe, expect, it } from "vitest";
import { buildClanBuilding, newClan } from "./clanOps";
import { build, repairBuilding, repairWalls } from "./commands";
import { newEmpire } from "./newEmpire";
import { level, type Player } from "./types";

function rich(): Player {
  const p = newEmpire({ id: "p1", name: "P", race: "human" });
  p.gold = 100_000_000;
  p.resources.wood = 10_000_000;
  p.resources.stone = 10_000_000;
  p.resources.ore = 10_000_000;
  p.resources.food = 10_000_000;
  return p;
}

describe("a cracked work must be mended before it is raised", () => {
  it("blocks the upgrade while damaged, and allows it once repaired", () => {
    const p = rich();
    p.buildings.granary = 3;
    p.buildingIntegrity = { granary: 0.6 };

    expect(() => build(p, "granary")).toThrowError(/Repair it to full/);

    const mended = repairBuilding(p, "granary").player;
    const raised = build(mended, "granary").player;
    expect(level(raised, "granary")).toBe(4);
  });

  it("applies to the Walls, whose integrity lives on its own field", () => {
    const p = rich();
    p.buildings.walls = 4;
    p.wallIntegrity = 0.5;

    expect(() => build(p, "walls")).toThrowError(/Repair it to full/);
    expect(level(build(repairWalls(p).player, "walls").player, "walls")).toBe(5);
  });

  it("never blocks founding a building that does not exist yet", () => {
    const p = rich();
    // Nothing built, so nothing can be cracked — founding must stay reachable
    // even with a stale integrity entry lying around.
    p.buildings.granary = 0;
    p.buildingIntegrity = { granary: 0.5 };
    expect(level(build(p, "granary").player, "granary")).toBe(1);
  });

  it("leaves whole buildings alone", () => {
    const p = rich();
    p.buildings.grange = 2;
    p.buildingIntegrity = { granary: 0.5 }; // a DIFFERENT building is cracked
    expect(level(build(p, "grange").player, "grange")).toBe(3);
  });

  it("does not stop counted buildings, which cannot be bombarded", () => {
    const p = rich();
    p.buildings.hearthstead = 5;
    expect(level(build(p, "hearthstead").player, "hearthstead")).toBe(6);
  });
});

describe("clan works follow the same rule", () => {
  it("a cracked clan work cannot be raised until mended", () => {
    const leader = newEmpire({ id: "lead", name: "L", race: "human" });
    const clan = newClan("c1", "Iron Pact", leader);
    clan.buildings.storageLevel = 2;
    clan.storage = { gold: 9_000_000, food: 9_000_000, wood: 9_000_000, stone: 9_000_000, ore: 9_000_000 };

    clan.buildings.integrity.storage = 0.7;
    expect(() => buildClanBuilding(clan, leader, "storage")).toThrowError(/Repair it to full/);

    clan.buildings.integrity.storage = 1;
    expect(buildClanBuilding(clan, leader, "storage").clan.buildings.storageLevel).toBe(3);
  });
});
