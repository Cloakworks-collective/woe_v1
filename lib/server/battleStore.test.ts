import { describe, expect, it } from "vitest";
import { pushBattle, loadBattle } from "./store";
import { seedWorld } from "./world";
import type { BattleReport } from "../engine";

/** A report with the two heavy limbs a real one carries. */
const report = (id: string): BattleReport =>
  ({
    id,
    tick: 100,
    attackerId: "a",
    attackerName: "A",
    defenderId: "d",
    defenderName: "D",
    mode: "raid",
    rounds: 1,
    victor: "attacker",
    attackerLosses: { footmen: 0, archers: 0, cavalry: 0, engineers: 0, mercenaries: 3, mercenariesDisbanded: 0 },
    defenderLosses: { footmen: 1, archers: 0, cavalry: 0, engineers: 0, mercenaries: 9, mercenariesDisbanded: 0 },
    regularsKilled: { attacker: 1, defender: 0 },
    civiliansDisplaced: 0,
    wallIntegrityDamage: 0,
    siegeGearLost: {},
    log: [
      { round: 1, phase: "archers", text: "The volleys go out across the open — 4 of theirs fall to arrows, 2 of ours." },
      { round: 1, phase: "aftermath", text: "The lines draw apart." },
    ],
    loot: { gold: 1_000, resources: { food: 0, wood: 0, stone: 0, ore: 0 } },
    staminaLoss: { attacker: 10, defender: 12 },
  }) as unknown as BattleReport;

describe("battle reports ride outside the world doc", () => {
  it("the doc keeps a light entry; the full report queues for the side store", () => {
    const world = seedWorld();
    const heavy = report("11111111-1111-1111-1111-111111111111");
    pushBattle(world, heavy);

    // The world doc's copy has no prose and no muster roll — those two limbs
    // are why 300 reports used to weigh megabytes inside a doc every page
    // reads and every command rewrites.
    const filed = world.battles[0];
    expect(filed.id).toBe(heavy.id);
    expect(filed.log).toEqual([]);
    expect(filed.forces).toBeUndefined();
    // …but everything the chronicle and the ladder read is intact.
    expect(filed.victor).toBe("attacker");
    expect(filed.loot.gold).toBe(1_000);

    // The full report is queued, untouched, for the flush that rides the next
    // saveWorld — the same request that filed the battle.
    const g = globalThis as unknown as { __woePendingBattles?: BattleReport[] };
    const queued = g.__woePendingBattles?.find((b) => b.id === heavy.id);
    expect(queued?.log).toHaveLength(2);
    g.__woePendingBattles = [];
  });

  it("loadBattle falls back to the in-doc entry when no side doc exists", async () => {
    // Old worlds carry their reports whole inside the doc; a report filed
    // before the split must keep rendering from exactly where it always was.
    const world = seedWorld();
    world.battles.unshift(report("22222222-2222-2222-2222-222222222222"));
    const found = await loadBattle(world, "22222222-2222-2222-2222-222222222222");
    expect(found?.log).toHaveLength(2);
  });

  it("refuses an id that could not have been ours", async () => {
    const world = seedWorld();
    // Path-shaped ids never reach a filename or a row id — the lookup answers
    // only from the doc for those.
    const found = await loadBattle(world, "../../etc/passwd");
    expect(found).toBeUndefined();
  });
});
