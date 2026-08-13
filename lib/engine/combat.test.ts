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
import { STAMINA, storageShelterAtLevel } from "../constants";
import { buildingIntegrity, type Player } from "./types";
import { bonusPool } from "./combat/model";
import { WAR } from "../constants";

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
      if (defForkPoles) {
        p.buildings.war_foundry = 4;
        p.army.siegeCounters.forkpoles = 2; // crewed Fork Poles cancel the 2 ladder teams
        p.army.siegeEngineers = 2;
      }
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
      p.buildings.war_foundry = 6;
      p.army.siegeCounters.boiling_oil = 1; // crewed Boiling Oil cancels a ram
      p.army.siegeEngineers = 2; // crew of 2 for the Boiling Oil
      p.buildings.muster_hall = 10;
    });
    const { report } = resolveBattle(attacker, defender, "siege", { ...OPTS, rng: seededRng(11) });
    const log = report.log.map((l) => l.text).join("\n");
    expect(log).toMatch(/Boiling Oil smash \d+ battering rams/); // counter callout
    expect(log).toMatch(/The engines work the wall/);
    expect(log).toMatch(/Round 1: our host at \d+%/); // round summary retained
    // Regular losses are structured data now, not buried in prose — the whole
    // point of the report rework is that a reader can SEE where their army died.
    const withRegulars = report.log.filter(
      (l) => (l.attackerRegulars ?? 0) + (l.defenderRegulars ?? 0) > 0,
    );
    expect(withRegulars.length).toBeGreaterThan(0);
    expect(report.regularsKilled.attacker + report.regularsKilled.defender).toBeGreaterThan(0);
    expect(report.log.every((l) => l.phase && typeof l.text === "string")).toBe(true);
  });

  it("counters shoot engines to pieces — attrition, not cancellation", () => {
    const mk = (counterEngines: number) =>
      empire("D", (p) => {
        p.army.footmen.light = 200;
        p.buildings.walls = 6;
        p.buildings.war_foundry = 10;
        p.buildings.muster_hall = 25;
        p.army.siegeCounters.counter_engine = counterEngines;
        p.army.siegeEngineers = counterEngines * 5; // crew of 5 each
      });
    const atk = () =>
      empire("A", (p) => {
        p.army.footmen.light = 200;
        p.army.siegeGear.trebuchets = 4;
        p.army.siegeEngineers = 20;
        p.buildings.muster_hall = 25;
      });
    const none = resolveBattle(atk(), mk(0), "siege", { ...OPTS, rng: seededRng(9) });
    const some = resolveBattle(atk(), mk(4), "siege", { ...OPTS, rng: seededRng(9) });
    // Counter-Engines shoot the trebuchets to pieces, so less stone reaches
    // the wall. Attrition, not cancellation — no suppression constant exists.
    expect(some.report.wallIntegrityDamage).toBeLessThan(none.report.wallIntegrityDamage);
    expect(some.report.log.map((l) => l.text).join("\n")).toMatch(
      /Counter-Engine smash \d+ trebuchets/,
    );
  });

  it("a defender with spare engineers fires its own engines back", () => {
    const attacker = empire("A", (p) => {
      p.army.footmen.light = 150;
      p.buildings.muster_hall = 20;
    });
    const defender = empire("D", (p) => {
      p.army.footmen.light = 150;
      p.buildings.walls = 6;
      p.buildings.war_foundry = 9;
      p.army.siegeGear.trebuchets = 3; // offensive engines to fire back
      p.army.siegeEngineers = 15; // no counters bought → all spare, fire back
      p.buildings.muster_hall = 20;
    });
    const { report } = resolveBattle(attacker, defender, "siege", { ...OPTS, rng: seededRng(4) });
    expect(report.log.map((l) => l.text).join("\n")).toMatch(/engines answer/);
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
      p.army.mercenaries.footmen.light = 10;
      p.buildings.muster_hall = 6;
    });
    const { report } = resolveBattle(attacker, defender, "raid", { ...OPTS, rng: seededRng(1) });
    expect(report.defenderLosses.mercenaries).toBe(10); // all merc footmen dead first
  });
});

describe("loot & storage protection", () => {
  it("a castle attack takes GOLD only — goods are a raid’s business", () => {
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
    expect(report.loot.gold).toBeLessThanOrEqual(10000 * 0.7 * 1.25);
    expect(report.loot.resources.wood).toBeLessThanOrEqual(10000 * 0.7 * 1.25);
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
      p.buildings.war_foundry = 10;
      p.army.siegeCounters.counter_engine = 2; // crewed Counter-Engines
      p.army.siegeEngineers = 10; // crew of 5 each → 2 manned
      p.buildings.granary = 3;
      p.buildings.grange = 3;
    });
    const { report, attacker: a2, defender: d2 } = resolveBombard(attacker, defender, {
      ...OPTS,
      rng: seededRng(5),
    });
    expect(report.victor).toBe("none");
    expect(d2.wallIntegrity).toBeLessThan(1); // 4 trebs − 2 cancelled = 2 still pound
    expect(a2.army.siegeGear.trebuchets).toBeLessThan(4); // Counter-Engines splinter them
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
      p.buildings.granary = 5;
      p.resources.food = 0;
      // Vaulted EXACTLY to capacity, read from the curve. The point of the case
      // is the boundary: at full integrity nothing is exposed, and any crack in
      // the granary drops the cap below what is inside and spills the excess.
      // This was a hardcoded 100,000 that happened to equal the old linear cap
      // at level 5 — when shelter went geometric it became a third of capacity
      // and the test quietly stopped exercising the spill at all.
      p.bankedResources = { food: storageShelterAtLevel(5), wood: 0, stone: 0, ore: 0 };
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

  it("a bombard breaches the wall first, then cracks the town open", () => {
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
    expect(buildingIntegrity(d2, "granary")).toBeGreaterThanOrEqual(0.5); // the floor holds
    expect(buildingIntegrity(d2, "granary")).toBeLessThan(1); // but it was cracked
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

  it("a beaten-down defender no longer blocks the attack — they yield instead", () => {
    const a = empire("A", (p) => void (p.shieldUntilTick = 0));
    const d = empire("D", (p) => {
      p.shieldUntilTick = 0;
      p.army.stamina = 10;
    });
    // The mercy floor used to reject the command outright. Now the attack
    // lands and the engine resolves it as a yield (see the yield suite below).
    expect(validateAttack(a, d, "siege", CTX)).toBeNull();
    a.recentAttackers.push({ playerId: d.id, tick: 950 });
    expect(validateAttack(a, d, "revenge", CTX)).toBeNull();
  });

  it("vacation is absolute — the departure queue is what stops it being a dodge", () => {
    const a = empire("A", (p) => void (p.shieldUntilTick = 0));
    const d = empire("D", (p) => {
      p.shieldUntilTick = 0;
      p.onVacation = true;
    });
    expect(validateAttack(a, d, "siege", CTX)).toMatch(/away from the world/i);
    a.recentAttackers.push({ playerId: d.id, tick: 950 });
    // Nobody may depart owing revenge, so a vacationer never has one hanging
    // over them — the queue is the guard, not a special case in combat.
    expect(validateAttack(a, d, "revenge", CTX)).toMatch(/left the world/i);
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

describe("battlefield yield", () => {
  // A host that cannot make a fight of it lays down arms: the stores are lost,
  // the soldiers are not. Distinct from Vacation, which is chosen out of combat.
  const strongHost = (p: Player) => {
    p.army.footmen.light = 500;
    p.shieldUntilTick = 0;
  };

  it("yields when defensive power falls below 60% of the attacker's", () => {
    const a = empire("A", strongHost);
    const d = empire("D", (p) => {
      p.army.footmen.light = 10; // hopelessly outmatched
      p.shieldUntilTick = 0;
      p.resources.food = 5000;
    });
    const { report, defender } = resolveBattle(a, d, "raid", { ...OPTS, rng: seededRng(1) });
    expect(report.yielded).toBe(true);
    expect(report.victor).toBe("attacker");
    expect(report.rounds).toBe(0);
    // Regulars come through untouched.
    expect(report.defenderLosses.footmen).toBe(0);
    expect(defender.army.footmen.light).toBe(10);
    // The attacker still walks off with the stores.
    expect(report.loot.resources.food).toBeGreaterThan(0);
  });

  it("yields when the defender is below the stamina mercy floor, even if strong", () => {
    const a = empire("A", strongHost);
    const d = empire("D", (p) => {
      p.army.footmen.light = 500; // an even match on paper...
      p.army.stamina = 10; // ...but spent
      p.shieldUntilTick = 0;
    });
    const { report } = resolveBattle(a, d, "raid", { ...OPTS, rng: seededRng(2) });
    expect(report.yielded).toBe(true);
    expect(report.defenderLosses.footmen).toBe(0);
  });

  it("spares the regulars but bleeds the sellswords", () => {
    const a = empire("A", strongHost);
    const d = empire("D", (p) => {
      p.army.footmen.light = 10;
      p.army.mercenaries.footmen.light = 100;
      p.shieldUntilTick = 0;
    });
    const { report } = resolveBattle(a, d, "raid", { ...OPTS, rng: seededRng(3) });
    expect(report.yielded).toBe(true);
    expect(report.defenderLosses.footmen).toBe(0); // regulars untouched
    expect(report.defenderLosses.mercenaries).toBe(25); // 25% screen the retreat
  });

  it("revenge is never yielded to — the fight is real", () => {
    const a = empire("A", strongHost);
    const d = empire("D", (p) => {
      p.army.footmen.light = 10;
      p.army.stamina = 1; // beaten down AND outmatched
      p.shieldUntilTick = 0;
    });
    const { report } = resolveBattle(a, d, "revenge", { ...OPTS, rng: seededRng(4) });
    expect(report.yielded).toBe(false);
    expect(report.rounds).toBeGreaterThan(0);
    expect(report.defenderLosses.footmen).toBeGreaterThan(0); // regulars die
  });

  it("costs the attacker almost no stamina — nobody swung hard", () => {
    const a = empire("A", strongHost);
    const d = empire("D", (p) => {
      p.army.footmen.light = 10;
      p.shieldUntilTick = 0;
    });
    const { report } = resolveBattle(a, d, "raid", { ...OPTS, rng: seededRng(5) });
    expect(report.staminaLoss.attacker).toBeLessThan(5);
    expect(report.staminaLoss.defender).toBe(0); // they never struck back
  });
});

describe("stamina drain scales with damage dealt", () => {
  it("a hard-fought battle drains both sides far more than a walkover", () => {
    const even = (n: number) => (p: Player) => {
      p.army.footmen.light = n;
      p.army.archers.light = n;
      p.shieldUntilTick = 0;
    };
    const a = empire("A", even(200));
    const d = empire("D", even(200));
    const hard = resolveBattle(a, d, "raid", { ...OPTS, rng: seededRng(7) }).report;

    const weak = empire("W", (p) => {
      p.army.footmen.light = 5;
      p.shieldUntilTick = 0;
    });
    const walkover = resolveBattle(a, weak, "raid", { ...OPTS, rng: seededRng(7) }).report;

    expect(hard.staminaLoss.attacker).toBeGreaterThan(walkover.staminaLoss.attacker);
    expect(hard.staminaLoss.defender).toBeGreaterThan(0);
  });

  it("never exceeds the per-battle ceiling", () => {
    const a = empire("A", (p) => {
      p.army.cavalry.heavy = 5000; // overwhelming
      p.shieldUntilTick = 0;
    });
    const d = empire("D", (p) => {
      p.army.footmen.light = 400;
      p.army.archers.light = 400;
      p.shieldUntilTick = 0;
    });
    const { report } = resolveBattle(a, d, "revenge", { ...OPTS, rng: seededRng(8) });
    expect(report.staminaLoss.attacker).toBeLessThanOrEqual(STAMINA.MAX_DRAIN_ATTACKER);
    expect(report.staminaLoss.defender).toBeLessThanOrEqual(STAMINA.MAX_DRAIN_DEFENDER);
  });

  it("bombard drains no stamina from either side", () => {
    const a = empire("A", (p) => {
      p.army.siegeGear.trebuchets = 5;
      p.army.siegeEngineers = 50;
      p.shieldUntilTick = 0;
    });
    const d = empire("D", (p) => void (p.shieldUntilTick = 0));
    const { report } = resolveBombard(a, d, { ...OPTS, rng: seededRng(9) });
    expect(report.staminaLoss).toEqual({ attacker: 0, defender: 0 });
  });
});

describe("the war-works", () => {
  const armed = (forge: number, armoury: number) =>
    empire("A", (p) => {
      p.army.footmen.light = 200;
      p.buildings = { ...p.buildings, muster_hall: 25, forge, armoury };
    });

  it("the Forge sharpens and the Armoury hardens, +5% a level", () => {
    const plain = armed(0, 0);
    const forged = armed(10, 0);
    const mailed = armed(0, 10);
    // +50% at level 10, on the additive pool — so the multiplier moves from
    // 1 + Σ to 1 + Σ + 0.5.
    const atk = (p: Player) => bonusPool(p, { kind: "attack", arm: "footman" });
    const def = (p: Player) => bonusPool(p, { kind: "defence", arm: "footman" });
    expect(atk(forged) - atk(plain)).toBeCloseTo(0.5, 6);
    expect(def(mailed) - def(plain)).toBeCloseTo(0.5, 6);
    // Each touches only its own side of the ledger.
    expect(def(forged)).toBeCloseTo(def(plain), 6);
    expect(atk(mailed)).toBeCloseTo(atk(plain), 6);
  });

  it("sellswords are armed from YOUR forge and drilled to YOUR doctrine", () => {
    const merc = (f: number, r: number) => {
      const p = armed(f, 0);
      p.research.levels.art_of_war = r;
      return bonusPool(p, { kind: "attack", arm: "footman", isMerc: true });
    };
    // The war-works reach hired blades exactly as they reach regulars…
    expect(merc(10, 0) - merc(0, 0)).toBeCloseTo(0.5, 6);
    // …and so does the research.
    expect(merc(0, 5) - merc(0, 0)).toBeCloseTo(1.0, 6);
    // What they still do NOT get: your blood, and your veterans' scars.
    const p = armed(0, 0);
    p.army.experience = 100;
    const hired = bonusPool(p, { kind: "attack", arm: "footman", isMerc: true });
    const raised = bonusPool(p, { kind: "attack", arm: "footman" });
    expect(raised).toBeGreaterThan(hired);
  });

  it("moving the shared bonuses above the merc branch did not double-count them", () => {
    // Every situational modifier is applied exactly once for regulars too.
    const p = armed(0, 0);
    const base = bonusPool(p, { kind: "defence", arm: "footman" });
    const walled = bonusPool(p, { kind: "defence", arm: "footman", wallEdge: 0.3 });
    expect(walled - base).toBeCloseTo(0.3, 6);
    const atWar = bonusPool(p, { kind: "attack", arm: "footman", war: true });
    expect(atWar - bonusPool(p, { kind: "attack", arm: "footman" })).toBeCloseTo(WAR.DAMAGE_BONUS, 6);
  });

  it("a forged army actually wins a fight it would otherwise lose", () => {
    const seeds = [3, 11, 29, 47, 73];
    const wins = (forge: number) =>
      seeds.filter((s) => {
        const a = armed(forge, 0);
        const d = empire("D", (p) => {
          p.army.footmen.light = 200;
          p.buildings = { ...p.buildings, muster_hall: 25 };
        });
        return resolveBattle(a, d, "raid", { ...OPTS, rng: seededRng(s) }).report.victor === "attacker";
      }).length;
    // Same dice, same numbers on both sides — the only difference is the steel.
    expect(wins(10)).toBeGreaterThan(wins(0));
  });
});
