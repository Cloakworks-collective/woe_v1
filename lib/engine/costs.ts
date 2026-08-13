// Building cost math (spec/empire.md).

import {
  BASE_COSTS,
  CIVILIAN_BANDS,
  GOLD_COST_SHARE,
  MILITARY_BANDS,
  TIERED_BAND_INDEX,
  TIERED_BUILDING_IDS,
  RESOURCE_BUILDING_IDS,
  STORAGE_BUILDING_IDS,
  bandIndex,
  type BuildingId,
  type RatioBand,
} from "../constants/buildings";
import { buildingCostMultiplier } from "../constants/derived";
import { COLLEGIUM_COST, COLLEGIUM_COST_CURVE, GUILD_COST, GUILD_COST_CURVE, LODGE_COST, LODGE_COST_CURVE, MARKET_COST, MARKET_COST_CURVE, PRODUCER_COST, PRODUCER_COST_CURVE, STORAGE_COST, STORAGE_COST_CURVE, WALLS_BANDS, WALLS_COST, WALLS_COST_CURVE } from "../constants/balance";
import { evalCurve } from "../constants/curves";
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
  // The four producers are priced apart — like the stores, a flat multiple of a
  // four-resource base rather than a band split. A deeper mine is the same mine.
  if (RESOURCE_BUILDING_IDS.includes(id as (typeof RESOURCE_BUILDING_IDS)[number])) {
    const m = evalCurve(PRODUCER_COST_CURVE, targetLevel);
    const b = PRODUCER_COST.BASE;
    return {
      gold: Math.round(b.gold * m),
      wood: Math.round(b.wood * m),
      stone: Math.round(b.stone * m),
      ore: Math.round(b.ore * m),
    };
  }
  // The Shadow Guild and Ranger's Lodge — the last two off the shared ladder.
  if (id === "shadow_guild" || id === "rangers_lodge") {
    const spec = id === "shadow_guild" ? GUILD_COST : LODGE_COST;
    const curve = id === "shadow_guild" ? GUILD_COST_CURVE : LODGE_COST_CURVE;
    const m = evalCurve(curve, targetLevel);
    return {
      gold: Math.round(spec.BASE.gold * m),
      wood: Math.round(spec.BASE.wood * m),
      stone: Math.round(spec.BASE.stone * m),
      ore: Math.round(spec.BASE.ore * m),
    };
  }
  // The Collegium, likewise — see COLLEGIUM_COST for why it is gentler.
  if (id === "collegium") {
    const m = evalCurve(COLLEGIUM_COST_CURVE, targetLevel);
    const b = COLLEGIUM_COST.BASE;
    return {
      gold: Math.round(b.gold * m),
      wood: Math.round(b.wood * m),
      stone: Math.round(b.stone * m),
      ore: Math.round(b.ore * m),
    };
  }
  // The Market Square earned its own ladder too — see MARKET_COST.
  if (id === "market_square") {
    const m = evalCurve(MARKET_COST_CURVE, targetLevel);
    const b = MARKET_COST.BASE;
    return {
      gold: Math.round(b.gold * m),
      wood: Math.round(b.wood * m),
      stone: Math.round(b.stone * m),
      ore: Math.round(b.ore * m),
    };
  }
  // Storehouses are priced apart too — their own base, rate and 12-level cap.
  // Unlike the others their cost is a flat multiple of a four-resource base
  // rather than a band split, because what a store is made of does not change
  // as it grows: it is the same building, deeper.
  if (STORAGE_BUILDING_IDS.includes(id)) {
    const m = evalCurve(STORAGE_COST_CURVE, targetLevel);
    const b = STORAGE_COST.BASE;
    return {
      gold: Math.round(b.gold * m),
      wood: Math.round(b.wood * m),
      stone: Math.round(b.stone * m),
      ore: Math.round(b.ore * m),
    };
  }
  // NOTE: there is no shared civilian branch any more. All thirteen levelled
  // civilian buildings — four producers, five storehouses, Market Square,
  // Collegium, Shadow Guild, Ranger's Lodge — were given bespoke cost blocks
  // during the 2026-08 pass, and the old `BASE_COSTS.civilian × 1.5^(n−1)` path
  // became unreachable. It is deleted rather than left as a dead default,
  // because a fall-through nobody can reach is a fall-through nobody maintains.
  // `costs.test.ts` asserts every civilian id still resolves.
  // Walls are priced apart from everything else — their own base, their own
  // bands, their own curve, and gold at a MULTIPLE of the materials rather than
  // a fraction of them. See WALLS_COST in balance.ts for why.
  if (id === "walls") {
    const res = WALLS_COST.BASE_GOODS * evalCurve(WALLS_COST_CURVE, targetLevel);
    const band = WALLS_BANDS[bandIndex(targetLevel)]!;
    return {
      gold: Math.round(res * WALLS_COST.GOLD_SHARE),
      wood: Math.round(res * band[0]),
      stone: Math.round(res * band[1]),
      ore: Math.round(res * band[2]),
    };
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
 * damage there is to mend (spec/empire.md, combat.md). A store at 60%
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
