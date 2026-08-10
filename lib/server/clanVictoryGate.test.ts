import { describe, expect, it } from "vitest";
import { ARMY_FLOORS, WONDER_MAX_LEVEL } from "../constants";
import { newClan, newEmpire } from "../engine";
import { seedWorld, updateCrown } from "./world";
import type { World } from "./store";

// The clan clock has TWO gates. The army floor proves the banner can fight;
// the Wonder proves it can build — and it is the most expensive thing in the
// game, gated behind Clan Storage 10, so it cannot be rushed in an afternoon.
function worldWithClan(regulars: number, wonderLevel: number): World {
  const w = seedWorld();
  const leader = newEmpire({ id: "L", name: "Leader", race: "human" });
  leader.army.footmen = { light: regulars, medium: 0, heavy: 0 };
  leader.idlePeasants = 50_000; // top the ladder outright
  const clan = newClan("c1", "The Banner", leader);
  clan.buildings.wonderLevel = wonderLevel;
  leader.clanId = clan.id;
  leader.everJoinedClan = true;
  w.players = { L: leader };
  w.clans = { c1: clan };
  return w;
}

const accruing = (w: World) => {
  updateCrown(w, 1_000);
  return w.meta.clanAccruing?.id ?? null;
};

describe("the clan victory clock", () => {
  it("does not start without a completed Wonder, however large the army", () => {
    for (const lvl of [0, 1, 2]) {
      const w = worldWithClan(ARMY_FLOORS.CLAN + 5_000, lvl);
      expect(accruing(w), `wonder ${lvl}`).toBeNull();
    }
  });

  it("starts once the Wonder is finished and the army floor is met", () => {
    const w = worldWithClan(ARMY_FLOORS.CLAN + 100, WONDER_MAX_LEVEL);
    expect(accruing(w)).toBe("c1");
  });

  it("still needs the army — a Wonder alone is not enough", () => {
    const w = worldWithClan(10, WONDER_MAX_LEVEL);
    expect(accruing(w)).toBeNull();
  });
});
