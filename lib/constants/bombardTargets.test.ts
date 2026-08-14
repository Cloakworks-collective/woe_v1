import { describe, expect, it } from "vitest";
import { BOMBARDABLE, COUNTED_HP_PER_UNIT } from "./battleBalance";
import {
  CIVILIAN_LEVELLED_IDS,
  COUNTED_BUILDING_IDS,
  MILITARY_BUILDINGS,
  type BuildingId,
} from "./buildings";

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
  "armoury",
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
        // roofs — capacity, not eviction
        "hearthstead", "muster_hall",
      ].sort(),
    );
  });

  it("never touches the war yards", () => {
    expect(WAR_YARDS.filter((id) => ids.includes(id))).toEqual([]);
  });

  it("never touches the spy and scout houses", () => {
    expect(INTEL.filter((id) => ids.includes(id))).toEqual([]);
  });

  it("shells housing and the barracks for CAPACITY, never for eviction", () => {
    // These were immune on the grounds that terror already displaces civilians.
    // They are fair game because the lever turned out to be a different one:
    // shelling a roof turns nobody out, it closes the door to the next arrival.
    // The rule they must keep is enforced in dailyReset/commands, not here —
    // this only pins that the decision was made on purpose.
    expect([...COUNTED_BUILDING_IDS].sort()).toEqual([...ids].filter(
      (id) => COUNTED_BUILDING_IDS.includes(id as BuildingId),
    ).sort());
  });

  it("gives every counted structure a per-instance health, since level² is nonsense on a count", () => {
    // level() on a counted building returns HOW MANY, so the quadratic would
    // price a 240-hall barracks at fifty-seven Citadels. Linear or bust.
    for (const id of COUNTED_BUILDING_IDS) {
      expect(COUNTED_HP_PER_UNIT[id], `${id} has no per-unit health`).toBeGreaterThan(0);
    }
  });

  it("never lists the Walls — they live on wallIntegrity and gate the rest", () => {
    expect(ids).not.toContain("walls");
  });

  it("EVERY building is deliberately on one list or the other", () => {
    // The real guard. The two tests above only catch a building someone thought
    // to name; this catches the one nobody did. A new building that is neither
    // bombardable nor explicitly immune fails here, so the question has to be
    // answered when it is added rather than discovered when it is shelled.
    const all = new Set<BuildingId>([
      ...CIVILIAN_LEVELLED_IDS,
      ...MILITARY_BUILDINGS.map((b) => b.id),
      ...COUNTED_BUILDING_IDS,
    ]);
    const immune = new Set<BuildingId>([...WAR_YARDS, ...INTEL, "walls"]);
    const unaccounted = [...all].filter((id) => !ids.includes(id) && !immune.has(id));
    expect(unaccounted, `not on either list: ${unaccounted.join(", ")}`).toEqual([]);
    // …and nothing is on both.
    expect(ids.filter((id) => immune.has(id as BuildingId))).toEqual([]);
  });

  it("weights storages heaviest, since that is where the loot is", () => {
    const weight = (id: string) => BOMBARDABLE.find((b) => b.id === id)!.weight;
    expect(weight("granary")).toBeGreaterThan(weight("grange"));
    expect(weight("grange")).toBeGreaterThan(weight("collegium"));
    expect(weight("market_square")).toBe(weight("collegium"));
    // Roofs sit between: worth more of a besieger's attention than the
    // Collegium, less than a storehouse with the loot behind its doors.
    expect(weight("hearthstead")).toBeLessThan(weight("granary"));
    expect(weight("hearthstead")).toBeGreaterThan(weight("collegium"));
    expect(weight("muster_hall")).toBe(weight("hearthstead"));
  });
});
