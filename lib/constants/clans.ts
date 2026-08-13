// Clans — leadership, buildings, wars, churn (spec/clans.md).
// All numbers live in balance.ts — THE tuning file; BUILD_COSTS below is a
// thin derived accessor over the pure-data CLAN_BUILD_COSTS.

import { CLAN_BEACON, CLAN_BUILD_COSTS } from "./balance";

export {
  CLAN_BEACON,
  LEADERSHIP,
  STORAGE_CAP_PER_LEVEL,
  WITHDRAW_MULTIPLE,
  HALL,
  WONDER_DISCOUNT_PER_LEVEL,
  WONDER_MAX_LEVEL,
  WONDER_REQUIRES_STORAGE,
  CLAN_REPAIR_COST_FACTOR,
  CLAN_BUILD_COSTS,
  FOUNDING_MEMBERS,
  WAR,
  CHURN,
  CHAT,
  CHAT_LIMITS,
  CLAN_MUTE_DAYS,
  CLAN_GIFT_TAX,
} from "./balance";

export type ClanWork = "storage" | "hall" | "wonder" | "beacon";

/** Which of the three art stages a clan work wears at a given level, so the
 *  banner's holdings visibly grow as the pool is poured into them. Each work
 *  has its own ladder length (storage 1–10, hall 1–4, wonder 1–3). */
export function clanArtStage(which: ClanWork, level: number): 1 | 2 | 3 {
  if (which === "storage") return level >= 8 ? 3 : level >= 4 ? 2 : 1;
  if (which === "hall") return level >= 4 ? 3 : level >= 2 ? 2 : 1;
  return level >= 3 ? 3 : level >= 2 ? 2 : 1; // wonder and beacon: 1–3
}

/** Build costs per level (gold, each = wood/stone/ore) — the shape the engine
 *  and UI consume; the underlying numbers are CLAN_BUILD_COSTS in balance.ts. */
export const BUILD_COSTS = {
  storage: (level: number) => ({
    gold: CLAN_BUILD_COSTS.storagePerLevel.gold * level,
    each: CLAN_BUILD_COSTS.storagePerLevel.each * level,
  }),
  beacon: CLAN_BUILD_COSTS.beacon,
  hall: CLAN_BUILD_COSTS.hall,
  wonder: CLAN_BUILD_COSTS.wonder,
};

/** Hours of peacetime grace this clan's members get after war is declared on
 *  them — 6h with no Beacon, +6h a level, hard-capped. See CLAN_BEACON. */
export function beaconGraceHours(beaconLevel: number): number {
  return Math.min(
    CLAN_BEACON.MAX_GRACE_HOURS,
    CLAN_BEACON.BASE_GRACE_HOURS + CLAN_BEACON.GRACE_HOURS_PER_LEVEL * Math.max(0, beaconLevel),
  );
}
