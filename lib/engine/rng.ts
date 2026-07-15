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
