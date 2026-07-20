// Economy & management commands (spec/architecture.md protocol; costs and
// capacity rules in spec/buildings.md). All instant — pacing is cost, never timers.

import {
  ACTION_TURNS,
  HOUSING_PER_HEARTHSTEAD,
  MERC_CAP_RATIO,
  MERC_PRICE_GOLD,
  RACES,
  RESEARCH_FIELDS,
  SCATTERING,
  SIEGE_GEAR,
  SLOTS_PER_BUILDING_LEVEL,
  STAMINA,
  STORAGE_PER_LEVEL,
  TIER_COST_MULT,
  TRAINING_COSTS,
  TROOPS_PER_MUSTER_HALL,
  WALL_REPAIR_COST_FACTOR,
  WAR_FOUNDRY_LADDER,
  maxLevel,
} from "../constants";
import type { BuildingId } from "../constants/buildings";
import type { ResearchField } from "../constants/research";
import { buildingCost, type Cost } from "./costs";
import {
  EngineError,
  bankedRes,
  civilians,
  level,
  mercTotal,
  military,
  totalPopulation,
  type EngineResult,
  type Player,
  type Resource,
  type Tier,
  type TroopType,
  type WorkerRole,
} from "./types";
import { STORAGE_BUILDING } from "../constants/buildings";

const TIER_INDEX: Record<Tier, number> = { light: 1, medium: 2, heavy: 3 };

const TRAINER: Record<TroopType, BuildingId> = {
  footman: "drill_yard",
  archer: "fletchers_range",
  cavalry: "knights_stables",
};

const ARMY_KEY: Record<TroopType, "footmen" | "archers" | "cavalry"> = {
  footman: "footmen",
  archer: "archers",
  cavalry: "cavalry",
};

function pay(p: Player, cost: Cost) {
  if (p.gold < cost.gold) throw new EngineError("gold", "Not enough gold");
  if (p.resources.wood < cost.wood) throw new EngineError("wood", "Not enough wood");
  if (p.resources.stone < cost.stone) throw new EngineError("stone", "Not enough stone");
  if (p.resources.ore < cost.ore) throw new EngineError("ore", "Not enough ore");
  p.gold -= cost.gold;
  p.resources.wood -= cost.wood;
  p.resources.stone -= cost.stone;
  p.resources.ore -= cost.ore;
}

function scale(cost: { gold: number; wood: number; stone: number; ore: number }, mult: number): Cost {
  return {
    gold: cost.gold * mult,
    wood: cost.wood * mult,
    stone: cost.stone * mult,
    ore: cost.ore * mult,
  };
}

function musterVacancy(p: Player): number {
  return level(p, "muster_hall") * TROOPS_PER_MUSTER_HALL - military(p);
}

// ── Commands ────────────────────────────────────────────────────────────────

export function setTax(input: Player, rate: number): EngineResult {
  if (rate < 0 || rate > 1 || !Number.isFinite(rate)) {
    throw new EngineError("tax_rate", "Tax rate must be between 0 and 1");
  }
  const p = structuredClone(input);
  p.taxRate = rate;
  return { player: p, events: [] };
}

const WORKER_BUILDING: Record<WorkerRole, BuildingId | null> = {
  farmers: "grange",
  quarrymen: "masons_quarry",
  miners: "deepvein_mine",
  lumberjacks: "sawyers_mill",
  merchants: "market_square",
  researchers: "collegium",
};

/** Assign idle peasants to a worker role (negative count = unassign). Free, reversible. */
export function assignWorkers(input: Player, role: WorkerRole, count: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count)) throw new EngineError("count", "Count must be an integer");
  if (count > 0) {
    if (p.idlePeasants < count) throw new EngineError("peasants", "Not enough idle peasants");
    const building = WORKER_BUILDING[role]!;
    const slots = SLOTS_PER_BUILDING_LEVEL * level(p, building);
    if (p.workers[role] + count > slots) {
      throw new EngineError("slots", `No free slots — raise the ${building} first`);
    }
    p.idlePeasants -= count;
    p.workers[role] += count;
  } else {
    if (p.workers[role] < -count) throw new EngineError("workers", "Not that many assigned");
    p.workers[role] += count;
    p.idlePeasants -= count;
  }
  return { player: p, events: [] };
}

/** Assert the trainer + Forge levels a tier requires (shared by regulars and
 *  the sellswords hired at the Black Market). Tier N needs trainer N AND Forge N. */
function requireTierBuildings(p: Player, type: TroopType, tier: Tier): void {
  const need = TIER_INDEX[tier];
  if (level(p, TRAINER[type]) < need) {
    throw new EngineError("trainer", `${TRAINER[type]} level ${need} required`);
  }
  if (level(p, "forge") < need) {
    throw new EngineError("forge", `The Forge level ${need} required`);
  }
}

/** Train idle peasants straight into footmen/archers/cavalry at a tier — no
 *  intermediate warrior step. Tier N needs trainer N AND Forge N, a free Muster
 *  Hall slot per troop, and the gold/ore to arm them. Instant. */
export function trainTroops(input: Player, type: TroopType, tier: Tier, count: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  if (p.idlePeasants < count) throw new EngineError("peasants", "Not enough idle peasants");
  if (musterVacancy(p) < count) {
    throw new EngineError("muster", "No free Muster Hall slots — build barracks first");
  }
  requireTierBuildings(p, type, tier);
  pay(p, scale(TRAINING_COSTS[type], count * TIER_COST_MULT[tier]));
  p.idlePeasants -= count;
  p.army[ARMY_KEY[type]][tier] += count;
  return { player: p, events: [] };
}

/** The most troops that can be discharged without dropping the guard below the
 *  30% scatter line (empires under the exempt-population floor have no limit),
 *  also capped by vacant Hearthstead space. */
export function safeDischargeCount(p: Player): number {
  const vacant = level(p, "hearthstead") * HOUSING_PER_HEARTHSTEAD - civilians(p);
  let cap = Math.min(military(p), Math.max(0, vacant));
  if (totalPopulation(p) >= SCATTERING.EXEMPT_BELOW_POPULATION) {
    // Keep mil − x ≥ ratio·(civ + x)  ⇒  x ≤ (mil − ratio·civ) / (1 + ratio).
    const r = SCATTERING.TROOP_RATIO;
    const guardCap = Math.floor((military(p) - r * civilians(p)) / (1 + r));
    cap = Math.min(cap, Math.max(0, guardCap));
  }
  return cap;
}

/** Discharge equipped troops straight back to civilian life (their gear is
 *  lost). Needs vacant Hearthstead space, and may not drop the guard below the
 *  30% line (or the realm scatters at dawn). */
export function dischargeTroops(input: Player, type: TroopType, tier: Tier, count: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  if (p.army[ARMY_KEY[type]][tier] < count) throw new EngineError("troops", "Not that many troops");
  const vacant = level(p, "hearthstead") * HOUSING_PER_HEARTHSTEAD - civilians(p);
  if (vacant < count) throw new EngineError("housing", "No vacant Hearthstead space");
  if (
    totalPopulation(p) >= SCATTERING.EXEMPT_BELOW_POPULATION &&
    military(p) - count < SCATTERING.TROOP_RATIO * (civilians(p) + count)
  ) {
    throw new EngineError(
      "scatter",
      `That would drop your guard below the 30% line — at most ${safeDischargeCount(p)} can be discharged safely.`,
    );
  }
  p.army[ARMY_KEY[type]][tier] -= count;
  p.idlePeasants += count;
  return { player: p, events: [] };
}

export function trainSpies(input: Player, count: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  if (p.idlePeasants < count) throw new EngineError("peasants", "Not enough idle peasants");
  const slots = SLOTS_PER_BUILDING_LEVEL * level(p, "shadow_guild");
  if (p.army.spies + count > slots) throw new EngineError("slots", "Shadow Guild too small");
  pay(p, scale(TRAINING_COSTS.spy, count));
  p.idlePeasants -= count;
  p.army.spies += count;
  return { player: p, events: [] };
}

export function trainScouts(input: Player, count: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  if (p.idlePeasants < count) throw new EngineError("peasants", "Not enough idle peasants");
  const slots = SLOTS_PER_BUILDING_LEVEL * level(p, "rangers_lodge");
  if (p.army.scouts + count > slots) throw new EngineError("slots", "Ranger's Lodge too small");
  pay(p, scale(TRAINING_COSTS.scout, count));
  p.idlePeasants -= count;
  p.army.scouts += count;
  return { player: p, events: [] };
}

export function trainSiegeEngineers(input: Player, count: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  if (p.idlePeasants < count) throw new EngineError("peasants", "Not enough idle peasants");
  if (level(p, "war_foundry") < 1) throw new EngineError("foundry", "War Foundry required");
  if (musterVacancy(p) < count) throw new EngineError("muster", "No free Muster Hall slots");
  pay(p, scale(TRAINING_COSTS.siegeEngineer, count));
  p.idlePeasants -= count;
  p.army.siegeEngineers += count;
  return { player: p, events: [] };
}

/** Build or upgrade a building. Instant — pay the cost, get the level. */
export function build(input: Player, id: BuildingId): EngineResult {
  const p = structuredClone(input);
  const current = level(p, id);
  const target = current + 1;
  if (target > maxLevel(id)) throw new EngineError("max_level", "Already at max level");
  pay(p, buildingCost(id, target));
  p.buildings[id] = target;
  return { player: p, events: [{ type: "buildComplete", building: id, level: target }] };
}

export function setResearch(input: Player, field: ResearchField): EngineResult {
  if (!RESEARCH_FIELDS.some((f) => f.id === field)) {
    throw new EngineError("field", "Unknown research field");
  }
  const p = structuredClone(input);
  p.research.activeField = field; // banked progress on the old project is kept
  return { player: p, events: [] };
}

/** Rest: 5 action turns + 0.2 food/troop → +20 stamina, whole army. */
export function restTroops(input: Player): EngineResult {
  const p = structuredClone(input);
  if (p.starving) throw new EngineError("starving", "Starving armies cannot rest");
  if (p.turnsAvailable < ACTION_TURNS.REST_COST) {
    throw new EngineError("turns", "Not enough action turns");
  }
  const foodCost = STAMINA.REST_FOOD_PER_TROOP * military(p);
  if (p.resources.food < foodCost) throw new EngineError("food", "Not enough food");
  p.turnsAvailable -= ACTION_TURNS.REST_COST;
  p.resources.food -= foodCost;
  p.army.stamina = Math.min(STAMINA.MAX, p.army.stamina + STAMINA.REST_GAIN);
  return { player: p, events: [] };
}

/** Move gold into/out of the Counting House (negative = withdraw). */
export function bankGold(input: Player, amount: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isFinite(amount) || amount === 0) throw new EngineError("amount", "Invalid amount");
  if (amount > 0) {
    if (p.gold < amount) throw new EngineError("gold", "Not enough gold on hand");
    const capacity = STORAGE_PER_LEVEL * level(p, "counting_house");
    if (p.bankedGold + amount > capacity) {
      throw new EngineError("capacity", "Counting House is full");
    }
    p.gold -= amount;
    p.bankedGold += amount;
  } else {
    if (p.bankedGold < -amount) throw new EngineError("banked", "Not that much banked");
    p.bankedGold += amount;
    p.gold -= amount;
  }
  return { player: p, events: [] };
}

/** Move goods into/out of their storage building's vault (negative = withdraw).
 *  Deposits cap at level × STORAGE_PER_LEVEL, like the Counting House. */
export function bankResource(input: Player, r: Resource, amount: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isFinite(amount) || amount === 0) throw new EngineError("amount", "Invalid amount");
  const banked = { ...bankedRes(p) };
  if (amount > 0) {
    if (p.resources[r] < amount) throw new EngineError("resources", `Not enough loose ${r}`);
    const capacity = STORAGE_PER_LEVEL * level(p, STORAGE_BUILDING[r]);
    if (banked[r] + amount > capacity) {
      throw new EngineError("capacity", "That store is full");
    }
    p.resources[r] -= amount;
    banked[r] += amount;
  } else {
    if (banked[r] < -amount) throw new EngineError("banked", "Not that much vaulted");
    banked[r] += amount;
    p.resources[r] -= amount;
  }
  p.bankedResources = banked;
  return { player: p, events: [] };
}

/**
 * Hire mercenaries of a given type and tier straight from the Black Market —
 * footmen/archers/cavalry at light/medium/heavy, no peasants spent. Sellswords
 * still need the matching buildings (heavy cavalry needs Knights' Stables 3 +
 * Forge 3) — they skip the training, not the tech. Gold only, scaled by tier:
 * MERC_PRICE_GOLD × race factor × tier multiplier × (1 − Clan Wonder discount).
 * Capped at 25% of the regular army headcount.
 */
export function hireMercenaries(
  input: Player,
  type: TroopType,
  tier: Tier,
  count: number,
  wonderDiscount = 0,
): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  requireTierBuildings(p, type, tier);
  const cap = Math.floor(MERC_CAP_RATIO * military(p));
  if (mercTotal(p.army.mercenaries) + count > cap) {
    throw new EngineError("merc_cap", "Mercenaries capped at 25% of your regular army");
  }
  const price =
    Math.round(
      MERC_PRICE_GOLD * RACES[p.race].mercCost * TIER_COST_MULT[tier] * (1 - wonderDiscount),
    ) * count;
  if (p.gold < price) throw new EngineError("gold", "Not enough gold");
  p.gold -= price;
  p.army.mercenaries[ARMY_KEY[type]][tier] += count;
  return { player: p, events: [] };
}

/** Buy siege gear — needs the War Foundry level that unlocks the weapon. */
export function buySiegeGear(
  input: Player,
  type: keyof typeof SIEGE_GEAR,
  count: number,
  wonderDiscount = 0,
): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  const step = WAR_FOUNDRY_LADDER.find((s) => s.gearKey === type);
  if (!step || level(p, "war_foundry") < step.level) {
    throw new EngineError("foundry", `${type} requires War Foundry ${step?.level ?? "?"}`);
  }
  const g = SIEGE_GEAR[type];
  const m = count * (1 - wonderDiscount);
  pay(p, {
    gold: Math.round(g.gold * m),
    wood: Math.round(g.wood * m),
    stone: Math.round(g.stone * m),
    ore: Math.round(g.ore * m),
  });
  p.army.siegeGear[type] += count;
  return { player: p, events: [] };
}

/** Repair walls: damagedFraction × wall build cost × 0.5. Restores pop rate fully. */
export function repairWalls(input: Player): EngineResult {
  const p = structuredClone(input);
  const lvl = level(p, "walls");
  if (lvl === 0 || p.wallIntegrity >= 1) throw new EngineError("walls", "Nothing to repair");
  const damaged = 1 - p.wallIntegrity;
  const base = buildingCost("walls", lvl);
  pay(p, {
    gold: Math.round(base.gold * damaged * WALL_REPAIR_COST_FACTOR),
    wood: Math.round(base.wood * damaged * WALL_REPAIR_COST_FACTOR),
    stone: Math.round(base.stone * damaged * WALL_REPAIR_COST_FACTOR),
    ore: Math.round(base.ore * damaged * WALL_REPAIR_COST_FACTOR),
  });
  p.wallIntegrity = 1;
  return { player: p, events: [] };
}

/** Repair a bombarded building (same 0.5 × damage formula as walls). Restores
 *  its integrity — and thus its full storage protection / production / research. */
export function repairBuilding(input: Player, id: BuildingId): EngineResult {
  const p = structuredClone(input);
  const lvl = level(p, id);
  const integrity = p.buildingIntegrity?.[id] ?? 1;
  if (lvl === 0 || integrity >= 1) throw new EngineError("building", "Nothing to repair");
  const damaged = 1 - integrity;
  const base = buildingCost(id, lvl);
  pay(p, {
    gold: Math.round(base.gold * damaged * WALL_REPAIR_COST_FACTOR),
    wood: Math.round(base.wood * damaged * WALL_REPAIR_COST_FACTOR),
    stone: Math.round(base.stone * damaged * WALL_REPAIR_COST_FACTOR),
    ore: Math.round(base.ore * damaged * WALL_REPAIR_COST_FACTOR),
  });
  (p.buildingIntegrity ??= {})[id] = 1;
  return { player: p, events: [] };
}
