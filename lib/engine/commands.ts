// Economy & management commands (spec/architecture.md protocol; costs and
// capacity rules in spec/empire.md). All instant — pacing is cost, never timers.

import { decayExperience, lineRegulars, settleMercenaries } from "./combat/model";
import type { MercArm, SiegeGearType } from "./types";
import {
  ACTION_TURNS,
  HOUSING_PER_HEARTHSTEAD,
  MERCENARIES,
  MERC_PRICE_BY_ARM,
  RESEARCH_EFFECT_PER_LEVEL,
  EFFECT_PER_LEVEL,
  RACES,
  RESEARCH_FIELDS,
  RESEARCH_SWITCH_LOSS,
  SCATTERING,
  SIEGE_SALVAGE_VALUE,
  SIEGE_REPAIR_COST_FACTOR,
  XP,
  SIEGE_GEAR,
  SIEGE_COUNTERS,
  STAMINA,
  storageShelterAtLevel,
  TIER_COST_MULT,
  TRAINING_COSTS,
  TROOPS_PER_MUSTER_HALL,
  WAR_FOUNDRY_LADDER,
  maxLevel,
} from "../constants";
import type { BuildingId, CounterType } from "../constants/buildings";
import type { ResearchField } from "../constants/research";
import { buildingCost, repairCost, type Cost } from "./costs";
import {
  EngineError,
  bankedRes,
  civilians,
  level,
  mercTotal,
  mercMilitary,
  mercsOfArm,
  regularsOfArm,
  researchLevel,
  military,
  structureIntegrity,
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

function canAfford(p: Player, cost: Cost): boolean {
  return (
    p.gold >= cost.gold &&
    p.resources.wood >= cost.wood &&
    p.resources.stone >= cost.stone &&
    p.resources.ore >= cost.ore
  );
}

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

/** Barracks room left. Sellswords take a bed like any other soldier — hiring
 *  them skips population and training time, not quartering. */
function musterVacancy(p: Player): number {
  return (
    level(p, "muster_hall") * TROOPS_PER_MUSTER_HALL -
    military(p) -
    mercMilitary(p.army.mercenaries)
  );
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
    // Every worker role is UNCAPPED — you only need the building (level ≥ 1); its
    // level scales the worker's effectiveness, not the number of slots (economy.md).
    if (level(p, building) === 0) {
      throw new EngineError("building", `Build the ${building} first`);
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
  const before = lineRegulars(p);
  p.army[ARMY_KEY[type]][tier] -= count;
  p.idlePeasants += count;
  p.army.experience = decayExperience(p.army.experience, count, before, XP.LOSS_ON_DISCHARGE);
  // Sellswords serve under the regulars of their arm. Dismiss the regulars and
  // the hired blades above the ratio have nobody left to follow.
  settleMercenaries(p);
  return { player: p, events: [] };
}

export function trainSpies(input: Player, count: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  if (p.idlePeasants < count) throw new EngineError("peasants", "Not enough idle peasants");
  // Spies are uncapped — you need a Shadow Guild, whose level makes each spy more
  // effective (not more slots; espionage.md).
  if (level(p, "shadow_guild") === 0) throw new EngineError("building", "Build the Shadow Guild first");
  pay(p, scale(TRAINING_COSTS.spy, count));
  p.idlePeasants -= count;
  p.army.spies += count;
  return { player: p, events: [] };
}

export function trainScouts(input: Player, count: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  if (p.idlePeasants < count) throw new EngineError("peasants", "Not enough idle peasants");
  // Scouts are uncapped — you need a Ranger's Lodge, whose level makes each scout
  // sharper at recon and catching enemy spies (not more slots; espionage.md).
  if (level(p, "rangers_lodge") === 0) throw new EngineError("building", "Build the Ranger's Lodge first");
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

/** Build or upgrade a building. Instant — pay the cost, get the level.
 *  A cracked work must be mended first: masons will not raise a higher storey
 *  on a broken one, so bombardment stalls your growth until you repair. */
/**
 * Raise a building by `count` levels (default 1).
 *
 * Each level is paid for SEPARATELY at its own price, so building ten in one
 * click costs exactly what ten clicks would — the batch is a convenience, never
 * a discount. If the purse runs out partway the levels already bought stand and
 * the rest are simply not built; only a first level that cannot be afforded is
 * an error, so the button still tells you when you cannot start at all.
 */
export function build(input: Player, id: BuildingId, count = 1): EngineResult {
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  const p = structuredClone(input);
  const events: EngineResult["events"] = [];

  for (let i = 0; i < count; i++) {
    const current = level(p, id);
    const target = current + 1;
    if (target > maxLevel(id)) {
      if (i === 0) throw new EngineError("max_level", "Already at max level");
      break;
    }
    if (current > 0 && structureIntegrity(p, id) < 1) {
      throw new EngineError("damaged", "Repair it to full before building higher");
    }
    const cost = buildingCost(id, target);
    if (i > 0 && !canAfford(p, cost)) break; // bought what the purse allowed
    pay(p, cost); // throws on the first one, which is the useful error
    p.buildings[id] = target;
    events.push({ type: "buildComplete", building: id, level: target });
  }
  return { player: p, events };
}

export function setResearch(input: Player, field: ResearchField): EngineResult {
  if (!RESEARCH_FIELDS.some((f) => f.id === field)) {
    throw new EngineError("field", "Unknown research field");
  }
  const p = structuredClone(input);
  const prev = p.research.activeField;
  // Switching the scholars to a NEW field abandons half the progress banked
  // toward the current field's next level (spec/empire.md) — the price of an
  // undisciplined programme. Re-selecting the same field costs nothing.
  if (prev && prev !== field) {
    p.research.banked[prev] = Math.floor((p.research.banked[prev] ?? 0) * (1 - RESEARCH_SWITCH_LOSS));
  }
  p.research.activeField = field;
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
    const capacity = storageShelterAtLevel(level(p, "counting_house"));
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
 *  Deposits cap at the storage-shelter curve, like the Counting House. */
export function bankResource(input: Player, r: Resource, amount: number): EngineResult {
  const p = structuredClone(input);
  if (!Number.isFinite(amount) || amount === 0) throw new EngineError("amount", "Invalid amount");
  const banked = { ...bankedRes(p) };
  if (amount > 0) {
    if (p.resources[r] < amount) throw new EngineError("resources", `Not enough loose ${r}`);
    const capacity = storageShelterAtLevel(level(p, STORAGE_BUILDING[r]));
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
/**
 * Hire sellswords — now for every arm, engine crews and covert agents included.
 *
 * What you are buying is SPEED: they need no population and no training time.
 * What you are not escaping is anything else — they take barracks beds, they
 * draw wages every turn, they are capped by the regulars of their own arm, and
 * when those regulars die the surplus is paid off and rides away (the cascade,
 * see settleMercenaries). Free Companies is the field that makes a long war
 * affordable, since they now bleed away steadily and must be replaced.
 */
export function hireMercenaries(
  input: Player,
  arm: MercArm,
  tier: Tier,
  count: number,
  wonderDiscount = 0,
): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  const tiered = arm === "footman" || arm === "archer" || arm === "cavalry";
  if (tiered) requireTierBuildings(p, arm as TroopType, tier);
  if (arm === "spy" && level(p, "shadow_guild") < 1) {
    throw new EngineError("shadow_guild", "Hired knives answer only to a Shadow Guild");
  }
  if (arm === "scout" && level(p, "rangers_lodge") < 1) {
    throw new EngineError("rangers_lodge", "Hired rangers muster at a Rangers Lodge");
  }

  // Capped by the regulars of this arm alone — footmen gate merc footmen,
  // rangers gate merc rangers. You cannot shield cavalry with hired archers.
  const cap = Math.floor(regularsOfArm(p, arm) * MERCENARIES.CAP_RATIO);
  if (mercsOfArm(p, arm) + count > cap) {
    throw new EngineError(
      "merc_cap",
      `Sellswords are capped at a third of your own ${arm}s — at most ${Math.max(0, cap - mercsOfArm(p, arm))} more.`,
    );
  }
  // Engine crews and line troops need quartering; covert agents live in town.
  if (arm !== "spy" && arm !== "scout" && musterVacancy(p) < count) {
    throw new EngineError("housing", "No barracks room — even hired blades need a bed");
  }

  const freeCompanies =
    researchLevel(p, "free_companies") *
    (RESEARCH_EFFECT_PER_LEVEL.free_companies ?? EFFECT_PER_LEVEL);
  const price =
    Math.round(
      MERC_PRICE_BY_ARM[arm] *
        RACES[p.race].mercCost *
        (tiered ? TIER_COST_MULT[tier] : 1) *
        (1 - wonderDiscount) *
        Math.max(0, 1 - freeCompanies),
    ) * count;
  if (p.gold < price) throw new EngineError("gold", "Not enough gold");
  p.gold -= price;

  const m = p.army.mercenaries;
  if (arm === "engineer") m.engineers += count;
  else if (arm === "spy") m.spies += count;
  else if (arm === "scout") m.scouts += count;
  else m[ARMY_KEY[arm as TroopType]][tier] += count;
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
    stone: 0, // engines take no stone — that went into the walls it will break
    ore: Math.round(g.ore * m),
  });
  p.army.siegeGear[type] += count;
  return { player: p, events: [] };
}

/** Buy a defensive siege engine — needs the War Foundry level that unlocks it.
 *  Crewed by engineers when you defend (spec/combat.md). */
export function buySiegeCounter(
  input: Player,
  type: CounterType,
  count: number,
  wonderDiscount = 0,
): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  const c = SIEGE_COUNTERS[type];
  if (!c) throw new EngineError("counter", "Unknown defensive engine");
  if (level(p, "war_foundry") < c.foundryLevel) {
    throw new EngineError("foundry", `${c.name} requires War Foundry ${c.foundryLevel}`);
  }
  const m = count * (1 - wonderDiscount);
  pay(p, {
    gold: Math.round(c.gold * m),
    wood: Math.round(c.wood * m),
    stone: 0,
    ore: Math.round(c.ore * m),
  });
  p.army.siegeCounters[type] += count;
  return { player: p, events: [] };
}

/** Repair walls: damagedFraction × wall build cost × 0.5. Restores pop rate fully. */
export function repairWalls(input: Player): EngineResult {
  const p = structuredClone(input);
  const lvl = level(p, "walls");
  if (lvl === 0 || p.wallIntegrity >= 1) throw new EngineError("walls", "Nothing to repair");
  pay(p, repairCost("walls", lvl, p.wallIntegrity));
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
  pay(p, repairCost(id, lvl, integrity));
  (p.buildingIntegrity ??= {})[id] = 1;
  return { player: p, events: [] };
}


// ── Siege upkeep (spec/combat.md) ───────────────────────────────────────────

/**
 * Mend a battered engine type back to whole. Counter fire wears engines down
 * rather than simply destroying them, and a worn engine fires proportionally
 * weaker — so between volleys of a long bombardment this is the command that
 * decides whether you hold. Costs a third of building anew, scaled by damage.
 */
export function repairSiege(input: Player, type: SiegeGearType | CounterType): EngineResult {
  const p = structuredClone(input);
  const isGear = type in SIEGE_GEAR;
  const integrity = isGear
    ? p.army.siegeGearIntegrity[type as SiegeGearType]
    : p.army.siegeCounterIntegrity[type as CounterType];
  const count = isGear
    ? p.army.siegeGear[type as SiegeGearType]
    : p.army.siegeCounters[type as CounterType];
  if (count <= 0) throw new EngineError("siege", "You own none of those");
  if (integrity >= 1) throw new EngineError("siege", "Those engines are sound");

  const spec = isGear ? SIEGE_GEAR[type as SiegeGearType] : SIEGE_COUNTERS[type as CounterType];
  const damage = 1 - integrity;
  const m = count * damage * SIEGE_REPAIR_COST_FACTOR;
  pay(p, {
    gold: Math.round(spec.gold * m),
    wood: Math.round(spec.wood * m),
    stone: 0,
    ore: Math.round(spec.ore * m),
  });
  if (isGear) p.army.siegeGearIntegrity[type as SiegeGearType] = 1;
  else p.army.siegeCounterIntegrity[type as CounterType] = 1;
  return { player: p, events: [] };
}

/** Break an engine up for what the timber and iron will fetch. Half the build
 *  cost back — the pressure valve when a campaign has drained the treasury. */
export function sellSiege(
  input: Player,
  type: SiegeGearType | CounterType,
  count: number,
): EngineResult {
  const p = structuredClone(input);
  if (!Number.isInteger(count) || count <= 0) throw new EngineError("count", "Invalid count");
  const isGear = type in SIEGE_GEAR;
  const have = isGear ? p.army.siegeGear[type as SiegeGearType] : p.army.siegeCounters[type as CounterType];
  if (have < count) throw new EngineError("siege", "You do not own that many");
  const spec = isGear ? SIEGE_GEAR[type as SiegeGearType] : SIEGE_COUNTERS[type as CounterType];
  const integrity = isGear
    ? p.army.siegeGearIntegrity[type as SiegeGearType]
    : p.army.siegeCounterIntegrity[type as CounterType];
  // A wreck is worth less than a whole engine.
  const m = count * SIEGE_SALVAGE_VALUE * integrity;
  p.gold += Math.round(spec.gold * m);
  p.resources.wood += Math.round(spec.wood * m);
  p.resources.ore += Math.round(spec.ore * m);
  if (isGear) p.army.siegeGear[type as SiegeGearType] -= count;
  else p.army.siegeCounters[type as CounterType] -= count;
  return { player: p, events: [] };
}

/**
 * Standing order: ride out at a besieger, or hold the wall?
 *
 * Cavalry are wasted behind stone (they gain nothing from the parapet) and
 * murderous in the open, so a cavalry-heavy defender wants this ON and a
 * footman-heavy one almost certainly does not. Sortieing does not cost you the
 * wall bonus — but it does put your riders where a screen can hold them.
 */
export function setSortie(input: Player, enabled: boolean): EngineResult {
  const p = structuredClone(input);
  p.army.sortieEnabled = enabled;
  return { player: p, events: [] };
}
