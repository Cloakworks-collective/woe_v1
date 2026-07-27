// Ranking score — the visible empire (spec/victory.md).
// Siege gear/engineers, spies/scouts, mercenaries, housing, liquid wealth
// (gold + resources), and the shadow research fields are worth zero.

import {
  CIVILIAN_LEVELLED_IDS,
  RESEARCH_FIELDS,
  SCORE,
  TIER_POWER,
} from "../constants";
import type { BuildingId } from "../constants/buildings";
import { level, type Player } from "./types";

const LEVELLED_MILITARY: BuildingId[] = [
  "drill_yard",
  "fletchers_range",
  "knights_stables",
  "forge",
  "war_foundry",
];

export function rankingScore(p: Player): number {
  let score = 0;

  // People — idle peasants + workers only. Spies and scouts are covert and
  // don't count toward the visible empire.
  const workers = Object.values(p.workers).reduce((a, b) => a + b, 0);
  score += (p.idlePeasants + workers) * SCORE.PER_CIVILIAN;

  // Regular troops by tier power; engineers are siege → zero; mercenaries are
  // hired blades and count for nothing (power in coin brings no prestige).
  for (const corps of [p.army.footmen, p.army.archers, p.army.cavalry]) {
    score += corps.light * SCORE.PER_TROOP_BASE * TIER_POWER.light;
    score += corps.medium * SCORE.PER_TROOP_BASE * TIER_POWER.medium;
    score += corps.heavy * SCORE.PER_TROOP_BASE * TIER_POWER.heavy;
  }

  // Walls & buildings — walls score by level² × integrity.
  const wallLvl = level(p, "walls");
  score += wallLvl * wallLvl * SCORE.WALLS_PER_LEVEL_SQ * p.wallIntegrity;
  for (const id of [...CIVILIAN_LEVELLED_IDS, ...LEVELLED_MILITARY]) {
    score += level(p, id) * SCORE.PER_BUILDING_LEVEL;
  }
  // Housing (hearthsteads, muster halls) and liquid wealth (gold, resources)
  // don't count — ranking is standing army, settlement, veterancy, research.

  // Veterancy is prestige.
  score += p.army.experience * SCORE.PER_XP_POINT;

  // Research — the 7 ranked fields only.
  for (const f of RESEARCH_FIELDS) {
    if (f.ranked) score += (p.research.levels[f.id] ?? 0) * SCORE.PER_RESEARCH_LEVEL;
  }

  return Math.round(score);
}
