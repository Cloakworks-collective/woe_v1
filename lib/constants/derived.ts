// Derived curve helpers — the ONE place each curve in balance.ts is evaluated,
// so engine and UI share identical numbers. Pure functions of plain numbers;
// player-dependent modifiers (tax, integrity, race, statecraft…) are applied
// by the callers in the engine.

import {
  BUILDING_COST_CURVE,
  CARAVAN_DELIVERY_CURVE,
  CARAVAN_DELIVERY_MIN_TURNS,
  GROWTH_CURVE,
  STORAGE_SHELTER_CURVE,
  WALL_BONUS_CURVE,
  WALLS_SCORE_CURVE,
  WORKER_OUTPUT_CURVE,
} from "./balance";
import { evalCurve } from "./curves";

/** Raw settlers/day at x total civilian building levels (before wall penalty
 *  and the housing cap; the engine floors the final figure at 1). */
export function growthPerDayAt(civilianLevels: number): number {
  return evalCurve(GROWTH_CURVE, civilianLevels);
}

/** Building cost multiplier at a target level (× the building's base cost). */
export function buildingCostMultiplier(targetLevel: number): number {
  return evalCurve(BUILDING_COST_CURVE, targetLevel);
}

/** Units/turn one worker produces at 0% tax, by their building's level. */
export function workerOutputAtLevel(level: number): number {
  return evalCurve(WORKER_OUTPUT_CURVE, level);
}

/** Wall defence bonus (fraction) at a wall level, before integrity & race. */
export function wallBonusAtLevel(level: number): number {
  return evalCurve(WALL_BONUS_CURVE, level);
}

/** Walls ranking score (pts) at a wall level, before integrity. */
export function wallsScoreAtLevel(level: number): number {
  return evalCurve(WALLS_SCORE_CURVE, level);
}

/** Protected storage capacity (units) at a store level, before integrity. */
export function storageShelterAtLevel(level: number): number {
  return evalCurve(STORAGE_SHELTER_CURVE, level);
}

/** Turns a fresh caravan takes to reach the Bazaar, by Market Square level —
 *  floored at CARAVAN_DELIVERY_MIN_TURNS, rounded to whole turns. */
export function caravanDeliveryTurnsAt(marketLevel: number): number {
  return Math.max(CARAVAN_DELIVERY_MIN_TURNS, Math.round(evalCurve(CARAVAN_DELIVERY_CURVE, marketLevel)));
}
