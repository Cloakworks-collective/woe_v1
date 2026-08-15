// Siegecraft absorbed Siege Accuracy.
//
// They were split along an implementation seam — one adds to the bonus pool, the
// other moves a delivery gate — which was never a choice a player made. These
// tests hold the merge together: ONE field must now do both jobs, and every save
// written before the merge must keep the levels it paid for.

import { describe, expect, it } from "vitest";
import { MAX_FIELD_LEVEL, RESEARCH_FIELDS, SIEGE_ACCURACY } from "../constants";
import { counterBatteryDelivery, siegeBonusPool, siegeDelivery } from "./combat/model";
import { newEmpire } from "./newEmpire";
import { normalizePlayer, type Player } from "./types";
import type { ResearchField } from "../constants/research";

const fresh = (): Player => newEmpire({ id: "t", name: "T", race: "human" });

describe("the field list", () => {
  it("no longer carries a separate Siege Accuracy", () => {
    expect(RESEARCH_FIELDS.map((f) => f.id)).not.toContain("siege_accuracy");
    expect(RESEARCH_FIELDS.map((f) => f.id)).toContain("siegecraft");
  });
});

describe("Siegecraft does BOTH jobs", () => {
  it("still adds to the additive siege pool", () => {
    const p = fresh();
    const before = siegeBonusPool(p, false);
    p.research.levels.siegecraft = MAX_FIELD_LEVEL;
    expect(siegeBonusPool(p, false)).toBeGreaterThan(before);
  });

  it("now also moves the trebuchet's delivery gates", () => {
    const p = fresh();
    p.research.levels.siegecraft = 0;
    expect(siegeDelivery(p, "walls")).toBeCloseTo(SIEGE_ACCURACY.walls.from, 6);
    expect(siegeDelivery(p, "buildings")).toBeCloseTo(SIEGE_ACCURACY.buildings.from, 6);
    expect(counterBatteryDelivery(p)).toBeCloseTo(SIEGE_ACCURACY.counterBattery.from, 6);

    p.research.levels.siegecraft = MAX_FIELD_LEVEL;
    expect(siegeDelivery(p, "walls")).toBeCloseTo(SIEGE_ACCURACY.walls.to, 6);
    expect(siegeDelivery(p, "buildings")).toBeCloseTo(SIEGE_ACCURACY.buildings.to, 6);
    expect(siegeDelivery(p, "siege")).toBeCloseTo(SIEGE_ACCURACY.siege.to, 6);
    expect(counterBatteryDelivery(p)).toBeCloseTo(SIEGE_ACCURACY.counterBattery.to, 6);
  });

  it("interpolates in between rather than switching at mastery", () => {
    const p = fresh();
    p.research.levels.siegecraft = Math.floor(MAX_FIELD_LEVEL / 2);
    const mid = siegeDelivery(p, "walls");
    expect(mid).toBeGreaterThan(SIEGE_ACCURACY.walls.from);
    expect(mid).toBeLessThan(SIEGE_ACCURACY.walls.to);
  });
});

describe("old saves keep what they paid for", () => {
  /** A save written before the merge. */
  const legacy = (siegecraft: number, accuracy: number): Player => {
    const p = fresh();
    p.research.levels.siegecraft = siegecraft;
    (p.research.levels as Record<string, number>).siege_accuracy = accuracy;
    return p;
  };

  it("sums the two ladders — the price was global and progressive", () => {
    // MAX_FIELD_LEVEL is 5, so pick a pair that fits under it: the point is that
    // the levels ADD rather than the larger one winning.
    const p = normalizePlayer(legacy(1, 3));
    expect(p.research.levels.siegecraft).toBe(4);
    expect((p.research.levels as Record<string, number>).siege_accuracy).toBeUndefined();
  });

  it("clamps the overflow when both ladders were already high", () => {
    // Unavoidable when two ladders become one. Summing-then-capping is still the
    // generous reading — max() would have cost this player two levels.
    const p = normalizePlayer(legacy(4, 4));
    expect(p.research.levels.siegecraft).toBe(MAX_FIELD_LEVEL);
  });

  it("caps at the field maximum", () => {
    const p = normalizePlayer(legacy(MAX_FIELD_LEVEL, MAX_FIELD_LEVEL));
    expect(p.research.levels.siegecraft).toBe(MAX_FIELD_LEVEL);
  });

  it("carries banked points across instead of dropping them", () => {
    const p = fresh();
    p.research.banked.siegecraft = 100;
    (p.research.banked as Record<string, number>).siege_accuracy = 250;
    normalizePlayer(p);
    expect(p.research.banked.siegecraft).toBe(350);
    expect((p.research.banked as Record<string, number>).siege_accuracy).toBeUndefined();
  });

  it("re-points a scholar who was studying the retired field", () => {
    const p = fresh();
    p.research.activeField = "siege_accuracy" as ResearchField;
    normalizePlayer(p);
    expect(p.research.activeField).toBe("siegecraft");
  });

  it("is idempotent — a second pass is a no-op", () => {
    const p = normalizePlayer(legacy(2, 3));
    const once = p.research.levels.siegecraft;
    normalizePlayer(p);
    expect(p.research.levels.siegecraft).toBe(once);
  });

  it("leaves a save that never had the field alone", () => {
    const p = fresh();
    p.research.levels.siegecraft = 4;
    normalizePlayer(p);
    expect(p.research.levels.siegecraft).toBe(4);
  });
});
