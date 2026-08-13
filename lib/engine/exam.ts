// The Collegium Examination — grading and the endowment.
//
// Pure functions over player state, so the whole thing is testable without a
// world and replays identically under the compare-and-swap retry.
//
// The design decision worth remembering: a failed paper costs nothing but the
// sitting. Every answer is explained the moment it is given, so the first
// attempt IS the lesson, and someone who comes back and passes has done exactly
// what the examination is for. There is no cooldown and no penalty — the only
// thing standing between a player and the endowment is reading.

import { EXAM, EXAM_PASS_MARK, EXAM_REWARD } from "../constants/exam";
import type { Player } from "./types";

export interface ExamState {
  answered: number;
  correct: number;
  given: number[];
  /** Sittings so far, including the one in progress. */
  attempts: number;
  /** Sealed — passed and paid. The examination never appears again this age. */
  paid?: boolean;
}

export function examState(p: Player): ExamState {
  const e = p.exam;
  if (!e) return { answered: 0, correct: 0, given: [], attempts: 1 };
  return {
    answered: e.answered ?? 0,
    correct: e.correct ?? 0,
    given: e.given ?? [],
    attempts: e.attempts ?? 1,
    paid: e.paid,
  };
}

/** Every question of THIS sitting answered — the paper is marked. */
export function sittingFinished(p: Player): boolean {
  return examState(p).answered >= EXAM.length;
}

/** Reached the mark on the sitting just finished. */
export function examPassed(p: Player): boolean {
  const s = examState(p);
  return s.answered >= EXAM.length && s.correct >= EXAM_PASS_MARK;
}

/**
 * Done with for the age — passed and paid.
 *
 * This, not `sittingFinished`, is what hides the examination from the realm.
 * A player who finished a paper and missed the mark still has one to sit.
 */
export function examSealed(p: Player): boolean {
  return Boolean(examState(p).paid);
}

/** The question they are on, or null once they are finished. */
export function currentQuestionIndex(p: Player): number | null {
  const i = examState(p).answered;
  return i < EXAM.length ? i : null;
}

export class ExamError extends Error {}

/**
 * Record one answer and advance.
 *
 * `index` is checked against the server's own position rather than trusted:
 * without it, a crafted request could answer question 24 first and skip the
 * other twenty-four straight to the endowment.
 *
 * The two directions are NOT the same thing, and treating them alike was a bug:
 *
 *   index > answered  →  a skip. Refused.
 *   index < answered  →  a double-click, a slow network, a back button. The
 *                        answer is already recorded and immutable, so nothing
 *                        can be gained by replaying it — this is a no-op, not
 *                        an error. Throwing here 500'd the page for anyone who
 *                        clicked an option twice.
 */
export function answerQuestion(pIn: Player, index: number, choice: number): Player {
  const p = structuredClone(pIn);
  const state = examState(p);
  if (state.answered >= EXAM.length) return p; // paper already finished
  if (index < state.answered) return p; // already answered — ignore the echo
  if (index > state.answered) throw new ExamError("That is not the question before you.");

  const q = EXAM[index]!;
  if (!Number.isInteger(choice) || choice < 0 || choice >= q.options.length) {
    throw new ExamError("Choose one of the answers.");
  }

  const given = [...state.given];
  given[index] = choice;
  p.exam = {
    answered: state.answered + 1,
    correct: state.correct + (choice === q.answer ? 1 : 0),
    given,
    attempts: state.attempts,
    paid: state.paid,
  };
  return p;
}

/**
 * Sit it again after missing the mark.
 *
 * No cooldown and no cost. The point of a retake is that the player has just
 * read every explanation they got wrong; making them wait would only push them
 * away from the thing that was about to teach them. Refused once sealed, so a
 * passed examination can never be replayed for a second endowment.
 */
export function retakeExam(pIn: Player): Player {
  const p = structuredClone(pIn);
  const state = examState(p);
  if (state.paid) throw new ExamError("You have already sat and sealed the examination.");
  if (state.answered < EXAM.length) throw new ExamError("Finish the paper before you sit it again.");
  p.exam = { answered: 0, correct: 0, given: [], attempts: state.attempts + 1 };
  return p;
}

/**
 * Pay the endowment, once and once only.
 *
 * Separate from `answerQuestion` so the payment is idempotent on its own terms:
 * it can be called on every page load after the last answer and will pay at
 * most once, which is what makes a refresh at the results screen harmless.
 */
export function payEndowment(pIn: Player): { player: Player; paid: boolean } {
  const p = structuredClone(pIn);
  const state = examState(p);
  if (!examPassed(p) || state.paid) return { player: p, paid: false };

  p.gold += EXAM_REWARD.gold;
  for (const r of ["food", "wood", "stone", "ore"] as const) {
    p.resources[r] += EXAM_REWARD.resources;
  }
  p.exam = { ...state, paid: true };
  return { player: p, paid: true };
}
