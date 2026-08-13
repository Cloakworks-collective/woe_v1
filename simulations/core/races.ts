// Race, as a dimension rather than a footnote.
//
// Race modifiers reach into every harness here: production decides how fast a
// race can afford a building, units/attack/defence and siege/walls decide both
// battles and ranking score, mercCost decides what an "equal-cost" army costs.
// So every sweep runs six times, and the reports show the SPREAD rather than
// six tables nobody reads.

import { RACES, type Race, type RaceModifiers } from "@/lib/constants";

export const ALL_RACES = Object.keys(RACES) as Race[];

/**
 * The zero point — every modifier at 1.0.
 *
 * NOT Human. Humans are production 1.25 across all four resources, units 1.1
 * and spy 1.25: above average at everything, not neutral. The in-game Ranking
 * Calculator compares against Human, which is right for a player ("how do I
 * compare to the common case") and wrong here — measured against Human, five of
 * six races look broken when they are merely not-Human.
 */
export const NEUTRAL: RaceModifiers = {
  production: { food: 1, wood: 1, stone: 1, ore: 1 },
  attack: 1,
  defence: 1,
  units: { footman: 1, archer: 1, cavalry: 1 },
  siege: 1,
  walls: 1,
  spy: 1,
  scout: 1,
  mercCost: 1,
};

export const modifiersFor = (race: Race): RaceModifiers => RACES[race] ?? NEUTRAL;

export interface Spread {
  neutral: number;
  min: number;
  max: number;
  minRace: Race;
  maxRace: Race;
  /** max ÷ min. 1.0 means race does not touch this at all. */
  ratio: number;
}

/**
 * Collapse a per-race measurement into one row.
 *
 * Six races × ten levels × fifteen buildings is nine hundred numbers nobody
 * will read. What a person actually wants is "how much does race move this,
 * and who is the outlier" — so that is what gets printed, and the full grid
 * stays in the JSON artefact for anyone who wants to dig.
 */
export function spread(neutral: number, byRace: Record<Race, number>): Spread {
  const entries = Object.entries(byRace) as [Race, number][];
  const finite = entries.filter(([, v]) => Number.isFinite(v));
  const pool = finite.length ? finite : entries;
  let [minRace, min] = pool[0]!;
  let [maxRace, max] = pool[0]!;
  for (const [r, v] of pool) {
    if (v < min) [minRace, min] = [r, v];
    if (v > max) [maxRace, max] = [r, v];
  }
  return { neutral, min, max, minRace, maxRace, ratio: min > 0 ? max / min : Infinity };
}

/** Sweep a measurement across every race plus the neutral reference. */
export function byRace<T>(fn: (mods: RaceModifiers, race: Race) => T): Record<Race, T> {
  return Object.fromEntries(ALL_RACES.map((r) => [r, fn(modifiersFor(r), r)])) as Record<Race, T>;
}
