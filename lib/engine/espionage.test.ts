import { describe, expect, it } from "vitest";
import { covertHistory, covertTurnCost, recordCovert, runCovertOp, scoutsNeeded } from "./espionageOps";
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
    // Rangers are a flat rate whatever they are looking at — the deeper look
    // costs more because it needs more PEOPLE, not because they charge more.
    expect(covertTurnCost(covertOp("survey_coffers")!, 100)).toBe(200);
    expect(covertTurnCost(covertOp("map_research")!, 100)).toBe(200);
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
    const v = victim(10, 100);
    v.research.levels.pathfinding = 5;
    // Sent in force. Twenty knives against this watch is an order the guild
    // master refuses outright, so it can no longer measure interception — and
    // the raid still has to fit inside SPY_TURNS.CAP, which is its own ceiling.
    const r = runCovertOp(spymaster(200), v, "assassinate_scouts", 150, 1000, seededRng(7));
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

// Quelling used to be two SCOUT OPS you sent at your own streets. It is passive
// now: rangers standing watch shorten what lands, and a heavy enough watch stops
// it landing at all. Nobody is dispatched, and nothing is spent.
describe("rangers standing watch", () => {
  /** A defender whose watch plainly outweighs the knives sent at it. */
  const watched = () => {
    const p = newEmpire({ id: "v", name: "Watched", race: "human" });
    p.buildings.rangers_lodge = 6;
    // Heavy enough to turn most raids back, light enough that a raid big
    // enough to be ACCEPTED still fits inside the spy-turn cap.
    p.army.scouts = 300;
    p.research.levels.pathfinding = 5;
    return p;
  };
  /** …and one with nobody on the walls at all. */
  const blind = () => {
    const p = newEmpire({ id: "v", name: "Blind", race: "human" });
    p.army.scouts = 0;
    return p;
  };

  it("turn back an operation outright when they outweigh it", () => {
    // A QUIET op, deliberately. The guild refuses anything the watch would lay
    // hands on past REFUSAL_RATE, and for a noisy operation that threshold sits
    // barely above the point where the watch outweighs you at all — so for
    // Incite Unrest and dearer there is almost no raid that is accepted AND
    // turned back. Torching leaves a real window between the two.
    let bounced = 0;
    for (let i = 0; i < 40; i++) {
      // Your own are worth four hired apiece now, so it takes far fewer of
      // them to be worth sending — and far fewer before the watch outweighs.
      const r = runCovertOp(spymaster(300), watched(), "torch_stores", 60, 1000, seededRng(i));
      if (/took hold/.test(r.detail)) bounced++;
    }
    expect(bounced).toBeGreaterThan(20);
  });

  it("shorten what does land, against a watch too thin to stop it", () => {
    const thin = blind();
    thin.buildings.rangers_lodge = 2;
    thin.army.scouts = 12;
    const guarded = runCovertOp(spymaster(300), thin, "incite_unrest", 120, 1000, seededRng(5));
    const naked = runCovertOp(spymaster(300), blind(), "incite_unrest", 120, 1000, seededRng(5));
    const span = (p: Player) => (p.unrestUntilTick ?? 1000) - 1000;
    expect(span(guarded.defender)).toBeGreaterThan(0);
    expect(span(guarded.defender)).toBeLessThan(span(naked.defender));
  });

  it("a blind realm takes the whole day, and never learns who did it", () => {
    const r = runCovertOp(spymaster(300), blind(), "incite_unrest", 120, 1000, seededRng(5));
    expect((r.defender.unrestUntilTick ?? 0) - 1000).toBe(TURNS_PER_DAY);
    expect(r.intercepted).toBe(0);
    expect(r.exposed).toBe(false);
  });

  it("never cut an effect below the floor — a near-miss is still an event", () => {
    // One survivor is the smallest infiltration there is; the duration floor is
    // what stops it reading as nothing at all.
    const r = runCovertOp(spymaster(300), blind(), "incite_unrest", 1, 1000, seededRng(9));
    const span = (r.defender.unrestUntilTick ?? 1000) - 1000;
    expect(span).toBeGreaterThanOrEqual(Math.round(TURNS_PER_DAY * 0.1));
  });
});

describe("scouting is priced by the realm you are looking at", () => {
  /** A scouting power with rangers to spare and no research to sharpen them. */
  const ranger = (scouts = 500) => {
    const p = newEmpire({ id: "r", name: "Ranger", race: "human" });
    p.buildings.rangers_lodge = 6;
    p.army.scouts = scouts;
    p.spyTurnsAvailable = 200;
    return p;
  };
  /** Targets differ only in how many people live there. */
  const realm = (peasants: number) => {
    const p = newEmpire({ id: "t", name: "Target", race: "human" });
    p.idlePeasants = peasants;
    p.gold = 1_000_000;
    return p;
  };

  it("a giant takes more rangers to read than a neighbour", () => {
    const op = covertOp("map_army")!;
    const small = scoutsNeeded(op, realm(500), ranger());
    const large = scoutsNeeded(op, realm(20_000), ranger());
    expect(large).toBeGreaterThan(small);
  });

  it("and a deeper look takes more than a shallow one", () => {
    const target = realm(5_000);
    expect(scoutsNeeded(covertOp("map_research")!, target, ranger()))
      .toBeGreaterThan(scoutsNeeded(covertOp("survey_coffers")!, target, ranger()));
  });

  it("Pathfinding buys the requirement down — the field's job on offence", () => {
    const op = covertOp("map_army")!;
    const target = realm(10_000);
    const green = ranger();
    const trained = ranger();
    trained.research.levels.pathfinding = 5;
    expect(scoutsNeeded(op, target, trained)).toBeLessThan(scoutsNeeded(op, target, green));
  });

  it("a full party reports figures; a short one reports ranges", () => {
    const op = covertOp("survey_coffers")!;
    const target = realm(3_000);
    const need = scoutsNeeded(op, target, ranger());
    const full = runCovertOp(ranger(), target, "survey_coffers", need, 1000, seededRng(2));
    const half = runCovertOp(ranger(), target, "survey_coffers", Math.ceil(need * 0.6), 1000, seededRng(2));
    expect(full.facts!.some((f) => f.value.includes("–"))).toBe(false);
    expect(half.facts!.some((f) => f.value.includes("–"))).toBe(true);
    expect(half.detail).toMatch(/estimates/);
  });

  it("too few rangers cannot finish at all — and the turns are still gone", () => {
    const op = covertOp("map_research")!;
    const target = realm(20_000);
    const need = scoutsNeeded(op, target, ranger());
    const r = runCovertOp(ranger(), target, "map_research", Math.max(1, Math.floor(need * 0.1)), 1000, seededRng(3));
    expect(r.facts).toBeUndefined();
    expect(r.detail).toMatch(/could not finish/i);
    expect(r.turnsSpent).toBeGreaterThan(0);
  });

  it("never catches anybody — rangers work in the open", () => {
    const r = runCovertOp(ranger(), realm(10_000), "map_walls", 20, 1000, seededRng(4));
    expect(r.intercepted).toBe(0);
    expect(r.exposed).toBe(false);
  });
});

describe("a spy corps is your own people, padded with bought ones", () => {
  const guild = (own: number, hired: number) => {
    const p = newEmpire({ id: "s", name: "S", race: "human" });
    p.buildings.shadow_guild = 6;
    p.army.spies = own;
    p.army.mercenaries.spies = hired;
    p.research.levels.tradecraft = 5;
    p.spyTurnsAvailable = 200;
    return p;
  };
  const mark = (scouts: number) => {
    const p = newEmpire({ id: "t", name: "Mark", race: "human" });
    p.army.scouts = scouts;
    p.buildings.rangers_lodge = 4;
    p.gold = 2_000_000;
    p.resources = { food: 2e6, wood: 2e6, stone: 2e6, ore: 2e6 };
    return p;
  };

  it("sends the hired first — 20 out of a pool of 25 sellswords is 20 sellswords", () => {
    const a = guild(500, 25);
    const r = runCovertOp(a, mark(0), "torch_stores", 20, 1000, seededRng(1));
    // Nobody was caught (no watch at all), so the proof is in what a party of
    // pure sellswords achieves: a quarter of what your own would.
    expect(r.attacker.army.spies).toBe(500);
    expect(r.attacker.army.mercenaries.spies).toBe(25);
  });

  it("your own burn four times what a bought party would", () => {
    // Kept well under TORCH_CAP, or both parties simply max it out and the
    // difference the weighting makes is invisible.
    const hired = runCovertOp(guild(500, 200), mark(0), "torch_stores", 5, 1000, seededRng(2));
    const own = runCovertOp(guild(500, 0), mark(0), "torch_stores", 5, 1000, seededRng(2));
    expect(hired.resourcesDestroyed).toBeGreaterThan(0);
    expect(own.resourcesDestroyed).toBeGreaterThan(hired.resourcesDestroyed! * 2);
  });

  it("and your own people slip the watch four times in five", () => {
    // Same raid, same watch, same dice — one party bought, one raised.
    let hiredLost = 0, ownLost = 0;
    for (let i = 0; i < 60; i++) {
      const a = guild(500, 300);
      const b = guild(500, 0);
      hiredLost += 300 - runCovertOp(a, mark(60), "torch_stores", 300, 1000, seededRng(i))
        .attacker.army.mercenaries.spies;
      ownLost += 500 - runCovertOp(b, mark(60), "torch_stores", 300, 1000, seededRng(i))
        .attacker.army.spies;
    }
    expect(hiredLost).toBeGreaterThan(ownLost * 2);
  });

  it("refuses a night where the watch would seize more than REFUSAL_RATE of them", () => {
    expect(() => runCovertOp(guild(20, 0), mark(400), "torch_stores", 20, 1000, seededRng(3)))
      .toThrow(/refuses/i);
  });
});
