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
// Units score their BASE power — tier and headcount, without race, veterancy or
// research folded in. Veterancy is scored separately and research explicitly;
// leaking your multipliers through the ladder would hand rivals for free the
// intelligence they ought to be buying.

import {
  RESEARCH_FIELDS,
  SCORE,
  SIEGE_COUNTERS,
  TIER_SCALE,
  UNIT_POWER,
  wallsScoreAtLevel,
} from "../constants";
import { COUNTER_TYPES, type CounterType } from "../constants/buildings";
import { crewCounters } from "./combat/duel";
import { level, type Player, type TroopCounts } from "./types";

const armPower = (c: TroopCounts, arm: "footman" | "archer" | "cavalry"): number => {
  const base = UNIT_POWER[arm].power;
  return (
    c.light * base * TIER_SCALE.light +
    c.medium * base * TIER_SCALE.medium +
    c.heavy * base * TIER_SCALE.heavy
  );
};

export function rankingScore(p: Player): number {
  let score = 0;
  const a = p.army;

  // People. Spies are covert and never appear; scouts do, at a discount —
  // they stand in the open and everyone can see the rangers on your roads.
  const workers = Object.values(p.workers).reduce((sum, n) => sum + n, 0);
  score += (p.idlePeasants + workers) * SCORE.PER_CIVILIAN;
  score += a.scouts * SCORE.PER_SCOUT;

  // The battle line — yours and the hired. Sellswords count now: they hold a
  // wall and they die like anyone else, and gold spent on them is real
  // strength that a rival can see coming.
  const line =
    armPower(a.footmen, "footman") + armPower(a.archers, "archer") + armPower(a.cavalry, "cavalry");
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
  const crewed = SCORE.SIEGE_REQUIRES_CREW
    ? crewCounters(a.siegeCounters, engineers)
    : a.siegeCounters;
  let counterPower = 0;
  for (const t of COUNTER_TYPES) {
    counterPower += crewed[t as CounterType] * SIEGE_COUNTERS[t].power;
  }
  score += counterPower * SCORE.PER_POWER_POINT * SCORE.COUNTER_POWER_FACTOR;

  // Walls — quadratic in level, because that is how their health scales.
  score += wallsScoreAtLevel(level(p, "walls")) * p.wallIntegrity;

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
