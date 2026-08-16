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
import { MERCENARIES, SORTIE, STAMINA, storageShelterAtLevel } from "../constants";
import { buildingIntegrity, type Player } from "./types";
import { bonusPool } from "./combat/model";
import { WAR, WALL_EDGE, SCORE } from "../constants";
import { blendWallEdge, wallHealth } from "./combat/walls";
import { rankingScore } from "./score";

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

  // The spec's example was "100 light footmen + 2 ladder teams beat 60 behind a
  // Curtain Wall". They no longer do, and that is the balance pass working as
  // intended: defenders behind stone dodge four blows in five and keep the
  // wall's edge on top of it, so 100 against 60 is not the odds it looks.
  //
  // Worth knowing what sits either side of this: at 100 the defence holds
  // outright; by 150 the attacker is 1.4x their worth and the garrison YIELDS
  // without a fight. There is no force in between that produces a real
  // engagement — see the case below, which pins that gap deliberately.
  it("without Fork Poles a 100-strong assault is thrown back", () => {
    const { attacker, defender } = setup(false);
    const { report } = resolveBattle(attacker, defender, "siege", { ...OPTS, rng: seededRng(7) });
    expect(report.victor).toBe("defender");
    // One exchange, always — a battle is no longer a sequence of rounds.
    expect(report.rounds).toBe(1);
  });

  it("and by 150 the garrison lays down arms rather than fight", () => {
    const { attacker, defender } = setup(false);
    attacker.army.footmen.light = 150;
    attacker.buildings.muster_hall = 60;
    const { report } = resolveBattle(attacker, defender, "siege", { ...OPTS, rng: seededRng(7) });
    expect(report.yielded).toBe(true);
    expect(report.victor).toBe("attacker");
    // A yield spares the soldiers and takes the stores: nobody in the garrison
    // dies, which is the whole point of the mercy rule.
    expect(report.defenderLosses.footmen).toBe(0);
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
    // Sized so the scald is CERTAIN rather than a coin flip. It is rolled as
    // a fraction of the men on the beams (OIL_SCALD_PER_CAULDRON per cauldron,
    // capped at OIL_SCALD_CAP), so it needs enough of both to clear 1.0: ten
    // rams put 60 hands on the beams and six cauldrons reach the 6% cap, for
    // 3.6 expected. With one ram and one cauldron it was 0.06 of a man — a 6%
    // chance that happened to land on this seed, so the test passed by luck
    // and broke the moment ram crews changed size.
    const attacker = empire("Attacker", (p) => {
      p.army.footmen.light = 140; // 60 go to the beams, 80 stay in the line
      p.army.archers.light = 30;
      p.army.cavalry.light = 20;
      p.army.siegeGear.trebuchets = 2;
      p.army.siegeGear.rams = 10;
      p.army.siegeEngineers = 30; // 2 per ram + 5 per trebuchet
      p.buildings.muster_hall = 40;
    });
    const defender = empire("Defender", (p) => {
      p.army.footmen.light = 60;
      p.army.archers.light = 20;
      p.buildings.walls = 5;
      p.buildings.war_foundry = 6;
      p.army.siegeCounters.boiling_oil = 6; // crewed Boiling Oil scalds the beams
      p.army.siegeEngineers = 12; // crew of 2 apiece
      p.buildings.muster_hall = 10;
    });
    const { report } = resolveBattle(attacker, defender, "siege", { ...OPTS, rng: seededRng(11) });
    const log = report.log.map((l) => l.text).join("\n");
    // Boiling oil scalds the men on the beams — the one counter that kills crew
    // as well as timber. Was asserting it SMASHED the ram outright, which stopped
    // being true when counters went from perfect accuracy (1.00) to 0.30: one
    // cauldron wears a ram down now, it does not wreck it in a single exchange.
    expect(log).toMatch(/Boiling oil comes over the parapet/);
    expect(log).toMatch(/The engines work the wall/);
    expect(log).toMatch(/We gave up \d+% of the host we brought/); // the closing tally
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
    // Wear, not wreckage. A single exchange batters the trebuchets without
    // finishing any of them — the destruction comes from being shot at strike
    // after strike. (Was asserting the "Counter-Engine smash N trebuchets"
    // callout, which needed ten duel rounds in one battle to fire.)
    expect(some.report.siegeGearWorn?.trebuchets ?? 0).toBeGreaterThan(0);
    expect(none.report.siegeGearWorn?.trebuchets ?? 0).toBe(0);
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
      // BALLISTAE, not trebuchets: engines have one job each now, and shooting
      // men is the ballista's. A defender's trebuchets have no wall to throw at.
      p.army.siegeGear.ballistae = 4;
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
    // Sellswords take CASUALTY_SPLIT.MERC_SHARE of every blow aimed at their
    // arm, so they die faster than the regulars they serve beside. Was
    // `toBe(10)` — every last one — which only held while a battle ground on
    // for ten rounds. One exchange kills some of them, not all of them; what
    // has to stay true is that they are the ones bleeding.
    expect(report.defenderLosses.mercenaries).toBeGreaterThan(0);
    expect(report.defenderLosses.mercenaries).toBeGreaterThan(report.defenderLosses.footmen);
  });
});

describe("stripping the dead", () => {
  const host = (n: number) => (p: Player) => {
    p.army.footmen.light = n;
    p.army.mercenaries.footmen.light = Math.floor(n / 3);
    p.buildings.muster_hall = Math.ceil(n / 5) + 10;
    p.shieldUntilTick = 0;
  };

  it("the victor strips BOTH sides' fallen, and the loser gets nothing", () => {
    // Deliberately CLOSE. At 400 against 150 the defender is outweighed past
    // YIELD.WORTH_ADVANTAGE and lays down arms, so nobody falls and there is
    // nothing on the field to strip — which is what this case used to measure
    // and silently stopped measuring.
    const a0 = empire("A", host(400));
    const d0 = empire("D", host(340));
    const { report, attacker, defender } = resolveBattle(a0, d0, "raid", {
      ...OPTS,
      rng: seededRng(5),
    });
    expect(report.victor).toBe("attacker");
    expect(report.salvage!.gold).toBeGreaterThan(0);
    expect(report.salvage!.ore).toBeGreaterThan(0);
    // It lands on the winner, in full, and the loser's stores never move —
    // measured as a DELTA because an empire is founded holding stock.
    expect(attacker.gold - a0.gold).toBe(report.salvage!.gold);
    // A raid ALSO loots ore out of the storehouses, so the ore that arrives home
    // is the two streams added — which is the clearest possible demonstration
    // that they are two streams.
    expect(attacker.resources.ore - a0.resources.ore).toBe(
      report.salvage!.ore + report.loot.resources.ore,
    );
    // And the loser gains nothing from the field: their ore moves by exactly the
    // loot taken off them, with no salvage credited in the other direction.
    expect(d0.resources.ore - defender.resources.ore).toBe(report.loot.resources.ore);
  });

  it("revenge carries no loot home but still strips the field", () => {
    const { report } = resolveBattle(empire("A", host(400)), empire("D", host(150)), "revenge", {
      ...OPTS,
      rng: seededRng(5),
    });
    // Revenge is a punishment, not a payday — no storehouse is touched...
    expect(report.loot.gold).toBe(0);
    expect(report.loot.resources.ore).toBe(0);
    // ...but the dead are still lying there, and mail is mail.
    expect(report.salvage!.gold).toBeGreaterThan(0);
  });

  it("a battle where nobody falls yields nothing to strip", () => {
    const { report } = resolveBattle(
      empire("A", (p) => void (p.shieldUntilTick = 0)),
      empire("D", (p) => {
        p.army.footmen.light = 0;
        p.army.archers.light = 0;
        p.army.cavalry.light = 0;
        p.shieldUntilTick = 0;
      }),
      "raid",
      { ...OPTS, rng: seededRng(2) },
    );
    expect(report.salvage).toEqual({ gold: 0, ore: 0 });
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
    expect(d2.wallIntegrity).toBeLessThan(1); // the surviving trebuchets still pound
    // Two Counter-Engines batter four trebuchets without finishing any — wear,
    // not wreckage. (Was `toBeLessThan(4)`, which held only while counters fired
    // at a flat 100% accuracy; at 0.30 the destruction comes from being shot at
    // barrage after barrage, which is what makes a siege a campaign.)
    expect(report.siegeGearWorn?.trebuchets ?? 0).toBeGreaterThan(0);
    expect(a2.army.siegeGear.trebuchets).toBeLessThanOrEqual(4);
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
    const { defender: d2, report } = resolveBombard(attacker, defender, { ...OPTS, rng: seededRng(3) });
    // Named the granary before, which only held because ten volleys gave ten
    // draws at the weighting table. A barrage is one exchange spending
    // BOMBARD_INTENSITY aiming points now, so WHICH roofs it walks across is
    // properly random — the claim is about the town, not one storehouse.
    expect(report.buildingDamage?.length ?? 0).toBeGreaterThan(0);
    for (const { building } of report.buildingDamage ?? []) {
      expect(buildingIntegrity(d2, building)).toBeLessThan(1); // cracked…
      expect(buildingIntegrity(d2, building)).toBeGreaterThanOrEqual(0.5); // …never levelled
    }
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
      p.army.footmen.heavy = 2000; // a real army — score is what you can field
      p.buildings.muster_hall = 250;
    });
    expect(validateAttack(a, d, "raid", CTX)).toMatch(/refuse/i);
  });

  it("veterancy alone cannot make a target refusable — it needs men to lift", () => {
    // Veterancy scores nothing of its own: it multiplies the power of the
    // regulars who carry it. A ruler with a legendary ledger and no army is,
    // on the ladder, a ruler with no army. (This test exists because the
    // refusal test above USED to pass on exactly that: 5,000,000 points and
    // not one soldier.)
    const disarmed = (pts: number) =>
      empire(`D${pts}`, (p) => {
        p.shieldUntilTick = 0;
        p.army.footmen = { light: 0, medium: 0, heavy: 0 };
        p.army.archers = { light: 0, medium: 0, heavy: 0 };
        p.army.cavalry = { light: 0, medium: 0, heavy: 0 };
        p.army.experiencePoints = pts;
      });
    // No regulars: the ledger multiplies nothing and the ladder does not move.
    expect(rankingScore(disarmed(5_000_000))).toBe(rankingScore(disarmed(0)));

    // Give them men and the SAME ledger is suddenly worth a great deal — which
    // is the whole point: veterancy ranks through troops, never beside them.
    const withMen = (pts: number) =>
      empire(`M${pts}`, (p) => {
        p.shieldUntilTick = 0;
        p.army.footmen = { light: 0, medium: 0, heavy: 500 };
        p.buildings.muster_hall = 60;
        p.army.experiencePoints = pts;
      });
    expect(rankingScore(withMen(5_000_000))).toBeGreaterThan(rankingScore(withMen(0)));
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
    // The per-side ceilings are gone: drain is simply the fraction of the enemy
    // you got through, on the stamina scale, so the only bound is MAX.
    expect(report.staminaLoss.attacker).toBeLessThanOrEqual(STAMINA.MAX);
    expect(report.staminaLoss.defender).toBeLessThanOrEqual(STAMINA.MAX);
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
    p.army.experiencePoints = 5_000_000;
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

describe("the wall edge is the only edge", () => {
  const noTackle = { ropes: 0, ladders: 0, siege_towers: 0, rams: 0, ballistae: 0, trebuchets: 0 };
  const walled = (lvl: number) => empire("D", (p) => { p.buildings.walls = lvl; p.wallIntegrity = 1; });

  it("gives its full edge to EVERY defender, however many come", () => {
    // This block used to assert the opposite — a wall covered `level × 300`
    // attackers and diluted its edge past that, so a big enough host walked up
    // to a Citadel as though it were open ground. Removed by design: everyone
    // behind intact masonry is behind it.
    for (const host of [10, 1_000, 3_000, 9_000, 50_000]) {
      expect(blendWallEdge(walled(10), host, noTackle).blendedEdge).toBeCloseTo(WALL_EDGE.BASE, 6);
    }
  });

  it("wall LEVEL buys durability, not a bigger edge", () => {
    const at = (lvl: number) => blendWallEdge(walled(lvl), 3000, noTackle).blendedEdge;
    expect(at(1)).toBeCloseTo(WALL_EDGE.BASE, 6);
    expect(at(10)).toBeCloseTo(WALL_EDGE.BASE, 6);
    // What level DOES buy is health — quadratic, so a Citadel soaks 100x a Palisade.
    expect(wallHealth(walled(10)) / wallHealth(walled(1))).toBeCloseTo(100, 6);
  });

  it("tackle is what thins the edge, and only tackle", () => {
    const towers = { ...noTackle, siege_towers: 30 }; // 3,000 men carried
    const bare = blendWallEdge(walled(10), 3000, noTackle).blendedEdge;
    const withTowers = blendWallEdge(walled(10), 3000, towers).blendedEdge;
    expect(withTowers).toBeLessThan(bare);
    expect(withTowers).toBeCloseTo(WALL_EDGE.VS_TOWER, 6);
  });

  it("battered tackle carries fewer men, so escalade counters bite immediately", () => {
    // The fix that made Fire Pots, Fork Poles and Bill-hooks worth owning: a
    // tower at half health carries half a load, where it used to carry a full
    // one until the moment it was destroyed outright.
    const towers = { ...noTackle, siege_towers: 30 };
    const whole = blendWallEdge(walled(10), 3000, towers).blendedEdge;
    const half = blendWallEdge(walled(10), 3000, towers, { siege_towers: 0.5 }).blendedEdge;
    expect(half).toBeGreaterThan(whole); // fewer men on the good edge
    // 1,500 towered at 0.1, 1,500 unaided at 0.5 → 0.30
    expect(half).toBeCloseTo((1500 * WALL_EDGE.VS_TOWER + 1500 * WALL_EDGE.BASE) / 3000, 6);
  });

  it("no wall means no edge, however few come", () => {
    expect(blendWallEdge(walled(0), 10, noTackle).blendedEdge).toBe(0);
    expect(blendWallEdge(walled(0), 10, noTackle).coverage).toBe(0);
  });
});

describe("an unmanned wall is masonry, not strength", () => {
  const manned = (wallLvl: number, troops: number) =>
    empire("D", (p) => {
      p.buildings.walls = wallLvl;
      p.wallIntegrity = 1;
      p.army.footmen.light = troops;
      p.buildings.muster_hall = Math.ceil(troops / 10) + 2;
    });

  it("scores pro rata below the garrison a wall needs", () => {
    const need = 10 * SCORE.WALL_TROOPS_PER_LEVEL; // a Citadel wants 2,000
    const full = rankingScore(manned(10, need));
    const half = rankingScore(manned(10, need / 2));
    const none = rankingScore(manned(10, 0));
    // The wall's own contribution halves; the troops themselves still score, so
    // compare the DIFFERENCES rather than the totals.
    expect(full - half).toBeGreaterThan(0);
    expect(rankingScore(manned(0, need))).toBeLessThan(full);
    expect(none).toBeLessThan(half);
  });

  it("a bare Citadel scores no more wall than a bare Palisade", () => {
    // Both unmanned: neither gets any wall points, so the only difference left
    // between them is nothing at all.
    expect(rankingScore(manned(10, 0))).toBe(rankingScore(manned(1, 0)));
  });
});

describe("no friendly fire", () => {
  const CTX = {
    currentTick: 100_000,
    eraStartedAtTick: 0,
    eraPeaceTicks: 720,
    revengeWindowTicks: 108,
    clanWar: false,
  };

  it("refuses every mode against a clanmate, revenge included", () => {
    const a = empire("A", (p) => {
      p.shieldUntilTick = 0;
      p.clanId = "iron";
    });
    const d = empire("D", (p) => {
      p.shieldUntilTick = 0;
      p.clanId = "iron";
    });
    // Even with an open window — a stale one from before they joined.
    a.recentAttackers = [{ playerId: d.id, tick: CTX.currentTick - 10 }];
    for (const mode of ["raid", "siege", "bombard", "revenge"] as const) {
      expect(validateAttack(a, d, mode, CTX), mode).toMatch(/own banner/i);
    }
  });

  it("allows it once one of them leaves the banner", () => {
    const a = empire("A", (p) => {
      p.shieldUntilTick = 0;
      p.clanId = "iron";
    });
    const d = empire("D", (p) => {
      p.shieldUntilTick = 0;
      p.clanId = "gold";
    });
    expect(validateAttack(a, d, "raid", CTX)).toBeNull();
  });

  it("clanless players are not accidentally treated as clanmates", () => {
    const a = empire("A", (p) => void (p.shieldUntilTick = 0));
    const d = empire("D", (p) => void (p.shieldUntilTick = 0));
    expect(a.clanId).toBeUndefined();
    expect(validateAttack(a, d, "raid", CTX)).toBeNull();
  });
});

describe("the report TELLS the battle, phase by phase", () => {
  // The three melee phases used to resolve in silence: they account for most of
  // the dead in any battle and the log jumped from the wall to the aftermath,
  // so the losses table gave totals with no account of where they came from.
  it("archers, cavalry and the footman clash each speak when they kill", () => {
    const arm = (p: Player) => {
      p.army.footmen = { light: 200, medium: 120, heavy: 60 };
      p.army.archers = { light: 160, medium: 100, heavy: 50 };
      p.army.cavalry = { light: 90, medium: 60, heavy: 30 };
      p.buildings.muster_hall = 200;
    };
    const { report } = resolveBattle(empire("A", arm), empire("D", arm), "raid", {
      ...OPTS,
      rng: seededRng(9),
    });
    const phases = new Set(report.log.map((l) => l.phase));
    for (const phase of ["archers", "cavalry", "footmen"] as const) {
      expect(phases.has(phase), `nothing logged for the ${phase} phase`).toBe(true);
    }
    // Each line carries its own regular dead — what the panel bolds beside it.
    const melee = report.log.filter((l) => ["archers", "cavalry", "footmen"].includes(l.phase));
    expect(melee.some((l) => (l.attackerRegulars ?? 0) > 0 || (l.defenderRegulars ?? 0) > 0)).toBe(true);
  });
});

describe("a bombard is an ARTILLERY duel and nothing else", () => {
  // The whole park used to duel in a bombard: boiling oil scalded rams and
  // bill-hooks cut grapple lines in an engagement with no soldiers in it. The
  // attacker lost escalade tackle that never left camp, and the defender's oil
  // and hooks wore down answering an assault that was not happening.
  it("leaves rams and escalade tackle out of it entirely", () => {
    const a = empire("Attacker", (p) => {
      p.army.siegeGear = { ...p.army.siegeGear, trebuchets: 20, rams: 12, ropes: 12, ladders: 12 };
      p.army.siegeEngineers = 400;
      p.buildings.war_foundry = 10;
      p.buildings.muster_hall = 200;
    });
    const d = empire("Defender", (p) => {
      p.buildings.walls = 5;
      p.buildings.war_foundry = 10;
      p.army.siegeEngineers = 400;
      p.buildings.muster_hall = 200;
      p.army.siegeCounters = {
        ...p.army.siegeCounters,
        counter_engine: 14,
        boiling_oil: 14,
        billhooks: 14,
        forkpoles: 14,
      };
    });
    const { report } = resolveBombard(a, d, { ...OPTS, rng: seededRng(31) });

    // Only the pair that belongs in an artillery exchange may lose anything.
    expect(report.siegeGearLost.rams ?? 0).toBe(0);
    expect(report.siegeGearLost.ropes ?? 0).toBe(0);
    expect(report.siegeGearLost.ladders ?? 0).toBe(0);
    expect(report.siegeCountersLost?.boiling_oil ?? 0).toBe(0);
    expect(report.siegeCountersLost?.billhooks ?? 0).toBe(0);
    expect(report.siegeCountersLost?.forkpoles ?? 0).toBe(0);

    // …and the duel that DID happen is named for what it was.
    const duel = report.log.filter((l) => l.phase === "counter-duel").map((l) => l.text).join(" ");
    expect(duel).not.toMatch(/grapple|ladder|ram|oil/i);
  });
});

describe("each counter is described by what it actually does", () => {
  // One verb — "smash" — covered six different mechanisms. A bill-hook cuts a
  // grapple line, a fork pole shoves a ladder off the wall, hoardings are a
  // covered gallery that takes the bolts meant for your people.
  it("never says a hoarding, bill-hook or fork pole smashed anything", () => {
    const a = empire("Attacker", (p) => {
      p.army.siegeGear = { ...p.army.siegeGear, ropes: 20, ladders: 20, ballistae: 20, rams: 12 };
      p.army.siegeEngineers = 400;
      p.buildings.war_foundry = 10;
      p.buildings.muster_hall = 200;
      p.army.footmen.light = 400;
    });
    const d = empire("Defender", (p) => {
      p.buildings.walls = 5;
      p.buildings.war_foundry = 10;
      p.army.siegeEngineers = 400;
      p.buildings.muster_hall = 200;
      p.army.footmen.light = 400;
      p.army.siegeCounters = {
        ...p.army.siegeCounters,
        billhooks: 20,
        forkpoles: 20,
        hoardings: 20,
        boiling_oil: 20,
      };
    });
    const { report } = resolveBattle(a, d, "siege", { ...OPTS, rng: seededRng(17) });
    const duel = report.log.filter((l) => l.phase === "counter-duel").map((l) => l.text);
    expect(duel.length).toBeGreaterThan(0);
    for (const line of duel) {
      if (/hoarding|Bill-hook|Fork pole/i.test(line)) {
        expect(line, `wrong verb: ${line}`).not.toMatch(/smash/i);
      }
    }
    // And nothing is counted with a name that cannot take a number.
    expect(duel.join(" ")).not.toMatch(/\d+ Counter-Engine\b(?!s)/);
  });
});

describe("the sortie is two battles, not a demolition", () => {
  /** A besieger: a screen out front, archers and engineers at the engines. */
  const besieger = (screen: number) => (p: Player) => {
    p.buildings.muster_hall = 900;
    p.buildings.war_foundry = 10;
    p.army.footmen.heavy = screen;
    p.army.mercenaries.footmen.heavy = Math.floor(screen / 3);
    p.army.archers.heavy = 400;
    p.army.mercenaries.archers.heavy = 130;
    p.army.siegeEngineers = 300;
    p.army.mercenaries.engineers = 90;
    p.army.siegeGear = { ...p.army.siegeGear, trebuchets: 40, ballistae: 24, rams: 30, siege_towers: 18 };
    p.army.sortieEnabled = false;
    p.shieldUntilTick = 0;
  };

  /** A garrison that rides out, with no counters so only the sortie can touch
   *  the attacker's park. */
  const holder = (riders: number) => (p: Player) => {
    p.buildings.muster_hall = 900;
    p.buildings.walls = 9;
    p.wallIntegrity = 1;
    p.army.cavalry.heavy = riders;
    p.army.mercenaries.cavalry.heavy = Math.floor(riders / 3);
    p.army.siegeCounters = {
      billhooks: 0, forkpoles: 0, fire_pots: 0,
      boiling_oil: 0, hoardings: 0, counter_engine: 0,
    };
    p.army.sortieEnabled = true;
    p.shieldUntilTick = 0;
  };

  const ride = (screen: number, riders: number, seed = 7) =>
    resolveBattle(empire("A", besieger(screen)), empire("D", holder(riders)), "siege", {
      ...OPTS,
      rng: seededRng(seed),
    });

  it("does not fire when the garrison cannot outweigh the screen", () => {
    // Well under TRIGGER_RATIO — the gates stay shut and the phase is silent.
    const { report } = ride(600, 40);
    expect(report.log.some((l) => l.phase === "sortie")).toBe(false);
  });

  it("costs the garrison riders — a sortie is no longer free", () => {
    // The whole point of E: before this, the defender could ride out and lose
    // nothing whatever the outcome, which made the standing order a pure win.
    const { report } = ride(120, 500);
    expect(report.log.some((l) => l.phase === "sortie")).toBe(true);
    expect(report.defenderLosses.mercenaries + report.defenderLosses.cavalry).toBeGreaterThan(0);
  });

  it("wears the siege train rather than firing it outright", () => {
    const { attacker, report } = ride(120, 500);
    const line = report.log.find((l) => l.phase === "sortie");
    expect(line).toBeDefined();
    // Engines are damaged...
    expect(attacker.army.siegeGearIntegrity.trebuchets).toBeLessThan(1);
    // ...but the sortie itself smashes none of them: integrity never fell past
    // SIEGE_DESTROYED_BELOW. Asserted against the sortie's OWN report rather
    // than the surviving park, because a besieger who loses the field forfeits
    // gear (SIEGE_GEAR_LOSS_ON_DEFEAT) and that forfeit would read as sortie
    // damage — which is exactly the confound this phase used to have.
    expect(line!.text).not.toMatch(/smashed past repair/);
  });

  it("spends itself on the tall engines first", () => {
    const { attacker } = ride(120, 500);
    // Trebuchets are what the sally was for; rams sit at the back of the queue.
    expect(attacker.army.siegeGearIntegrity.trebuchets).toBeLessThan(
      attacker.army.siegeGearIntegrity.rams,
    );
  });

  it("kills hired crews before regular engineers", () => {
    const { attacker, report } = ride(120, 500);
    expect(report.log.some((l) => l.phase === "sortie")).toBe(true);
    const regularsDead = 300 - attacker.army.siegeEngineers;
    const hiredDead = 90 - attacker.army.mercenaries.engineers;
    expect(hiredDead).toBeGreaterThan(0);
    expect(hiredDead).toBeGreaterThan(regularsDead);
  });

  it("leaves most engineers alive — they run rather than fight", () => {
    // DAMAGE_TAKEN.engineer is the lowest in the table and this is why: a
    // breakthrough used to kill crews by a flat surplus/200 with no defence at
    // all. The crews must survive to crew anything afterwards.
    const { attacker } = ride(120, 500);
    expect(attacker.army.siegeEngineers).toBeGreaterThan(300 * 0.8);
  });
});

describe("a garrison in no condition to sally stays behind the wall", () => {
  /** A garrison that comfortably clears the strength trigger, so the ONLY
   *  thing under test is the condition of the host itself. */
  const garrison = (mods: (p: Player) => void) => (p: Player) => {
    p.buildings.muster_hall = 900;
    p.buildings.walls = 9;
    p.wallIntegrity = 1;
    // newEmpire seeds START.LIGHT_FOOTMEN into every empire, and those count
    // toward the hire cap the screen gate is measured against. Cleared so the
    // arithmetic below is exactly 3/7 of the cavalry and nothing else.
    p.army.footmen = { light: 0, medium: 0, heavy: 0 };
    p.army.cavalry.heavy = 600;
    p.army.mercenaries.cavalry.heavy = Math.floor(600 * MERCENARIES.CAP_RATIO);
    p.army.stamina = 100;
    p.army.sortieEnabled = true;
    p.shieldUntilTick = 0;
    mods(p);
  };
  const besieger = (p: Player) => {
    p.buildings.muster_hall = 900;
    p.buildings.war_foundry = 10;
    p.army.footmen = { light: 0, medium: 0, heavy: 40 }; // token screen; trigger is clear
    p.army.archers.heavy = 200;
    p.army.siegeEngineers = 200;
    p.army.siegeGear = { ...p.army.siegeGear, trebuchets: 20 };
    p.army.sortieEnabled = false;
    p.shieldUntilTick = 0;
  };
  const sallied = (mods: (p: Player) => void) =>
    resolveBattle(empire("A", besieger), empire("D", garrison(mods)), "siege", {
      ...OPTS,
      rng: seededRng(5),
    }).report.log.some((l) => l.phase === "sortie");

  it("rides out when rested and screened", () => {
    expect(sallied(() => {})).toBe(true);
  });

  it("will not open the gates below SORTIE.MIN_STAMINA", () => {
    // Still well above the mercy floor — able to fight, unwilling to sally.
    expect(SORTIE.MIN_STAMINA).toBeGreaterThan(STAMINA.MERCY_FLOOR);
    expect(sallied((p) => { p.army.stamina = SORTIE.MIN_STAMINA - 1; })).toBe(false);
    expect(sallied((p) => { p.army.stamina = SORTIE.MIN_STAMINA; })).toBe(true);
  });

  it("will not ride out on a gutted screen", () => {
    const cap = 600 * MERCENARIES.CAP_RATIO; // cavalry only — footmen are cleared
    expect(sallied((p) => {
      p.army.mercenaries.cavalry.heavy = Math.floor(cap * SORTIE.MIN_SCREEN) - 1;
    })).toBe(false);
    expect(sallied((p) => {
      p.army.mercenaries.cavalry.heavy = Math.ceil(cap * SORTIE.MIN_SCREEN) + 1;
    })).toBe(true);
  });

  it("counts only the arms that ride out — archer sellswords do not qualify", () => {
    // A garrison flush with hired bowmen but with no riders to spare is exactly
    // the case the screen gate exists to stop: the bowmen stay on the parapet
    // and cushion nothing.
    expect(sallied((p) => {
      p.army.mercenaries.cavalry.heavy = 0;
      p.army.archers.heavy = 600;
      p.army.mercenaries.archers.heavy = Math.floor(600 * MERCENARIES.CAP_RATIO);
    })).toBe(false);
  });
});
