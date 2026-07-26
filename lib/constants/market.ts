// The Grand Bazaar (spec/market.md) — anonymous, sell-only at launch.

/** Caravan capacity per merchant = 1,000 × Market Square level. */
export const CARAVAN_CAPACITY_PER_MARKET_LEVEL = 1000;

/** Fee on every sale, paid by the seller, burned. Set 0 to disable. */
export const MARKET_FEE = 0.05;

/** Ask prices are whole gold per unit, bounded to this band (spec/market.md). */
export const MARKET_PRICE_MIN = 2;
export const MARKET_PRICE_MAX = 50;
