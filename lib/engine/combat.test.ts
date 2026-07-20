import { describe, expect, it } from "vitest";
import {
  resolveBattle,
  resolveBombard,
  unbankedGold,
  unstored,
  validateAttack,
  type AttackContext,
} from "./combat";
import { newEmpire } from "./newEmpire";
import { seededRng } from "./rng";
import { buildingIntegrity, type Player } from "./types";

function empire(name: string, mods: (p: Player) => void): Player {
  const p = newEmpire({ id: name, name, race: "human" });
  mods(p);
  return p;
}

const OPTS = { battleId: "b1", tick: 1000 };
const CTX: AttackContext = {
  currentTick: 1000,
  eraStartedAtTick: 0,
  eraPeaceTicks: 720,
  revengeWindowTicks: 108,
  clanWar: false,
};

describe("battle resolution — the spec's worked example", () => {
  // 100 light footmen + 2 crewed ladder teams vs 60 light footmen behind
  // Curtain Wall (5) at full integrity, no Fork Poles → attacker wins.
  function setup(defForkPoles: boolean) {
    const attacker = empire("Attacker", (p) => {
      p.army.footmen.light = 100;
      p.army.siegeGear.ladders = 2;
      p.army.siegeEngineers = 2;
      p.buildings.muster_hall = 15;
    });
    const defender = empire("Defender", (p) => {
      p.army.footmen.light = 60;
      p.buildings.walls = 5;
      p.buildings.muster_hall = 8;
      if (defForkPoles) p.buildings.war_foundry = 4; // unlocks Fork Poles
    });
    return { attacker, defender };
  }

  it("without Fork Poles the wall is half-escaladed and the attacker wins", () => {
    const { attacker, defender } = setup(false);
    const { report } = resolveBattle(attacker, defender, "siege", { ...OPTS, rng: seededRng(7) });
    expect(report.victor).toBe("attacker");
    expect(report.rounds).toBeLessThanOrEqual(4);
    expect(report.defenderLosses.footmen).toBeGreaterThan(40);
  });

  it("with Fork Poles the ladders are countered and the defence holds harder", () => {
    const a = resolveBattle(setup(false).attacker, setup(false).defender, "siege", {
      ...OPTS,
      rng: seededRng(7),
    });
    const b = resolveBattle(setup(true).attacker, setup(true).defender, "siege", {
      ...OPTS,
      rng: seededRng(7),
    });
    // Same dice: countered escalade must cost the attacker more men.
    expect(b.report.attackerLosses.footmen).toBeGreaterThanOrEqual(a.report.attackerLosses.footmen);
  });

  it("the log narrates each phase with real casualties", () => {
    const attacker = empire("Attacker", (p) => {
      p.army.footmen.light = 80;
      p.army.archers.light = 30;
      p.army.cavalry.light = 20;
      p.army.siegeGear.trebuchets = 2;
      p.army.siegeGear.rams = 1;
      p.army.siegeEngineers = 12;
      p.buildings.muster_hall = 20;
    });
    const defender = empire("Defender", (p) => {
      p.army.footmen.light = 60;
      p.army.archers.light = 20;
      p.buildings.walls = 5;
      p.buildings.war_foundry = 6; // Bill-hooks, Fork Poles, Boiling Oil active
      p.buildings.muster_hall = 10;
    });
    const { report } = resolveBattle(attacker, defender, "siege", { ...OPTS, rng: seededRng(11) });
    const log = report.log.join("\n");
    expect(log).toMatch(/Boiling Oil scalds our ram crews \(−75%\)/); // counter callout
    expect(log).toMatch(/Siege volley \(\d+ crewed engines\).*walls take −\d+%/);
    expect(log).toMatch(/Arrows fall: .*lose \d+/);
    expect(log).toMatch(/Cavalry charge: .*lose \d+/);
    expect(log).toMatch(/The lines meet: .*lose \d+/);
    expect(log).toMatch(/Round 1: attacker strength/); // round summary retained
  });

  it("raids ignore walls entirely (open-field fight)", () => {
    const { attacker, defender } = setup(false);
    const siege = resolveBattle(attacker, defender, "siege", { ...OPTS, rng: seededRng(3) });
    const raid = resolveBattle(attacker, defender, "raid", { ...OPTS, rng: seededRng(3) });
    expect(raid.report.wallIntegrityDamage).toBe(0);
    // Open field is easier on the attacker than the same fight up a wall.
    expect(raid.report.attackerLosses.footmen).toBeLessThanOrEqual(siege.report.attackerLosses.footmen);
  });
});

describe("mercenaries die first", () => {
  it("merc pool absorbs casualties before regulars", () => {
    const attacker = empire("A", (p) => {
      p.army.footmen.light = 80;
      p.buildings.muster_hall = 10;
    });
    const defender = empire("D", (p) => {
      p.army.footmen.light = 40;
      p.army.mercenaries = 10;
      p.buildings.muster_hall = 6;
    });
    const { report } = resolveBattle(attacker, defender, "raid", { ...OPTS, rng: seededRng(1) });
    expect(report.defenderLosses.mercenaries).toBe(10); // all mercs dead first
  });
});

describe("loot & storage protection", () => {
  it("siege steals 25% of unbanked gold and unstored resources only", () => {
    const attacker = empire("A", (p) => {
      p.army.footmen.light = 200;
      p.buildings.muster_hall = 25;
    });
    const defender = empire("D", (p) => {
      p.army.footmen.light = 30;
      p.gold = 10000;
      p.bankedGold = 15000;
      p.buildings.counting_house = 1; // protects 20k banked
      p.resources.wood = 10000; // loose — raidable
      p.bankedResources = { food: 0, wood: 20000, stone: 0, ore: 0 }; // vaulted — safe
      p.buildings.timberyard = 1; // holds 20k wood
      p.buildings.muster_hall = 5;
    });
    expect(unbankedGold(defender)).toBe(10000);
    expect(unstored(defender, "wood")).toBe(10000);
    const { report, defender: after } = resolveBattle(attacker, defender, "siege", {
      ...OPTS,
      rng: seededRng(2),
    });
    expect(report.victor).toBe("attacker");
    // Overwhelming attacker: small-target scaling shrinks the take below the
    // full 25%, but never below the floor and never touching protected stores.
    expect(report.loot.gold).toBeGreaterThan(0);
    expect(report.loot.gold).toBeLessThanOrEqual(2500);
    expect(report.loot.resources.wood).toBeLessThanOrEqual(2500);
    expect(after.bankedGold).toBe(15000); // the bank never leaks
  });
});

describe("bombard", () => {
  it("pounds walls first, then spills onto the town; the Counter-Engine bites back", () => {
    const attacker = empire("A", (p) => {
      p.army.siegeGear.trebuchets = 4;
      p.army.siegeEngineers = 20;
      p.buildings.muster_hall = 5;
      p.buildings.war_foundry = 9;
    });
    const defender = empire("D", (p) => {
      p.buildings.walls = 6;
      p.buildings.war_foundry = 10; // Counter-Engine
      p.buildings.granary = 3;
      p.buildings.grange = 3;
    });
    const { report, attacker: a2, defender: d2 } = resolveBombard(attacker, defender, {
      ...OPTS,
      rng: seededRng(5),
    });
    expect(report.victor).toBe("none");
    expect(d2.wallIntegrity).toBeLessThan(1);
    expect(a2.army.siegeGear.trebuchets).toBeLessThan(4); // counter kills
  });

  it("with the walls already down, the fire cracks the town's buildings (floor 50%)", () => {
    const attacker = empire("A", (p) => {
      p.army.siegeGear.trebuchets = 20;
      p.army.siegeEngineers = 100;
      p.buildings.muster_hall = 15;
      p.buildings.war_foundry = 9;
    });
    const defender = empire("D", (p) => {
      p.buildings.walls = 2;
      p.wallIntegrity = 0.4; // already breached — bombard goes straight to town
      p.buildings.granary = 5; // holds 100k at full integrity
      p.resources.food = 0;
      p.bankedResources = { food: 100000, wood: 0, stone: 0, ore: 0 }; // all vaulted
    });
    expect(unstored(defender, "food")).toBe(0);
    const { report, defender: d2 } = resolveBombard(attacker, defender, { ...OPTS, rng: seededRng(9) });
    expect(report.buildingDamage && report.buildingDamage.length).toBeGreaterThan(0);
    // Every cracked building holds at or above the 50% floor.
    for (const id of Object.keys(d2.buildingIntegrity ?? {}) as (keyof NonNullable<Player["buildingIntegrity"]>)[]) {
      expect((d2.buildingIntegrity ?? {})[id]!).toBeGreaterThanOrEqual(0.5 - 1e-9);
    }
    // If the granary took hits, its overflow now spills outside for a siege.
    const granaryHit = report.buildingDamage?.find((b) => b.building === "granary");
    if (granaryHit) expect(unstored(d2, "food")).toBeGreaterThan(0);
  });

  it("a heavy sustained bombard drives at least one building to the 50% floor", () => {
    const attacker = empire("A", (p) => {
      p.army.siegeGear.trebuchets = 30;
      p.army.siegeEngineers = 150;
      p.buildings.muster_hall = 20;
      p.buildings.war_foundry = 9;
    });
    const defender = empire("D", (p) => {
      p.wallIntegrity = 0.3; // walls already breached
      p.buildings.granary = 5;
    });
    const { defender: d2 } = resolveBombard(attacker, defender, { ...OPTS, rng: seededRng(3) });
    expect(buildingIntegrity(d2, "granary")).toBeCloseTo(0.5, 5); // the floor holds
  });
});

describe("attack validation", () => {
  it("era peace blocks everything", () => {
    const a = empire("A", (p) => void (p.shieldUntilTick = 0));
    const d = empire("D", (p) => void (p.shieldUntilTick = 0));
    expect(validateAttack(a, d, "raid", { ...CTX, currentTick: 100 })).toMatch(/era peace/i);
  });

  it("newcomer shield blocks attacks on the shielded", () => {
    const a = empire("A", (p) => void (p.shieldUntilTick = 0));
    const d = empire("D", (p) => void (p.shieldUntilTick = 2000));
    expect(validateAttack(a, d, "raid", CTX)).toMatch(/shield/i);
  });

  it("mercy rules spare the beaten — but revenge ignores them", () => {
    const a = empire("A", (p) => void (p.shieldUntilTick = 0));
    const d = empire("D", (p) => {
      p.shieldUntilTick = 0;
      p.army.stamina = 10;
    });
    expect(validateAttack(a, d, "siege", CTX)).toMatch(/beaten down/i);
    a.recentAttackers.push({ playerId: d.id, tick: 950 });
    expect(validateAttack(a, d, "revenge", CTX)).toBeNull();
  });

  it("troops refuse targets ≥75% stronger", () => {
    const a = empire("A", (p) => void (p.shieldUntilTick = 0));
    const d = empire("D", (p) => {
      p.shieldUntilTick = 0;
      p.gold = 5_000_000; // massive score gap
      p.army.experience = 100;
    });
    expect(validateAttack(a, d, "raid", CTX)).toMatch(/refuse/i);
  });
});
