// Vacation — leaving the age, and coming back to it (spec/combat.md).
//
// The economics live in the tick (production, research and tax are all scaled
// there). What lives HERE is the clock: how long this absence has run, and what
// coming home earns you. Both the engine's automatic return (the era budget
// running dry) and the player's own "return to the world" command go through
// `returnFromVacation`, so the two can never drift apart.
//
// Pure — no I/O, no clock of its own; the caller supplies the tick.

import {
  VACATION_RETURN_SHIELD_MIN_TICKS,
  VACATION_RETURN_SHIELD_TICKS,
} from "../constants";
import type { Player } from "./types";

/**
 * How long the CURRENT absence has run, in turns.
 *
 * `vacationStartedAtTick` is the honest answer and is set on every departure.
 * Saves written before that field existed fall back to `vacationTicksUsed` —
 * which is the era's cumulative budget rather than this trip's, and therefore
 * only exact for a ruler on their first vacation of the age. That is the right
 * way to be wrong: it over-estimates an absence rather than under-estimating
 * one, so the fallback errs toward GRANTING the shield, and the field takes
 * over for everybody the moment they next depart.
 */
export function vacationAwayTicks(p: Player, currentTick: number): number {
  if (!p.onVacation) return 0;
  const started = p.vacationStartedAtTick ?? currentTick - (p.vacationTicksUsed ?? 0);
  return Math.max(0, currentTick - started);
}

/** Whether this absence has run long enough to earn the coming-home shield. */
export function earnsReturnShield(p: Player, currentTick: number): boolean {
  return vacationAwayTicks(p, currentTick) >= VACATION_RETURN_SHIELD_MIN_TICKS;
}

/**
 * Come home. Lifts the absence, starts the re-attack cooldown, and — for an
 * absence that ran at least VACATION_RETURN_SHIELD_MIN_TICKS — grants a short
 * shield so the returning ruler gets a look at the board before anyone may
 * march on them.
 *
 * The shield is granted with `Math.max`, never assignment: a newcomer whose
 * 72-hour shield still has days to run must not have it cut down to an hour by
 * taking a holiday.
 *
 * Mutates `p` (callers already work on a clone) and reports what happened so
 * the message the player reads is the truth rather than a guess.
 */
export function returnFromVacation(
  p: Player,
  currentTick: number,
): { awayTicks: number; shieldedUntilTick: number | null } {
  const awayTicks = vacationAwayTicks(p, currentTick);
  const earned = awayTicks >= VACATION_RETURN_SHIELD_MIN_TICKS;

  p.onVacation = false;
  p.vacationQueued = false;
  p.vacationStartedAtTick = undefined;
  p.vacationEndedAtTick = currentTick;

  if (!earned) return { awayTicks, shieldedUntilTick: null };
  const until = currentTick + VACATION_RETURN_SHIELD_TICKS;
  p.shieldUntilTick = Math.max(p.shieldUntilTick, until);
  return { awayTicks, shieldedUntilTick: p.shieldUntilTick };
}

/** Depart. Stamps the start of the absence so the return shield can be judged. */
export function departOnVacation(p: Player, currentTick: number): void {
  p.onVacation = true;
  p.vacationQueued = false;
  p.vacationStartedAtTick = currentTick;
}
