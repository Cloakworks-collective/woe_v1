// Sampling, for the two harnesses that need it.
//
// Only battles roll dice. Buildings and ranking are pure functions of the
// constants — you sweep those on a grid and get exact answers, so nothing here
// applies to them.
//
// And even for battles this is NOT Monte Carlo in the expensive sense: the
// seeds are a fixed, ordered grid, so a run is reproducible and two runs are
// diffable. Random seeds would make every report differ from the last for
// reasons that have nothing to do with the change you made.

import { seededRng, type Rng } from "@/lib/engine";

/** The default grid. Small on purpose — see `paired` for why it is enough. */
export function seedGrid(n = 400, from = 1): number[] {
  return Array.from({ length: n }, (_, i) => from + i);
}

/**
 * The cheapest possible battle: every roll comes back at its mean.
 *
 * `luck()` and `rollBand()` are linear in the RNG, so a constant 0.5 gives
 * their exact means in ONE run instead of hundreds. Compounding rounds and
 * threshold effects make it approximate for a battle as a whole — but it is
 * free, and it is the right first look at any matchup.
 */
export const meanRng: Rng = () => 0.5;

export const rngFor = (seed: number): Rng => seededRng(seed);

export interface Summary {
  n: number;
  mean: number;
  /** Half-width of the 95% interval. Report `mean ± ci`, never a bare mean. */
  ci: number;
  min: number;
  max: number;
}

export function summarise(xs: number[]): Summary {
  const n = xs.length;
  if (n === 0) return { n: 0, mean: 0, ci: 0, min: 0, max: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = n > 1 ? xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  return {
    n,
    mean,
    ci: 1.96 * Math.sqrt(variance / n),
    min: Math.min(...xs),
    max: Math.max(...xs),
  };
}

/** "52.1% ± 1.4%" — a finding. "52%" is a coin flip nobody measured. */
export const pctCI = (s: Summary): string => `${(s.mean * 100).toFixed(1)}% ± ${(s.ci * 100).toFixed(1)}%`;

/**
 * Common Random Numbers: run both arms of a comparison on the SAME seed.
 *
 * Luck then cancels between them, which is worth roughly an order of magnitude
 * in trials. Without it a real 3% edge is invisible beneath LUCK_SWING and the
 * harness will report "balanced" with total confidence — the single easiest way
 * to make a balance report that is worse than no report at all.
 */
export function paired<T>(seeds: number[], arm: (rng: Rng, seed: number) => T): T[] {
  return seeds.map((s) => arm(rngFor(s), s));
}

/** Share of trials satisfying a predicate, with its interval. */
export function rateOf<T>(xs: T[], pred: (x: T) => boolean): Summary {
  return summarise(xs.map((x) => (pred(x) ? 1 : 0)));
}
