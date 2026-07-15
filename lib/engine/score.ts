// Ranking score — the visible empire (spec/victory.md).
// Siege gear/engineers, spies/scouts (as troops), mercenaries, and the
// shadow research fields are worth zero.

import {
  CIVILIAN_LEVELLED_IDS,
  RESEARCH_FIELDS,
  SCORE,
  TIER_POWER,
} from "../constants";
import type { BuildingId } from "../constants/buildings";
import { civilians, level, type Player } from "./types";

const LEVELLED_MILITARY: BuildingId[] = [
  "drill_yard",
  "fletchers_range",
  "knights_stables",
  "forge",
  "war_foundry",
];

export function rankingScore(p: Player): number {
  let score = 0;

  // People — spies and scouts count as civilians (they hold day jobs).
  score += civilians(p) * SCORE.PER_CIVILIAN;

  // Troops by tier power; warriors count at base; engineers are siege → zero.
  for (const corps of [p.army.footmen, p.army.archers, p.army.cavalry]) {
    score += corps.light * SCORE.PER_TROOP_BASE * TIER_POWER.light;
    score += corps.medium * SCORE.PER_TROOP_BASE * TIER_POWER.medium;
    score += corps.heavy * SCORE.PER_TROOP_BASE * TIER_POWER.heavy;
  }
  score += p.warriors * SCORE.PER_TROOP_BASE;

  // Walls & buildings.
  score += SCORE.WALLS(level(p, "walls"), p.wallIntegrity);
  for (const id of [...CIVILIAN_LEVELLED_IDS, ...LEVELLED_MILITARY]) {
    score += level(p, id) * SCORE.PER_BUILDING_LEVEL;
  }
  score += (level(p, "hearthstead") + level(p, "muster_hall")) * SCORE.PER_COUNTED_BUILDING;

  // Treasury — sitting on gold is score, and bait.
  score += (p.gold + p.bankedGold) / SCORE.GOLD_DIVISOR;
  const res = p.resources;
  score += (res.food + res.wood + res.stone + res.ore) / SCORE.RESOURCE_DIVISOR;

  // Veterancy is prestige.
  score += p.army.experience * SCORE.PER_XP_POINT;

  // Research — the 7 ranked fields only.
  for (const f of RESEARCH_FIELDS) {
    if (f.ranked) score += (p.research.levels[f.id] ?? 0) * SCORE.PER_RESEARCH_LEVEL;
  }

  return Math.round(score);
}
