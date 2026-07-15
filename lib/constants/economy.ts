// Economy — taxes, production, food upkeep, mercenaries (spec/economy.md).
// All values are tunable placeholders unless the spec marks them otherwise.

export const TURN_MINUTES = 10;
export const TURNS_PER_DAY = 144;
export const TICKS_PER_HOUR = 6;

/**
 * Gold per civilian per turn at 100% tax.
 * Rebalanced 40 → 0.4 (2026-07, sim-driven): at 40, an idle 100-pop empire
 * banked ~700k gold in 3 days; even at 4 the sim hoarded 5.3M by day 60 and
 * treasury was 93% of ranking score. Anchor chosen instead: one civilian at
 * 50% tax nets ~29 g/day, so a mid-game army costs DAYS of income to rebuild
 * (armies matter), the starting purse stays calibrated (buildings.md), and
 * treasury sits at a healthy few % of score. Income came down rather than
 * costs going up so every cost table in the specs holds.
 */
export const GOLD_PER_CIVILIAN_AT_FULL_TAX = 0.4;

/** Units per producer per turn at 0% tax (all producers incl. researchers). */
export const OUTPUT_PER_PRODUCER_AT_ZERO_TAX = 20;

export const DEFAULT_TAX_RATE = 0.5;

/** Food consumed per person (civilians + regular troops) per turn. */
export const FOOD_UPKEEP_PER_PERSON = 0.1;

/** Surrendered empires earn half tax income. */
export const SURRENDER_TAX_FACTOR = 0.5;

// Mercenaries — one merc's upkeep ≈ five civilians' net income: a premium.
export const MERC_UPKEEP_GOLD_PER_TURN = 1; // unpaid mercs all defect at once
export const MERC_CAP_RATIO = 0.25; // max 25% of regular army headcount
export const MERC_PRICE_GOLD = 500; // × race mercCost × wonder discount
