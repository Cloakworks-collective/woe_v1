// Injectable randomness so battles are testable and simulations reproducible.

export type Rng = () => number;

/** Deterministic LCG for tests and sims. */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A luck multiplier in [1 − swing, 1 + swing]. */
export function luck(rng: Rng, swing: number): number {
  return 1 - swing + 2 * swing * rng();
}

/** Roll a tunable band from the balance files. Every randomised range in the
 *  game goes through here so simulations stay reproducible — the engine never
 *  reaches for Math.random itself. */
export function rollBand(rng: Rng, band: { min: number; max: number }): number {
  return band.min + (band.max - band.min) * rng();
}

/** How many of `n` things a `chance` (0–1) claims, rolled individually but
 *  resolved in one call. Used for engineer casualties and spy interception,
 *  where a per-head roll is the honest model but a loop would be wasteful. */
export function rollCount(rng: Rng, n: number, chance: number): number {
  if (n <= 0 || chance <= 0) return 0;
  if (chance >= 1) return n;
  // Expected value plus a fractional roll — smooth, unbiased, and cheap.
  const exact = n * chance;
  const whole = Math.floor(exact);
  return whole + (rng() < exact - whole ? 1 : 0);
}
