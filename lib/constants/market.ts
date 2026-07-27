// The Grand Bazaar (spec/market.md) — anonymous, sell-only at launch.

/** Caravan capacity per merchant = 1,000 × Market Square level. */
export const CARAVAN_CAPACITY_PER_MARKET_LEVEL = 1000;

/**
 * A posted caravan doesn't hit the Bazaar instantly — it must travel there, and
 * a bigger Market Square keeps faster roads and runners. Delivery time falls
 * linearly with the Market Square level: level 1 → 100 turns, level 10 → 10.
 * Goods aren't buyable (and don't count toward supply or price) until they
 * arrive. `caravanDeliveryTurns(level)` = CARAVAN_DELIVERY_BASE − level × step.
 */
export const CARAVAN_DELIVERY_BASE = 110; // turns, before the per-level subtraction
export const CARAVAN_DELIVERY_PER_LEVEL = 10; // turns shaved off per Market Square level
export const CARAVAN_DELIVERY_MIN_TURNS = 10; // floor (reached at level 10)

/** Fee on every sale, paid by the seller, burned. Set 0 to disable. */
export const MARKET_FEE = 0.05;

/** Ask prices are whole gold per unit, bounded to this band (spec/market.md). */
export const MARKET_PRICE_MIN = 2;
export const MARKET_PRICE_MAX = 50;
