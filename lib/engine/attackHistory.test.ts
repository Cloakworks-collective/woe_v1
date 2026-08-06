import { describe, expect, it } from "vitest";
import { ATTACK_HISTORY_TICKS, TICKS_PER_HOUR } from "../constants";
import { attacksByDefender, summarizeAttackers } from "./reports";
import type { BattleReport, UnitLosses } from "./types";

const noLosses: UnitLosses = { footmen: 0, archers: 0, cavalry: 0, engineers: 0, mercenaries: 0 };

function battle(
  attackerId: string,
  defenderId: string,
  tick: number,
  mode = "raid",
  yielded = false,
): BattleReport {
  return {
    id: `${attackerId}-${defenderId}-${tick}`,
    tick,
    attackerId,
    attackerName: attackerId.toUpperCase(),
    defenderId,
    defenderName: defenderId.toUpperCase(),
    mode: mode as BattleReport["mode"],
    rounds: 3,
    victor: "attacker",
    yielded,
    attackerLosses: { ...noLosses },
    defenderLosses: { ...noLosses },
    wallIntegrityDamage: 0,
    siegeGearLost: {},
    loot: { gold: 0, resources: { food: 0, wood: 0, stone: 0, ore: 0 } },
    staminaLoss: { attacker: 0, defender: 0 },
    experienceChange: { attacker: 0, defender: 0 },
    log: [],
  };
}

const NOW = 100_000;

describe("attacksByDefender — the public raid record", () => {
  it("groups by defender and keeps only the window", () => {
    const battles = [
      battle("bob", "jen", NOW - 10),
      battle("tim", "jen", NOW - 20),
      battle("bob", "arya", NOW - 30),
      battle("bob", "jen", NOW - ATTACK_HISTORY_TICKS - 1), // too old
    ];
    const by = attacksByDefender(battles, NOW, ATTACK_HISTORY_TICKS);
    expect(by.get("jen")).toHaveLength(2);
    expect(by.get("arya")).toHaveLength(1);
    expect(by.get("bob")).toBeUndefined(); // bob was never a defender
  });

  it("returns each defender's attackers newest-first", () => {
    const battles = [
      battle("tim", "jen", NOW - 50),
      battle("bob", "jen", NOW - 5),
      battle("arya", "jen", NOW - 30),
    ];
    const hits = attacksByDefender(battles, NOW, ATTACK_HISTORY_TICKS).get("jen")!;
    expect(hits.map((h) => h.attackerId)).toEqual(["bob", "arya", "tim"]);
  });

  it("carries the mode and the yield flag through", () => {
    const battles = [battle("bob", "jen", NOW - 5, "siege", true)];
    const [hit] = attacksByDefender(battles, NOW, ATTACK_HISTORY_TICKS).get("jen")!;
    expect(hit.mode).toBe("siege");
    expect(hit.yielded).toBe(true);
  });

  it("reaches back a full 72 hours", () => {
    const battles = [battle("bob", "jen", NOW - 71 * TICKS_PER_HOUR)];
    expect(attacksByDefender(battles, NOW, ATTACK_HISTORY_TICKS).get("jen")).toHaveLength(1);
  });
});

describe("summarizeAttackers — one row per aggressor", () => {
  it("tallies repeat attackers and ranks the worst first", () => {
    const battles = [
      battle("bob", "jen", NOW - 5),
      battle("bob", "jen", NOW - 40),
      battle("bob", "jen", NOW - 80),
      battle("tim", "jen", NOW - 10),
    ];
    const rows = summarizeAttackers(attacksByDefender(battles, NOW, ATTACK_HISTORY_TICKS).get("jen")!);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ attackerId: "bob", times: 3, lastTick: NOW - 5 });
    expect(rows[1]).toMatchObject({ attackerId: "tim", times: 1 });
  });

  it("breaks ties on recency", () => {
    const battles = [battle("bob", "jen", NOW - 90), battle("tim", "jen", NOW - 5)];
    const rows = summarizeAttackers(attacksByDefender(battles, NOW, ATTACK_HISTORY_TICKS).get("jen")!);
    expect(rows[0].attackerId).toBe("tim"); // same count, struck more recently
  });

  it("is empty for an empire nobody has touched", () => {
    expect(summarizeAttackers([])).toEqual([]);
  });
});
