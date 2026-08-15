// Economy — taxes, production, food upkeep, mercenaries (spec/empire.md).
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
  WORKER_FOOD_PER_TURN,
  VACATION_TAX_FACTOR,
  VACATION_PRODUCTION_FACTOR,
  VACATION_RESEARCH_FACTOR,
  VACATION_DAYS_PER_ERA,
  VACATION_TICKS_PER_ERA,
  VACATION_REATTACK_COOLDOWN_TICKS,
  VACATION_RETURN_SHIELD_MIN_TICKS,
  VACATION_RETURN_SHIELD_TICKS,
  MERC_UPKEEP_GOLD_PER_TURN,
  MERC_PRICE_MULTIPLE,
} from "./balance";

/** The sellsword cap now lives with the rest of the battle model — it is a
 *  combat rule (regulars of an arm gate its hirelings) rather than an economic
 *  one. Re-exported here so economy callers keep one import. */
export { MERCENARIES } from "./battleBalance";
