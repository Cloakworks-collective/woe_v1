import { describe, expect, it } from "vitest";
import { covertHistory, covertTurnCost, recordCovert, runCovertOp } from "./espionageOps";
import { covertOp } from "../constants";
import { newEmpire } from "./newEmpire";
import { COVERT_LOG_DAYS, MERCENARIES, TURNS_PER_DAY } from "../constants";
import { seededRng } from "./rng";
import { emptySiegeGear, type Player } from "./types";

/**
 * BUILDINGS are what unlock an operation now — the Shadow Guild for spies, the
 * Ranger's Lodge for scouts — so this helper raises both. Tradecraft and
 * Pathfinding are still set where they matter, but they only ever multiply the
 * agents' power; they no longer decide what may be attempted at all.
 */
function spymaster(spies = 20): Player {
  const p = newEmpire({ id: "spy", name: "Spymaster", race: "human" });
  p.buildings.shadow_guild = 6;
  // Some of these cases run SCOUT ops from the spymaster's own side.
  p.buildings.rangers_lodge = 6;
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

describe("the intelligence log", () => {
  const rec = (tick: number, arm: "spy" | "scout" = "scout") => ({
    id: `r${tick}-${arm}`,
    tick,
    arm,
    opId: "survey_coffers",
    opName: "Survey the Coffers",
    targetId: "v",
    targetName: "Victim",
    sent: 5,
    intercepted: 0,
    exposed: false,
    detail: "gold 1,000",
    turnsSpent: 1,
  });

  it("files newest-first and drops anything past the window", () => {
    const p = spymaster();
    const now = 10 * TURNS_PER_DAY;
    recordCovert(p, rec(now - COVERT_LOG_DAYS * TURNS_PER_DAY - 1), now); // one tick too old
    recordCovert(p, rec(now - TURNS_PER_DAY), now); // yesterday
    recordCovert(p, rec(now), now); // just now
    expect(p.covertLog!.map((r) => r.tick)).toEqual([now, now - TURNS_PER_DAY]);
  });

  it("ages out on READ too, so a log nobody has written to still expires", () => {
    const p = spymaster();
    recordCovert(p, rec(100), 100);
    expect(covertHistory(p, 100)).toHaveLength(1);
    // Five days later, with no further operations run.
    expect(covertHistory(p, 100 + COVERT_LOG_DAYS * TURNS_PER_DAY + 1)).toHaveLength(0);
  });

  it("keeps the detail VERBATIM — intelligence is a snapshot, not a live read", () => {
    const p = spymaster();
    recordCovert(p, { ...rec(50), detail: "Victim: 1,000 gold" }, 50);
    // The world moves on; the filed report does not.
    expect(p.covertLog![0].detail).toBe("Victim: 1,000 gold");
  });
});

describe("what unlocks an operation", () => {
  it("the BUILDING gates it, and research does not", () => {
    const p = spymaster();
    // Every level of Tradecraft in the game, and no Guild to run it from.
    p.buildings.shadow_guild = 0;
    p.research.levels.tradecraft = 5;
    expect(() => runCovertOp(p, victim(0, 0), "torch_stores", 5, 1000, seededRng(1))).toThrow(
      /Shadow Guild/i,
    );

    // And the reverse: a full Guild with the field never studied still works.
    // This is the case that used to fail, and the reason the rule changed —
    // you had paid for the house AND the knives and could send nobody.
    p.buildings.shadow_guild = 5;
    p.research.levels.tradecraft = 0;
    const r = runCovertOp(p, victim(0, 0), "torch_stores", 5, 1000, seededRng(1));
    expect(r.turnsSpent).toBeGreaterThan(0);
  });

  it("the ladder of ops now climbs with the house, level for level", () => {
    const p = spymaster();
    p.research.levels.tradecraft = 5;
    // Steal the Learning is a level-5 operation.
    p.buildings.shadow_guild = 4;
    expect(() => runCovertOp(p, victim(0, 0), "steal_research", 5, 1000, seededRng(4))).toThrow(
      /level 5/i,
    );
    p.buildings.shadow_guild = 5;
    expect(() => runCovertOp(p, victim(0, 0), "steal_research", 5, 1000, seededRng(4))).not.toThrow();
  });

  it("scouts answer to the Lodge, not to Pathfinding", () => {
    const p = spymaster();
    p.army.scouts = 20;
    p.buildings.rangers_lodge = 1; // Map the Army is a level-2 op
    p.research.levels.pathfinding = 5;
    expect(() => runCovertOp(p, victim(0, 0), "map_army", 5, 1000, seededRng(5))).toThrow(
      /Lodge/i,
    );
    p.buildings.rangers_lodge = 2;
    p.research.levels.pathfinding = 0;
    expect(() => runCovertOp(p, victim(0, 0), "map_army", 5, 1000, seededRng(5))).not.toThrow();
  });
});

describe("intel comes back in COLUMNS, not a paragraph", () => {
  it("a survey of the coffers returns one fact per resource, plus gold", () => {
    const p = spymaster();
    p.army.scouts = 20;
    const r = runCovertOp(p, victim(0, 0), "survey_coffers", 8, 1000, seededRng(21));
    const labels = (r.facts ?? []).map((f) => f.label);
    expect(labels).toEqual(["Gold", "Food", "Wood", "Stone", "Ore"]);
    // The qualifier that actually drives a decision — what is takeable.
    expect(r.facts!.every((f) => typeof f.note === "string" && f.note.length > 0)).toBe(true);
    // And the one-line tiding stays SHORT, because it goes in the feed.
    expect(r.detail.length).toBeLessThan(90);
  });

  it("every scout intel op returns facts; sabotage stays prose", () => {
    const p = spymaster();
    p.army.scouts = 40;
    for (const op of ["survey_coffers", "map_walls", "map_army", "map_siege", "map_research"]) {
      const r = runCovertOp(p, victim(0, 0), op, 8, 1000, seededRng(22));
      expect(r.facts?.length, `${op} returned no facts`).toBeGreaterThan(0);
    }
    // Burning a storehouse IS a sentence — forcing it into a table would be
    // worse, so it deliberately has none.
    const arson = runCovertOp(p, victim(0, 0), "torch_stores", 8, 1000, seededRng(23));
    expect(arson.facts).toBeUndefined();
    expect(arson.detail.length).toBeGreaterThan(0);
  });
});

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
    v.army.mercenaries.scouts = Math.floor(90 * MERCENARIES.CAP_RATIO); // exactly at the cap
    // Enough knives that some get through the watch they are there to kill.
    const r = runCovertOp(spymaster(300), v, "assassinate_scouts", 250, 1000, seededRng(10));
    expect(r.defender.army.scouts).toBeLessThan(90);
    // The cascade: fewer regulars means fewer sellswords can be commanded.
    // Read from the constant: CAP_RATIO governs the covert corps as well as the
    // battle line, so it moved when the screen was widened to 30% of a host.
    expect(r.defender.army.mercenaries.scouts).toBeLessThanOrEqual(
      Math.floor(r.defender.army.scouts * MERCENARIES.CAP_RATIO),
    );
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
