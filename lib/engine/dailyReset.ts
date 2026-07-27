// The daily reset: peasant recruitment, then the scattering check
// (spec/buildings.md growth model, spec/combat.md scattering).

import {
  CIVILIAN_LEVELLED_IDS,
  growthPerDayAt,
  HOUSING_PER_HEARTHSTEAD,
  SCATTERING,
  WALL_DAMAGE_POP_PENALTY,
} from "../constants";
import {
  civilians,
  level,
  military,
  totalPopulation,
  type EngineResult,
  type Player,
} from "./types";

/** Sum of all 13 civilian building levels (0–130). */
export function civilianLevels(p: Player): number {
  return CIVILIAN_LEVELLED_IDS.reduce((sum, id) => sum + level(p, id), 0);
}

/** Raw peasants/day before wall penalty and housing cap — GROWTH_CURVE
 *  evaluated at the empire's total civilian building levels. */
export function rawGrowthPerDay(p: Player): number {
  return growthPerDayAt(civilianLevels(p));
}

/** Damaged walls scare settlers: 1 − 0.5 × damagedFraction. Intact/absent = 1. */
export function wallPenalty(p: Player): number {
  if (level(p, "walls") === 0) return 1;
  return 1 - WALL_DAMAGE_POP_PENALTY * (1 - p.wallIntegrity);
}

export function vacantHousing(p: Player): number {
  return Math.max(0, level(p, "hearthstead") * HOUSING_PER_HEARTHSTEAD - civilians(p));
}

/** Peasants that would arrive today (after penalty, before the housing cap). */
export function popPerDay(p: Player): number {
  return Math.max(1, Math.floor(rawGrowthPerDay(p) * wallPenalty(p)));
}

export function processDailyReset(input: Player, currentTick = 0): EngineResult {
  const p = structuredClone(input);
  const events: EngineResult["events"] = [];

  // 1. Recruitment — arrivals that find no vacant Hearthstead are lost, not
  //    queued. Halted while starving or under Incite Unrest.
  const unrest = (p.unrestUntilTick ?? 0) > currentTick;
  if (!p.starving && !unrest) {
    const wanted = popPerDay(p);
    const arrived = Math.min(wanted, vacantHousing(p));
    p.idlePeasants += arrived;
    events.push({ type: "dailyRecruitment", arrived, turnedAway: wanted - arrived });
  }

  // 2. Scattering — civilians only stay where they feel protected.
  //    Empires below 500 total population are exempt.
  if (totalPopulation(p) >= SCATTERING.EXEMPT_BELOW_POPULATION) {
    const civ = civilians(p);
    const mil = military(p);
    if (mil < SCATTERING.TROOP_RATIO * civ) {
      const keep = Math.floor(mil / SCATTERING.TROOP_RATIO);
      let toLose = civ - keep;
      const lost = toLose;

      // Idle first…
      const fromIdle = Math.min(p.idlePeasants, toLose);
      p.idlePeasants -= fromIdle;
      toLose -= fromIdle;
      // …then workers…
      for (const role of [
        "farmers",
        "quarrymen",
        "miners",
        "lumberjacks",
        "merchants",
        "researchers",
      ] as const) {
        if (toLose === 0) break;
        const n = Math.min(p.workers[role], toLose);
        p.workers[role] -= n;
        toLose -= n;
      }
      // …then specialists.
      const fromSpies = Math.min(p.army.spies, toLose);
      p.army.spies -= fromSpies;
      toLose -= fromSpies;
      const fromScouts = Math.min(p.army.scouts, toLose);
      p.army.scouts -= fromScouts;
      toLose -= fromScouts;

      events.push({ type: "scattering", lost: lost - toLose });
    }
  }

  return { player: p, events };
}
