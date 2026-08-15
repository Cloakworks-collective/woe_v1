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
// Research is scored SEPARATELY and explicitly, never folded into unit power.
// Veterancy is the exception and it is folded in deliberately — it has no line
// of its own, it just multiplies the regulars, because what veterancy IS on a
// ladder is stronger troops. See the note on the Battle line below.
// Mercenaries score at base — hired blades bring their arms and nothing else,
// exactly as the battle engine treats them.

import {
  RACES,
  RESEARCH_FIELDS,
  SCORE,
  SIEGE_COUNTERS,
  UNIT_STATS,
  wallsScoreAtLevel,
} from "../constants";
import { COUNTER_TYPES, type CounterType } from "../constants/buildings";
import type { RaceModifiers } from "../constants/races";
import { crewCounters } from "./combat/duel";
import { level, military, veterancyBonus, type Player, type TroopCounts } from "./types";

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

const armPower = (c: TroopCounts | undefined, arm: Arm, factor = 1): number => {
  if (!c) return 0;
  const at = (tier: "light" | "medium" | "heavy") => UNIT_STATS[arm][tier].power * factor;
  return n(c.light) * at("light") + n(c.medium) * at("medium") + n(c.heavy) * at("heavy");
};

/**
 * A score must never be NaN.
 *
 * This function reads a dozen fields off a saved Player, and a world that has
 * been through several schema changes will have empires missing some of them.
 * One `undefined` used to poison the whole sum — which is not a cosmetic
 * problem: the Records page filters on `rankingScore(p) > 0`, and `NaN > 0` is
 * false, so a single legacy empire showed as "NaN pts" and the Greatest Rulers
 * table rendered completely empty.
 */
const n = (v: number | undefined | null): number => (Number.isFinite(v) ? (v as number) : 0);

export interface ScorePart {
  label: string;
  points: number;
  /** What produced it, in the player's own numbers. */
  detail: string;
}

/**
 * The same sum as `rankingScore`, itemised.
 *
 * `rankingScore` delegates to this rather than duplicating the arithmetic, so
 * the tooltip can never quote a breakdown that does not add up to the number
 * beside it — the failure mode of every "explain this figure" panel written as
 * a second implementation.
 *
 * Only what a besieger could see from outside the gate is here. Gold, food,
 * housing, civilian buildings, your siege train and your spies are all excluded
 * on purpose, and the UI says so.
 */
export function rankingBreakdown(p: Player): ScorePart[] {
  const a = p.army;
  const race = RACES[p.race] ?? RACES.human;
  if (!a) return [];
  const parts: ScorePart[] = [];

  // People. Spies are covert and never appear; scouts do, at a discount —
  // they stand in the open and everyone can see the rangers on your roads.
  const workers = Object.values(p.workers ?? {}).reduce((sum, w) => sum + n(w), 0);
  const civs = n(p.idlePeasants) + workers;
  parts.push({
    label: "Civilians",
    points: civs * SCORE.PER_CIVILIAN,
    detail: `${civs.toLocaleString("en-US")} peasants & workers`,
  });
  parts.push({
    label: "Scouts",
    points: n(a.scouts) * SCORE.PER_SCOUT,
    detail: `${n(a.scouts).toLocaleString("en-US")} rangers — spies stay off the ladder`,
  });

  // The battle line — yours and the hired. Sellswords count: they hold a wall
  // and they die like anyone else, and gold spent on them is real strength.
  //
  // VETERANCY IS IN HERE, and nowhere else on the board. It used to be a line of
  // its own, which said a seasoned army was worth points for being seasoned;
  // what is actually true is that a seasoned army is worth points because its
  // men hit harder. So the bonus multiplies the power of the REGULARS who carry
  // it, exactly as it does in a battle, and the ladder reports one thing —
  // strength — instead of strength plus a separate note about strength.
  //
  // It does not touch the sellswords. They are excluded from the veterancy pool
  // in the field (see bonusPool), and a ladder that paid for veteran mercenaries
  // would be describing an army that does not exist.
  const vet = 1 + veterancyBonus(n(a.experiencePoints));
  const line =
    (armPower(a.footmen, "footman", raceUnitFactor(race, "footman")) +
      armPower(a.archers, "archer", raceUnitFactor(race, "archer")) +
      armPower(a.cavalry, "cavalry", raceUnitFactor(race, "cavalry"))) *
    vet;
  const hired =
    armPower(a.mercenaries?.footmen, "footman") +
    armPower(a.mercenaries?.archers, "archer") +
    armPower(a.mercenaries?.cavalry, "cavalry");
  parts.push({
    label: "Battle line",
    points: line * SCORE.PER_POWER_POINT,
    detail:
      vet > 1
        ? `${Math.round(line).toLocaleString("en-US")} power — tier, race, and +${((vet - 1) * 100).toFixed(1)}% veterancy`
        : `${Math.round(line).toLocaleString("en-US")} power, tier & race counted`,
  });
  parts.push({
    label: "Sellswords",
    points: hired * SCORE.PER_POWER_POINT * SCORE.MERC_POWER_FACTOR,
    detail: `${Math.round(hired).toLocaleString("en-US")} power at ${Math.round(SCORE.MERC_POWER_FACTOR * 100)}% — hired blades bring arms, not blood`,
  });

  // Engineers are why a bombardier is not invisible: the corps is dual-use, so
  // the INVESTMENT shows while the COMPOSITION stays dark.
  const engineers = n(a.siegeEngineers) + n(a.mercenaries?.engineers);
  parts.push({
    label: "Engineers",
    points: engineers * SCORE.PER_ENGINEER,
    detail: `${engineers.toLocaleString("en-US")} corps — the siege train itself is never shown`,
  });

  // Defensive works score; the siege train does not. Only what you can man.
  const owned = a.siegeCounters ?? ({} as Record<CounterType, number>);
  const crewed = SCORE.SIEGE_REQUIRES_CREW ? crewCounters(owned, engineers) : owned;
  let counterPower = 0;
  let crewedCount = 0;
  for (const t of COUNTER_TYPES) {
    const k = n(crewed[t as CounterType]);
    crewedCount += k;
    counterPower += k * SIEGE_COUNTERS[t].power;
  }
  parts.push({
    label: "Defensive works",
    points: counterPower * SCORE.PER_POWER_POINT * SCORE.COUNTER_POWER_FACTOR * race.siege,
    detail: `${crewedCount.toLocaleString("en-US")} crewed counters — uncrewed engines are lumber`,
  });

  // Walls — quadratic in level, scaled by integrity, race, and the GARRISON.
  const wallLvl = level(p, "walls");
  const manned =
    wallLvl > 0 && SCORE.WALL_TROOPS_PER_LEVEL > 0
      ? Math.min(1, military(p) / (wallLvl * SCORE.WALL_TROOPS_PER_LEVEL))
      : 1;
  parts.push({
    label: "Walls",
    points: wallsScoreAtLevel(wallLvl) * n(p.wallIntegrity) * race.walls * manned,
    detail:
      wallLvl > 0
        ? `level ${wallLvl}, ${Math.round(n(p.wallIntegrity) * 100)}% sound, ${Math.round(manned * 100)}% manned — an empty Citadel is masonry`
        : "no walls raised",
  });

  // (No veterancy line. It is folded into the Battle line above, because what
  //  veterancy IS on a ladder is stronger troops — see the note there.)

  // Research: the ranked fields only. The covert studies stay off the board.
  let ranked = 0;
  for (const f of RESEARCH_FIELDS) if (f.ranked) ranked += n(p.research?.levels?.[f.id]);
  parts.push({
    label: "Research",
    points: ranked * SCORE.PER_RESEARCH_LEVEL,
    detail: `${ranked} ranked levels — Tradecraft, Pathfinding & the trade fields are hidden`,
  });

  return parts;
}

export function rankingScore(p: Player): number {
  const score = rankingBreakdown(p).reduce((sum, part) => sum + part.points, 0);
  // Civilian buildings, housing and liquid wealth are NOT counted. Ranking is
  // what you can put in the field, not how comfortable your town is.
  return Number.isFinite(score) ? Math.round(score) : 0;
}
