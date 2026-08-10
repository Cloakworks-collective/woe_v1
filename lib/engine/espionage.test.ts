import { describe, expect, it } from "vitest";
import { covertTurnCost, runCovertOp } from "./espionageOps";
import { covertOp } from "../constants";
import { newEmpire } from "./newEmpire";
import { seededRng } from "./rng";
import { emptySiegeGear, type Player } from "./types";

function spymaster(spies = 20): Player {
  const p = newEmpire({ id: "spy", name: "Spymaster", race: "human" });
  p.buildings.shadow_guild = 6;
  p.army.spies = spies;
  p.research.levels.tradecraft = 5;
  p.spyTurnsAvailable = 200;
  return p;
}

function victim(lodge: number, scouts: number): Player {
  const p = newEmpire({ id: "v", name: "Victim", race: "human" });
  p.buildings.rangers_lodge = lodge;
  p.army.scouts = scouts;
  p.army.siegeGear = { ...emptySiegeGear(), rams: 2, ballistae: 3, trebuchets: 3 };
  return p;
}

describe("the spy turn economy", () => {
  it("cost is derived from the agents sent — you cannot under-fund a mission", () => {
    const op = covertOp("steal_research")!;
    expect(covertTurnCost(op, 100)).toBe(100); // 1.0 turns/agent, the dearest op
    expect(covertTurnCost(covertOp("survey_coffers")!, 100)).toBe(10);
  });

  it("refuses a mission the covert budget cannot pay for", () => {
    const p = spymaster(200);
    p.spyTurnsAvailable = 10;
    expect(() => runCovertOp(p, victim(0, 0), "steal_research", 200, 1000, seededRng(1))).toThrow(
      /spy turns/i,
    );
  });

  it("spends from the same pool for both arms", () => {
    const scoutLord = spymaster();
    scoutLord.army.scouts = 20;
    scoutLord.research.levels.pathfinding = 5;
    const r = runCovertOp(scoutLord, victim(0, 0), "map_army", 10, 1000, seededRng(2));
    expect(r.turnsSpent).toBeGreaterThan(0);
    expect(r.attacker.spyTurnsAvailable).toBe(200 - r.turnsSpent);
  });
});

describe("interception", () => {
  it("a realm with no rangers is robbed scot-free", () => {
    const r = runCovertOp(spymaster(), victim(10, 0), "sabotage_siege", 8, 1000, seededRng(3));
    expect(r.intercepted).toBe(0);
    expect(r.exposed).toBe(false);
  });

  it("rangers stop agents, and any capture names the hand behind it", () => {
    const v = victim(10, 400);
    v.research.levels.pathfinding = 5;
    v.army.scoutExperience = 100;
    const r = runCovertOp(spymaster(), v, "assassinate_scouts", 20, 1000, seededRng(7));
    expect(r.intercepted).toBeGreaterThan(0);
    expect(r.exposed).toBe(true);
    expect(r.defender.recentAttackers.some((a) => a.playerId === "spy")).toBe(true);
  });

  it("a clean run stays anonymous — that is the whole prize", () => {
    const r = runCovertOp(spymaster(), victim(1, 0), "torch_stores", 8, 1000, seededRng(4));
    expect(r.exposed).toBe(false);
    expect(r.detail).not.toContain("Spymaster");
  });
});

describe("effects scale with who got through", () => {
  it("sabotage wrecks engines", () => {
    const r = runCovertOp(spymaster(), victim(0, 0), "sabotage_siege", 8, 1000, seededRng(5));
    expect(r.gearDestroyed).toBeGreaterThan(0);
  });

  it("undermining is a nuisance, never a substitute for a trebuchet", () => {
    const v = victim(0, 0);
    v.buildings.walls = 10;
    const r = runCovertOp(spymaster(200), v, "sabotage_walls", 200, 1000, seededRng(6));
    // Capped hard on purpose: if spies could breach walls the whole siege
    // economy would be pointless.
    expect(1 - r.defender.wallIntegrity).toBeLessThanOrEqual(0.1001);
  });

  it("stealing research COPIES a level — the victim keeps theirs", () => {
    const v = victim(0, 0);
    v.research.levels.masonry = 4;
    const r = runCovertOp(spymaster(), v, "steal_research", 10, 1000, seededRng(8));
    expect(r.attacker.research.levels.masonry).toBe(1);
    expect(r.defender.research.levels.masonry).toBe(4); // untouched
    expect(r.attacker.stolenResearchLevels).toBe(1);
  });

  it("theft is capped per era so it can supplement work, never replace it", () => {
    const v = victim(0, 0);
    v.research.levels.masonry = 5;
    const p = spymaster();
    p.stolenResearchLevels = 5;
    const r = runCovertOp(p, v, "steal_research", 10, 1000, seededRng(9));
    expect(r.attacker.research.levels.masonry ?? 0).toBe(0);
  });

  it("assassination kills rangers and cascades their hired ones out of service", () => {
    const v = victim(0, 0);
    v.army.scouts = 90;
    v.army.mercenaries.scouts = 30; // exactly at the 1:3 cap
    v.army.scoutExperience = 80;
    // Enough knives that some get through the watch they are there to kill.
    const r = runCovertOp(spymaster(300), v, "assassinate_scouts", 250, 1000, seededRng(10));
    expect(r.defender.army.scouts).toBeLessThan(90);
    // The cascade: fewer regulars means fewer sellswords can be commanded.
    expect(r.defender.army.mercenaries.scouts).toBeLessThanOrEqual(
      Math.floor(r.defender.army.scouts / 3),
    );
    expect(r.defender.army.scoutExperience).toBeLessThan(80);
  });
});

describe("counter-operations", () => {
  it("scouts quell unrest in their own streets", () => {
    const p = spymaster();
    p.army.scouts = 10;
    p.research.levels.pathfinding = 5;
    p.unrestUntilTick = 2000;
    const r = runCovertOp(p, p, "quell_unrest", 5, 1000, seededRng(11));
    expect(r.attacker.unrestUntilTick).toBeUndefined();
  });

  it("and root out research doubt — the reason a scholar keeps rangers", () => {
    const p = spymaster();
    p.army.scouts = 10;
    p.research.levels.pathfinding = 5;
    p.researchDoubtUntilTick = 2000;
    const r = runCovertOp(p, p, "quell_doubt", 5, 1000, seededRng(12));
    expect(r.attacker.researchDoubtUntilTick).toBeUndefined();
  });
});
