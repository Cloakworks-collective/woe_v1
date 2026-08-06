// Economy — taxes, production, food upkeep, mercenaries (spec/economy.md).
// All numbers live in balance.ts — THE tuning file. This module re-exports the
// economy section so engine imports stay short and domain-grouped.

export {
  TURN_MINUTES,
  TURNS_PER_DAY,
  TICKS_PER_HOUR,
  GOLD_PER_CIVILIAN_AT_FULL_TAX,
  WORKER_OUTPUT_CURVE,
  DEFAULT_TAX_RATE,
  FOOD_UPKEEP_PER_PERSON,
  VACATION_TAX_FACTOR,
  VACATION_PRODUCTION_FACTOR,
  VACATION_DAYS_PER_ERA,
  VACATION_TICKS_PER_ERA,
  VACATION_REATTACK_COOLDOWN_TICKS,
  MERC_UPKEEP_GOLD_PER_TURN,
  MERC_CAP_RATIO,
  MERC_PRICE_GOLD,
} from "./balance";
