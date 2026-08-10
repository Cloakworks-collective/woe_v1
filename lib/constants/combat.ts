// Combat constants — the surface `lib/constants` presents to the engine.
// Every number lives in battleBalance.ts (THE battle tuning file); this file
// only decides what is visible and pulls in the few battle-adjacent knobs that
// still belong to the general balance file.

export * from "./battleBalance";

export {
  ACTION_TURNS,
  WALL_REPAIR_COST_FACTOR,
  SCATTERING,
  ATTACK_HISTORY_TICKS,
  MERC_UPKEEP_GOLD_PER_TURN,
  MERC_PRICE_GOLD,
  MERC_PRICE_BY_ARM,
  TIER_COST_MULT,
  TRAINING_COSTS,
} from "./balance";
