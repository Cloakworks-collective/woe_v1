import { describe, expect, it } from "vitest";
import { CLAN_BEACON, TICKS_PER_HOUR } from "../constants";
import { beaconGraceHours } from "../constants/clans";
import { atWar, declareWar, newClan, normalizeClan, warIsHot, worksLevel } from "./clanOps";
import { newEmpire } from "./newEmpire";
import type { Clan } from "./types";

const clanOf = (id: string, beaconLevel = 0): Clan => {
  const c = newClan(id, id, newEmpire({ id: `${id}-leader`, name: id, race: "human" }));
  c.buildings.beaconLevel = beaconLevel;
  return c;
};

const H = TICKS_PER_HOUR;

describe("the Clan Beacon — grace before the war turns lethal", () => {
  it("grants 6h with no Beacon, then 12 / 18 / 24", () => {
    expect(beaconGraceHours(0)).toBe(6);
    expect(beaconGraceHours(1)).toBe(12);
    expect(beaconGraceHours(2)).toBe(18);
    expect(beaconGraceHours(3)).toBe(24);
  });

  it("caps at 24h even if the level ladder is later extended", () => {
    expect(beaconGraceHours(99)).toBe(CLAN_BEACON.MAX_GRACE_HOURS);
  });

  it("holds war rules off until the DEFENDER's grace expires", () => {
    const a = clanOf("a"); // 6h
    const b = clanOf("b", 3); // 24h
    const { clan: A, target: B } = declareWar(a, b, 1000);

    // Blows against B stay peaceful for a full day…
    expect(warIsHot(A, B, 1000 + 23 * H)).toBe(false);
    expect(warIsHot(A, B, 1000 + 24 * H)).toBe(true);
    // …while blows against A turn lethal after only six hours.
    expect(warIsHot(B, A, 1000 + 5 * H)).toBe(false);
    expect(warIsHot(B, A, 1000 + 6 * H)).toBe(true);
  });

  it("gives the taller Beacon an 18-hour one-sided window", () => {
    const { clan: A, target: B } = declareWar(clanOf("a"), clanOf("b", 3), 0);
    let oneSided = 0;
    for (let h = 0; h < 30; h++) {
      const bHitsA = warIsHot(B, A, h * H); // B striking at war rates
      const aHitsB = warIsHot(A, B, h * H); // A unable to answer in kind
      if (bHitsA && !aHitsB) oneSided++;
    }
    expect(oneSided).toBe(18); // hours 6–23
  });

  it("is symmetric when both sides have the same Beacon", () => {
    const { clan: A, target: B } = declareWar(clanOf("a", 2), clanOf("b", 2), 0);
    for (const h of [0, 5, 17, 18, 25]) {
      expect(warIsHot(A, B, h * H)).toBe(warIsHot(B, A, h * H));
    }
  });

  it("treats a war with no declaration tick (pre-Beacon save) as long hot", () => {
    const a = clanOf("a");
    const b = clanOf("b", 3);
    a.wars.push({ clanId: b.id, regularKills: 0, regularLosses: 0 }); // legacy shape
    expect(warIsHot(a, b, 0)).toBe(true);
  });

  it("is not hot at all when the clans are not at war", () => {
    expect(warIsHot(clanOf("a"), clanOf("b"), 999_999)).toBe(false);
  });
});

describe("declaring war arms BOTH banners", () => {
  it("the target is at war with its aggressor from the moment it is declared", () => {
    const { clan: A, target: B } = declareWar(clanOf("a"), clanOf("b"), 500);
    // Previously only the declarer's list got an entry, so the defender could
    // not clan-bombard back until the first blow landed.
    expect(atWar(A, B)).toBe(true);
    expect(atWar(B, A)).toBe(true);
    expect(B.wars[0].declaredAtTick).toBe(500);
    expect(A.wars[0].declaredAtTick).toBe(B.wars[0].declaredAtTick);
  });

  it("clears both friendly lists", () => {
    const a = clanOf("a");
    const b = clanOf("b");
    a.friendly.push(b.id);
    b.friendly.push(a.id);
    const { clan: A, target: B } = declareWar(a, b, 1);
    expect(A.friendly).not.toContain(B.id);
    expect(B.friendly).not.toContain(A.id);
  });
});

describe("legacy clans", () => {
  it("normalize into the Beacon shape without a level or integrity", () => {
    const c = clanOf("old");
    delete (c.buildings as Partial<typeof c.buildings>).beaconLevel;
    delete (c.buildings.integrity as Partial<typeof c.buildings.integrity>).beacon;
    normalizeClan(c);
    expect(c.buildings.beaconLevel).toBe(0);
    expect(c.buildings.integrity.beacon).toBe(1);
    expect(worksLevel(c, "beacon")).toBe(0);
  });
});
