import { describe, expect, it } from "vitest";
import { buildEraTables } from "./eraTables";
import { seedWorld } from "./world";
import type { World } from "./store";
import {
  newEmpire,
  newEraRecords,
  recordGiftFeat,
  recordSaleFeat,
  recordSpyFeat,
  featOf,
  type BattleReport,
  type EraRecords,
} from "../engine";
import { recordBattle } from "../engine";

function tableByTitle(w: World, title: string) {
  return buildEraTables(w).find((t) => t.title === title);
}

function baseReport(over: Partial<BattleReport>): BattleReport {
  return {
    id: "r",
    tick: 1,
    attackerId: "A",
    attackerName: "Alpha",
    defenderId: "B",
    defenderName: "Beta",
    mode: "raid",
    rounds: 2,
    victor: "attacker",
    attackerLosses: { footmen: 0, archers: 0, cavalry: 0, engineers: 0, mercenaries: 0, mercenariesDisbanded: 0 },
    defenderLosses: { footmen: 0, archers: 0, cavalry: 0, engineers: 0, mercenaries: 0, mercenariesDisbanded: 0 },
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

describe("expanded War Records (spec/overview.md)", () => {
  it("recordBattle folds lifetime feats for both sides", () => {
    const rec: EraRecords = newEraRecords();
    const r = baseReport({
      defenderLosses: { footmen: 10, archers: 5, cavalry: 0, engineers: 0, mercenaries: 3, mercenariesDisbanded: 0 },
      attackerLosses: { footmen: 2, archers: 0, cavalry: 0, engineers: 1, mercenaries: 0, mercenariesDisbanded: 0 },
      loot: { gold: 5000, resources: { food: 100, wood: 200, stone: 0, ore: 0 } },
      wallIntegrityDamage: 0.5,
      buildingDamage: [{ building: "granary", integrityLost: 0.2 }],
    });
    recordBattle(rec, r, { attackerId: "A", defenderId: "B" });

    const af = rec.feats!.A;
    expect(af.defendersKilled).toBe(15); // regulars only (mercs excluded)
    expect(af.goldWon).toBe(5000);
    expect(af.resourcesWon).toBe(300);
    expect(af.siegeDamage).toBe(70); // (0.5 + 0.2) * 100
    expect(rec.feats!.B.attackersKilled).toBe(3); // 2 footmen + 1 engineer
  });

  it("spy / market / gift feats accumulate", () => {
    const rec = newEraRecords();
    recordSpyFeat(rec, "A", "Alpha", "AL", { resourcesDestroyed: 900, gearDestroyed: 12 });
    recordSaleFeat(rec, "A", "Alpha", "AL", 4200);
    recordGiftFeat(rec, "A", "Alpha", "AL", "gold", 1000);
    recordGiftFeat(rec, "A", "Alpha", "AL", "ore", 500);
    const f = featOf(rec, "A", "Alpha", "AL");
    expect(f.resourcesDestroyed).toBe(900);
    expect(f.spyDamage).toBe(12);
    expect(f.marketSales).toBe(4200);
    expect(f.goldGiven).toBe(1000);
    expect(f.resourcesGiven).toBe(500);
  });

  it("buildEraTables crowns a champion per feat with an epithet", () => {
    const w = seedWorld();
    const a = newEmpire({ id: "A", name: "Alpha", race: "orc" });
    const b = newEmpire({ id: "B", name: "Beta", race: "elf" });
    w.players = { A: a, B: b };
    w.clans = {};
    const rec = (w.eraRecords = newEraRecords());
    recordBattle(
      rec,
      baseReport({ loot: { gold: 9999, resources: { food: 0, wood: 0, stone: 0, ore: 0 } } }),
      { attackerId: "A", defenderId: "B" },
    );

    const champs = tableByTitle(w, "Champions of the Realms");
    expect(champs).toBeDefined();
    const plunderer = champs!.rows.find((r) => String(r[2]).includes("Gold won"));
    expect(plunderer?.[0]).toBe("Alpha, the Plunderer");
    expect(plunderer?.[3]).toBe("9,999");

    // Snapshot ladders are always present when empires exist.
    expect(tableByTitle(w, "Greatest Rulers")).toBeDefined();
    expect(tableByTitle(w, "Lords & Ladies of the Realm")).toBeDefined();
    // Non-Battle Titles is NOT — every civil title now requires a deed. It used
    // to appear for any world at all, because "the Populous" and "the Wealthy"
    // crowned whoever merely existed hardest; those are gone.
    expect(tableByTitle(w, "Non-Battle Titles")).toBeUndefined();
  });

  it("ranks each title ten deep, best first", () => {
    const w = seedWorld();
    w.players = {
      A: newEmpire({ id: "A", name: "Alpha", race: "orc" }),
      B: newEmpire({ id: "B", name: "Beta", race: "elf" }),
      C: newEmpire({ id: "C", name: "Gamma", race: "human" }),
    };
    w.clans = {};
    const rec = (w.eraRecords = newEraRecords());
    for (const [id, gold] of [["A", 100], ["B", 900], ["C", 500]] as const) {
      recordBattle(rec, baseReport({ loot: { gold, resources: { food: 0, wood: 0, stone: 0, ore: 0 } } }), {
        attackerId: id,
        defenderId: "B",
      });
    }
    const rows = tableByTitle(w, "Champions of the Realms")!.rows.filter((r) =>
      String(r[2]).includes("Gold won"),
    );
    // A title is a small leaderboard now, not a single name — you cannot tell
    // whether you are close to one you cannot see the shape of.
    expect(rows.map((r) => String(r[0]))).toEqual([
      "Beta, the Plunderer",
      "Gamma, the Plunderer",
      "Alpha, the Plunderer",
    ]);
  });

  it("holds the scouting-report titles anonymous until the age is sealed", () => {
    const build = (won: boolean) => {
      const w = seedWorld();
      const a = newEmpire({ id: "A", name: "Alpha", race: "orc" });
      a.research.levels = { masonry: 3 };
      w.players = { A: a };
      w.clans = {};
      w.eraRecords = newEraRecords();
      if (won) w.meta.winner = { kind: "overlord", id: "A", name: "Alpha", atTick: 1 };
      return tableByTitle(w, "Non-Battle Titles")!.rows.find((r) => String(r[2]).includes("research"));
    };

    // Live: the standing is public, the name is not — naming the empire with
    // the deepest Collegium does a research thief's scouting for them.
    const live = build(false)!;
    expect(String(live[0])).toBe(", the Wise");
    expect(live[1]).toBe("");
    expect(String(live[3])).not.toBe("");

    // Sealed: the war it could have influenced is over.
    expect(String(build(true)![0])).toBe("Alpha, the Wise");
  });
});
