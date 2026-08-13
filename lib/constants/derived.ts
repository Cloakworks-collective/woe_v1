// Derived curve helpers — the ONE place each curve in balance.ts is evaluated,
// so engine and UI share identical numbers. Pure functions of plain numbers;
// player-dependent modifiers (tax, integrity, race, statecraft…) are applied
// by the callers in the engine.

import {
  BUILDING_COST_CURVE,
  CARAVAN_DELIVERY_CURVE,
  CARAVAN_DELIVERY_MIN_TURNS,
  STORAGE_SHELTER_CURVE,
  WALL_EDGE,
  WALL_HP_CURVE,
  WALLS_SCORE_CURVE,
  RESEARCH_OUTPUT_CURVE,
  WORKER_OUTPUT_CURVE,
} from "./balance";
import { evalCurve } from "./curves";

/** Building cost multiplier at a target level (× the building's base cost). */
export function buildingCostMultiplier(targetLevel: number): number {
  return evalCurve(BUILDING_COST_CURVE, targetLevel);
}

/** Units/turn one worker produces at 0% tax, by their building's level. */
export function workerOutputAtLevel(level: number): number {
  return evalCurve(WORKER_OUTPUT_CURVE, level);
}

/** Research points/turn one scholar produces at 0% tax, by Collegium level. */
export function researchOutputAtLevel(level: number): number {
  return evalCurve(RESEARCH_OUTPUT_CURVE, level);
}

/**
 * The wall's defence edge, as a fraction. FLAT for any standing wall — a wall
 * is a wall, and a Citadel is not a harder thing to fight over than a palisade.
 * What a Citadel is, is far harder to knock down: level buys HEALTH, which is
 * `wallHealthAtLevel` below.
 */
export function wallBonusAtLevel(level: number): number {
  return level > 0 ? WALL_EDGE.BASE : 0;
}

/** How much punishment a wall absorbs before it is rubble, by level. Quadratic:
 *  a Citadel soaks a hundred times what a Timber Palisade does. */
export function wallHealthAtLevel(level: number): number {
  return level > 0 ? evalCurve(WALL_HP_CURVE, level) : 0;
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
