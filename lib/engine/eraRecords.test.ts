import { describe, expect, it } from "vitest";
import { newEraRecords, recordBattle, topFeuds, topWars, clanCode } from "./eraRecords";
import type { BattleReport, UnitLosses } from "./types";

const noLoss: UnitLosses = {
  footmen: 0,
  archers: 0,
  cavalry: 0,
  engineers: 0,
  mercenaries: 0, mercenariesDisbanded: 0,
};

function report(over: Partial<BattleReport>): BattleReport {
  return {
    id: "b",
    tick: 1,
    attackerId: "a",
    attackerName: "Attila",
    defenderId: "d",
    defenderName: "Defender",
    mode: "siege",
    rounds: 1,
    victor: "attacker",
    attackerLosses: { ...noLoss },
    defenderLosses: { ...noLoss },
    regularsKilled: { attacker: 0, defender: 0 },
  civiliansDisplaced: 0,
  wallIntegrityDamage: 0,
    siegeGearLost: {},
    loot: { gold: 0, resources: { food: 0, wood: 0, stone: 0, ore: 0 } },
    staminaLoss: { attacker: 0, defender: 0 },
    experienceChange: { attacker: 0, defender: 0 },
    log: [],
    ...over,
  };
}

describe("era war records", () => {
  it("ranks richest attacks by gold, keeps the top order", () => {
    const rec = newEraRecords();
    recordBattle(rec, report({ loot: { gold: 100, resources: { food: 0, wood: 0, stone: 0, ore: 0 } } }), {
      attackerId: "a",
      defenderId: "d",
    });
    recordBattle(rec, report({ loot: { gold: 900, resources: { food: 0, wood: 0, stone: 0, ore: 0 } } }), {
      attackerId: "a",
      defenderId: "d",
    });
    expect(rec.richestAttacks.map((r) => r.value)).toEqual([900, 100]);
  });

  it("ranks richest raids by total resources", () => {
    const rec = newEraRecords();
    recordBattle(rec, report({ loot: { gold: 0, resources: { food: 5, wood: 5, stone: 5, ore: 5 } } }), {
      attackerId: "a",
      defenderId: "d",
    });
    expect(rec.richestRaids[0].value).toBe(20);
    expect(rec.richestAttacks).toHaveLength(0); // no gold → not an "attack"
  });

  it("tallies bloodiest attacks from both sides", () => {
    const rec = newEraRecords();
    recordBattle(
      rec,
      report({
        attackerLosses: { ...noLoss, footmen: 30 },
        defenderLosses: { ...noLoss, archers: 20 },
      }),
      { attackerId: "a", defenderId: "d" },
    );
    const row = rec.bloodiestAttacks[0];
    expect(row.atkLost).toBe(30);
    expect(row.defLost).toBe(20);
    expect(row.value).toBe(50);
  });

  it("accumulates a feud across repeated clashes between two rulers", () => {
    const rec = newEraRecords();
    for (let i = 0; i < 3; i++) {
      recordBattle(
        rec,
        report({
          attackerLosses: { ...noLoss, footmen: 10 },
          defenderLosses: { ...noLoss, footmen: 5 },
        }),
        { attackerId: "a", defenderId: "d" },
      );
    }
    const feud = topFeuds(rec)[0];
    expect(feud.total).toBe(45); // (10 + 5) × 3
  });

  it("records a war only between two different banners, regulars only", () => {
    const rec = newEraRecords();
    recordBattle(
      rec,
      report({
        attackerLosses: { ...noLoss, mercenaries: 100 }, // mercs don't count
        defenderLosses: { ...noLoss, footmen: 40 },
      }),
      { attackerId: "a", attackerClanName: "Iron Pact", defenderId: "d", defenderClanName: "Sky Wolves" },
    );
    const war = topWars(rec)[0];
    expect(war.total).toBe(40); // 40 regulars felled, mercenaries excluded
  });

  it("does not open a war between members of the same banner", () => {
    const rec = newEraRecords();
    recordBattle(
      rec,
      report({ defenderLosses: { ...noLoss, footmen: 40 } }),
      { attackerId: "a", attackerClanName: "Iron Pact", defenderId: "d", defenderClanName: "Iron Pact" },
    );
    expect(topWars(rec)).toHaveLength(0);
  });

  it("derives a banner code from a clan name", () => {
    expect(clanCode("The Iron Pact")).toBe("IP");
    expect(clanCode("Valhalla")).toBe("VALH");
    expect(clanCode(undefined)).toBe("");
  });
});
