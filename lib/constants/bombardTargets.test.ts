import { describe, expect, it } from "vitest";
import { BOMBARDABLE } from "./battleBalance";
import { COUNTED_BUILDING_IDS, type BuildingId } from "./buildings";

// A bombard burns the TOWN, never the army. These lock the design rule so it
// cannot drift: adding a building to BOMBARDABLE is a deliberate act, and the
// immune list is not a matter of taste.

/** War yards. Shelling may not disarm an empire — you break an army by killing
 *  it, not by cracking the sheds that built it. */
const WAR_YARDS: BuildingId[] = [
  "drill_yard",
  "fletchers_range",
  "knights_stables",
  "forge",
  "war_foundry",
];

/** Spies and scouts. Intel is its own game; blinding someone from outside the
 *  walls would gut it. */
const INTEL: BuildingId[] = ["shadow_guild", "rangers_lodge"];

describe("bombard targets", () => {
  const ids = BOMBARDABLE.map((b) => b.id);

  it("hits the civilian economy: stores, producers, Collegium, Market Square", () => {
    expect([...ids].sort()).toEqual(
      [
        // stores
        "granary", "timberyard", "masons_yard", "ironhold", "counting_house",
        // producers
        "grange", "masons_quarry", "deepvein_mine", "sawyers_mill",
        // knowledge & trade
        "collegium", "market_square",
      ].sort(),
    );
  });

  it("never touches the war yards", () => {
    expect(WAR_YARDS.filter((id) => ids.includes(id))).toEqual([]);
  });

  it("never touches the spy and scout houses", () => {
    expect(INTEL.filter((id) => ids.includes(id))).toEqual([]);
  });

  it("never touches peasant housing or the barracks", () => {
    // Terror already displaces civilians; their roofs are not a second lever.
    expect(COUNTED_BUILDING_IDS.filter((id) => ids.includes(id))).toEqual([]);
  });

  it("never lists the Walls — they live on wallIntegrity and gate the rest", () => {
    expect(ids).not.toContain("walls");
  });

  it("weights storages heaviest, since that is where the loot is", () => {
    const weight = (id: string) => BOMBARDABLE.find((b) => b.id === id)!.weight;
    expect(weight("granary")).toBeGreaterThan(weight("grange"));
    expect(weight("grange")).toBeGreaterThan(weight("collegium"));
    expect(weight("market_square")).toBe(weight("collegium"));
  });
});
