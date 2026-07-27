// Clans — leadership, buildings, wars, churn (spec/clans.md).
// All numbers live in balance.ts — THE tuning file; BUILD_COSTS below is a
// thin derived accessor over the pure-data CLAN_BUILD_COSTS.

import { CLAN_BUILD_COSTS } from "./balance";

export {
  LEADERSHIP,
  STORAGE_CAP_PER_LEVEL,
  WITHDRAW_MULTIPLE,
  HALL,
  WONDER_DISCOUNT_PER_LEVEL,
  WONDER_REQUIRES_STORAGE,
  CLAN_BUILD_COSTS,
  FOUNDING_MEMBERS,
  WAR,
  CHURN,
} from "./balance";

/** Build costs per level (gold, each = wood/stone/ore) — the shape the engine
 *  and UI consume; the underlying numbers are CLAN_BUILD_COSTS in balance.ts. */
export const BUILD_COSTS = {
  storage: (level: number) => ({
    gold: CLAN_BUILD_COSTS.storagePerLevel.gold * level,
    each: CLAN_BUILD_COSTS.storagePerLevel.each * level,
  }),
  hall: CLAN_BUILD_COSTS.hall,
  wonder: CLAN_BUILD_COSTS.wonder,
};
