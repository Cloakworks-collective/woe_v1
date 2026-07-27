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

/** Research points per researcher per turn at 0% tax (the Collegium still caps
 *  researcher slots at 20 × level — see research.md). */
export const OUTPUT_PER_PRODUCER_AT_ZERO_TAX = 20;

/**
 * Resource-production model (spec/economy.md): the production buildings (Grange,
 * Mason's Quarry, Deepvein Mine, Sawyer's Mill) do NOT cap worker slots — you may
 * assign as many farmers/quarrymen/miners/lumberjacks as your population allows.
 * Instead, each **building level lifts every worker's output**: a worker makes
 * `PRODUCTION_PER_WORKER_PER_LEVEL × building level` units per turn at 0% tax —
 * 50/turn at level 1, up to 500/turn at level 10. (Tunable placeholder.)
 */
export const PRODUCTION_PER_WORKER_PER_LEVEL = 50;

export const DEFAULT_TAX_RATE = 0.5;

/** Food consumed per person (civilians + regular troops) per turn. */
export const FOOD_UPKEEP_PER_PERSON = 0.1;

/** Surrendered empires earn half tax income. */
export const SURRENDER_TAX_FACTOR = 0.5;
/** …and produce at half output — the town goes dormant under the white flag. */
export const SURRENDER_PRODUCTION_FACTOR = 0.5;
/** A player may spend at most this many days surrendered per era (cumulative);
 *  once spent, the flag can't be raised again until the era wipes. */
export const SURRENDER_DAYS_PER_ERA = 20;
export const SURRENDER_TICKS_PER_ERA = SURRENDER_DAYS_PER_ERA * TURNS_PER_DAY;
/** After the white flag comes down, no fresh attacks for this long — you can't
 *  duck a siege under surrender and immediately swing back (revenge exempt). */
export const SURRENDER_REATTACK_COOLDOWN_TICKS = 18 * TICKS_PER_HOUR;

// Mercenaries — one merc's upkeep ≈ five civilians' net income: a premium.
export const MERC_UPKEEP_GOLD_PER_TURN = 1; // unpaid mercs all defect at once
export const MERC_CAP_RATIO = 0.25; // max 25% of regular army headcount
export const MERC_PRICE_GOLD = 500; // × race mercCost × wonder discount
