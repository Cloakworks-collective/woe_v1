// Building cost math (spec/buildings.md).

import {
  BASE_COSTS,
  CIVILIAN_BANDS,
  CIVILIAN_LEVELLED_IDS,
  GOLD_COST_SHARE,
  MILITARY_BANDS,
  TIERED_BAND_INDEX,
  TIERED_BUILDING_IDS,
  bandIndex,
  type BuildingId,
  type RatioBand,
} from "../constants/buildings";
import { buildingCostMultiplier } from "../constants/derived";
import { WALL_REPAIR_COST_FACTOR } from "../constants/combat";

export interface Cost {
  gold: number;
  wood: number;
  stone: number;
  ore: number;
}

function split(resourceCost: number, band: RatioBand): Cost {
  return {
    gold: Math.round(resourceCost * GOLD_COST_SHARE),
    wood: Math.round(resourceCost * band[0]),
    stone: Math.round(resourceCost * band[1]),
    ore: Math.round(resourceCost * band[2]),
  };
}

/** Cost to reach `targetLevel` (or to add one instance of a counted building). */
export function buildingCost(id: BuildingId, targetLevel: number): Cost {
  if (id === "hearthstead") {
    return split(BASE_COSTS.hearthstead, CIVILIAN_BANDS[0]);
  }
  if (id === "muster_hall") {
    return split(BASE_COSTS.muster_hall, MILITARY_BANDS[0]);
  }
  if (CIVILIAN_LEVELLED_IDS.includes(id)) {
    const res = BASE_COSTS.civilian * buildingCostMultiplier(targetLevel);
    return split(res, CIVILIAN_BANDS[bandIndex(targetLevel)]);
  }
  // Military: tiered trainers map levels 1/2/3 to bands 1–3 / 4–6 / 9–10.
  const band = TIERED_BUILDING_IDS.includes(id)
    ? MILITARY_BANDS[TIERED_BAND_INDEX[targetLevel]]
    : MILITARY_BANDS[bandIndex(targetLevel)];
  const res = BASE_COSTS.military * buildingCostMultiplier(targetLevel);
  return split(res, band);
}

/**
 * Cost to repair a bombarded building (or the walls) back to full integrity:
 * a fraction of the building's cost at its current level, scaled by how much
 * damage there is to mend (spec/buildings.md, combat.md). A store at 60%
 * integrity costs `buildingCost × 0.4 × WALL_REPAIR_COST_FACTOR` to make whole.
 * `id === "walls"` prices a wall repair.
 */
export function repairCost(id: BuildingId, currentLevel: number, integrity: number): Cost {
  const damaged = Math.max(0, Math.min(1, 1 - integrity));
  const base = buildingCost(id, currentLevel);
  return {
    gold: Math.round(base.gold * damaged * WALL_REPAIR_COST_FACTOR),
    wood: Math.round(base.wood * damaged * WALL_REPAIR_COST_FACTOR),
    stone: Math.round(base.stone * damaged * WALL_REPAIR_COST_FACTOR),
    ore: Math.round(base.ore * damaged * WALL_REPAIR_COST_FACTOR),
  };
}
