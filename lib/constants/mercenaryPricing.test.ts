import { describe, expect, it } from "vitest";
import { MERC_PRICE_BY_ARM, MERC_PRICE_MULTIPLE, TRAINING_COSTS } from "./balance";

// MERC_PRICE_BY_ARM is written out as literal numbers so a per-era layer can
// override one arm without touching the rest. The cost of that freedom is that
// it can drift from TRAINING_COSTS silently — and it did: the line troops were
// repriced and these were not, leaving a footman at 9x its raised cost and a
// horseman at 5.8x. Hiring foot became the worst deal on the board and hiring
// horse the best, inverting the raised-troop ordering, and nothing caught it.

/** MERC_PRICE_BY_ARM keys the engine's arm names; TRAINING_COSTS keys the
 *  trainable ones. Only this pairing differs. */
const RAISED: Record<keyof typeof MERC_PRICE_BY_ARM, keyof typeof TRAINING_COSTS> = {
  footman: "footman",
  archer: "archer",
  cavalry: "cavalry",
  engineer: "siegeEngineer",
  spy: "spy",
  scout: "scout",
};

describe("sellswords are priced off the troops they replace", () => {
  it("costs exactly the multiple, for every arm", () => {
    for (const [arm, raised] of Object.entries(RAISED) as [
      keyof typeof MERC_PRICE_BY_ARM,
      keyof typeof TRAINING_COSTS,
    ][]) {
      const expected = TRAINING_COSTS[raised].gold * MERC_PRICE_MULTIPLE;
      expect(MERC_PRICE_BY_ARM[arm], `${arm}: hiring should be ${MERC_PRICE_MULTIPLE}× raising`).toBe(
        expected,
      );
    }
  });

  it("keeps hiring in the same ORDER as raising", () => {
    // Whatever the multiple, the cheap arm to raise must stay the cheap arm to
    // hire. This is the property that actually broke, and it would survive a
    // future era setting a bespoke price for one arm — which the exact check
    // above would not.
    const arms = ["footman", "archer", "cavalry"] as const;
    const byRaised = [...arms].sort((a, b) => TRAINING_COSTS[a].gold - TRAINING_COSTS[b].gold);
    const byHired = [...arms].sort((a, b) => MERC_PRICE_BY_ARM[a] - MERC_PRICE_BY_ARM[b]);
    expect(byHired).toEqual(byRaised);
  });

  it("never makes a sellsword cheaper than the soldier it replaces", () => {
    // Mercenaries skip population and training time entirely. If they were ever
    // cheaper in gold too there would be no reason to raise anyone.
    for (const [arm, raised] of Object.entries(RAISED) as [
      keyof typeof MERC_PRICE_BY_ARM,
      keyof typeof TRAINING_COSTS,
    ][]) {
      expect(MERC_PRICE_BY_ARM[arm]).toBeGreaterThan(TRAINING_COSTS[raised].gold);
    }
  });
});
