// Ranking score — martial strength and people (spec/overview.md).
//
// The ladder publishes ONE number, and many different empires produce the same
// number. A turtle behind a Citadel and a hammer with a huge field army can
// rank identically while needing opposite answers, so:
//
//     rank tells you WHETHER a target is worth your turns.
//     a scout tells you HOW to attack them.
//
// That is the whole design. It is why Map the Army and Map the Siege Train are
// worth paying spy turns for, and it is why what is EXCLUDED below matters as
// much as what is included.
//
// Units score tier, headcount and RACE. Race belongs here because it is public
// on every profile — a rival can already read it, so folding it in reveals
// nothing while making the number honest: a Dwarf shield wall and a Gnoll one
// are not the same wall, and the same is true of a Troll counter-engine and a
// Dwarf rampart.
//
// What stays out is what you genuinely cannot see from outside the gate:
// veterancy and research are scored SEPARATELY and explicitly, never folded
// into unit power, so the ladder never quantifies how sharp a given army is.
// Mercenaries score at base — hired blades bring their arms and nothing else,
// exactly as the battle engine treats them.

import {
  RACES,
  RESEARCH_FIELDS,
  SCORE,
  SIEGE_COUNTERS,
  TIER_SCALE,
  UNIT_POWER,
  wallsScoreAtLevel,
} from "../constants";
import { COUNTER_TYPES, type CounterType } from "../constants/buildings";
import type { RaceModifiers } from "../constants/races";
import { crewCounters } from "./combat/duel";
import { level, type Player, type TroopCounts } from "./types";

type Arm = "footman" | "archer" | "cavalry";

/**
 * The race's effect on a unit's worth, as one number.
 *
 * Ranking is neither an attack nor a defence figure, so the global pair is
 * averaged and the per-arm modifier applied on top: a Dwarf footman is
 * ((1.00 + 1.05) / 2) × 1.30 = 1.33 of a human one, and their archer is 0.82.
 * Race is public on every profile, so this reveals nothing a rival could not
 * already work out — it just stops the ladder pretending a Dwarf shield wall
 * and a Gnoll one are the same wall.
 */
const raceUnitFactor = (race: RaceModifiers, arm: Arm): number =>
  ((race.attack + race.defence) / 2) * race.units[arm];

const armPower = (c: TroopCounts, arm: Arm, factor = 1): number => {
  const base = UNIT_POWER[arm].power * factor;
  return (
    c.light * base * TIER_SCALE.light +
    c.medium * base * TIER_SCALE.medium +
    c.heavy * base * TIER_SCALE.heavy
  );
};

export function rankingScore(p: Player): number {
  let score = 0;
  const a = p.army;
  const race = RACES[p.race];

  // People. Spies are covert and never appear; scouts do, at a discount —
  // they stand in the open and everyone can see the rangers on your roads.
  const workers = Object.values(p.workers).reduce((sum, n) => sum + n, 0);
  score += (p.idlePeasants + workers) * SCORE.PER_CIVILIAN;
  score += a.scouts * SCORE.PER_SCOUT;

  // The battle line — yours and the hired. Sellswords count now: they hold a
  // wall and they die like anyone else, and gold spent on them is real
  // strength that a rival can see coming.
  const line =
    armPower(a.footmen, "footman", raceUnitFactor(race, "footman")) +
    armPower(a.archers, "archer", raceUnitFactor(race, "archer")) +
    armPower(a.cavalry, "cavalry", raceUnitFactor(race, "cavalry"));
  const hired =
    armPower(a.mercenaries.footmen, "footman") +
    armPower(a.mercenaries.archers, "archer") +
    armPower(a.mercenaries.cavalry, "cavalry");
  score += line * SCORE.PER_POWER_POINT;
  score += hired * SCORE.PER_POWER_POINT * SCORE.MERC_POWER_FACTOR;

  // Engineers count — and they are the reason a bombardier is not invisible on
  // the ladder. The corps is genuinely dual-use: the same hands that push
  // trebuchets forward man the Counter-Engines when nobody is marching. So the
  // INVESTMENT shows while the COMPOSITION stays dark.
  const engineers = a.siegeEngineers + a.mercenaries.engineers;
  score += engineers * SCORE.PER_ENGINEER;

  // Defensive works score; the siege train does not. Your engines are the most
  // valuable thing a rival could learn about you, so the ladder never tells
  // them. Only what a besieger would SEE from outside is counted — and only
  // what you can actually man, because forty uncrewed engines are lumber.
  //
  // RACE COUNTS HERE, and only here. A Troll counter-engine really does hit
  // harder and a Dwarf wall really is thicker, so a ladder that ignored it
  // would misreport how hard these two empires are to crack. It leaks nothing:
  // race is public on every profile, so anyone could already do this
  // arithmetic. The multipliers that stay hidden are the ones you cannot see
  // from outside the gate — army race bonuses, veterancy and research.
  const crewed = SCORE.SIEGE_REQUIRES_CREW
    ? crewCounters(a.siegeCounters, engineers)
    : a.siegeCounters;
  let counterPower = 0;
  for (const t of COUNTER_TYPES) {
    counterPower += crewed[t as CounterType] * SIEGE_COUNTERS[t].power;
  }
  score += counterPower * SCORE.PER_POWER_POINT * SCORE.COUNTER_POWER_FACTOR * race.siege;

  // Walls — quadratic in level, because that is how their health scales, and
  // scaled by the race's fortification quality for the same reason.
  score += wallsScoreAtLevel(level(p, "walls")) * p.wallIntegrity * race.walls;

  // Veterancy is prestige, and it is the one multiplier the ladder does show.
  score += p.army.experience * SCORE.PER_XP_POINT;

  // Research: the ranked fields. The covert studies stay off the board — it
  // would be a strange ladder that advertised how deep your spy service runs.
  for (const f of RESEARCH_FIELDS) {
    if (f.ranked) score += (p.research.levels[f.id] ?? 0) * SCORE.PER_RESEARCH_LEVEL;
  }

  // Civilian buildings, housing and liquid wealth are NOT counted. Ranking is
  // what you can put in the field, not how comfortable your town is.
  return Math.round(score);
}
