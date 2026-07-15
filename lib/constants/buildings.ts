// Buildings — cost model, population model, military tree (spec/buildings.md).

export type BuildingId =
  // 13 levelled civilian buildings
  | "grange"
  | "masons_quarry"
  | "deepvein_mine"
  | "sawyers_mill"
  | "granary"
  | "timberyard"
  | "masons_yard"
  | "ironhold"
  | "counting_house"
  | "market_square"
  | "collegium"
  | "shadow_guild"
  | "rangers_lodge"
  // counted
  | "hearthstead"
  | "muster_hall"
  // military
  | "drill_yard"
  | "fletchers_range"
  | "knights_stables"
  | "forge"
  | "war_foundry"
  | "walls";

export interface BuildingMeta {
  id: BuildingId;
  name: string;
  desc: string;
}

export const CIVILIAN_BUILDINGS: BuildingMeta[] = [
  { id: "grange", name: "The Grange", desc: "+20 farmer slots per level — food production" },
  { id: "masons_quarry", name: "Mason's Quarry", desc: "+20 quarryman slots per level — stone production" },
  { id: "deepvein_mine", name: "Deepvein Mine", desc: "+20 miner slots per level — ore production" },
  { id: "sawyers_mill", name: "Sawyer's Mill", desc: "+20 lumberjack slots per level — wood production" },
  { id: "granary", name: "Granary", desc: "+20,000 protected food capacity per level" },
  { id: "timberyard", name: "Timberyard", desc: "+20,000 protected wood capacity per level" },
  { id: "masons_yard", name: "Mason's Yard", desc: "+20,000 protected stone capacity per level" },
  { id: "ironhold", name: "Ironhold", desc: "+20,000 protected ore capacity per level" },
  { id: "counting_house", name: "Counting House", desc: "Bank — +20,000 protected gold capacity per level" },
  { id: "market_square", name: "Market Square", desc: "+20 merchant slots, +1,000 caravan capacity per level" },
  { id: "collegium", name: "The Collegium", desc: "+20 researcher slots per level — research" },
  { id: "shadow_guild", name: "Shadow Guild", desc: "+20 spy slots per level — espionage" },
  { id: "rangers_lodge", name: "Ranger's Lodge", desc: "+20 scout slots per level — recon & counter-espionage" },
];

export const CIVILIAN_LEVELLED_IDS = CIVILIAN_BUILDINGS.map((b) => b.id);

export const MILITARY_BUILDINGS: BuildingMeta[] = [
  { id: "muster_hall", name: "Muster Hall", desc: "Barracks — houses 10 troops each (counted)" },
  { id: "drill_yard", name: "Drill Yard", desc: "Footmen: light → medium → heavy (levels 1–3)" },
  { id: "fletchers_range", name: "Fletcher's Range", desc: "Archers: light → medium → heavy (levels 1–3)" },
  { id: "knights_stables", name: "Knights' Stables", desc: "Cavalry: light → medium → heavy (levels 1–3)" },
  { id: "forge", name: "The Forge", desc: "Weapons & armour stock — gates troop tiers (levels 1–3)" },
  { id: "war_foundry", name: "War Foundry", desc: "Siege engineering ladder (levels 1–10)" },
  { id: "walls", name: "The Walls", desc: "Defence (levels 1–10); damaged walls cut pop growth up to 50%" },
];

/** Tiered trainers: 3 levels mapping 1:1 to light/medium/heavy. */
export const TIERED_BUILDING_IDS: BuildingId[] = [
  "drill_yard",
  "fletchers_range",
  "knights_stables",
  "forge",
];

// ── Cost model ──────────────────────────────────────────────────────────────
// resourceCost(level) = baseCost × 1.5^(level−1), split by the ratio bands.
// goldCost(level)     = 0.5 × resourceCost(level).

export const COST_GROWTH = 1.5;
export const GOLD_COST_SHARE = 0.5;

export const BASE_COSTS = {
  civilian: 800, // levelled civilian buildings
  military: 1200, // levelled/tiered military buildings
  hearthstead: 300, // flat per instance
  muster_hall: 500, // flat per instance
};

/** [wood, stone, ore] shares of the non-gold cost. */
export type RatioBand = [number, number, number];

// Buildings cost gold + wood + stone only — ore is reserved for arming
// troops (see TRAINING_COSTS). The [wood, stone, ore] bands keep ore at 0.

/** Civilian: wood-heavy early → stone-heavy late; wood floors at 30%. */
export const CIVILIAN_BANDS: RatioBand[] = [
  [0.6, 0.4, 0], // levels 1–3
  [0.4, 0.6, 0], // levels 4–6
  [0.3, 0.7, 0], // levels 7–8
  [0.3, 0.7, 0], // levels 9–10
];

/** Military: stone-heavy (its ore now goes into weapons, not walls); wood floors at 20%. */
export const MILITARY_BANDS: RatioBand[] = [
  [0.45, 0.55, 0], // levels 1–3
  [0.3, 0.7, 0], // levels 4–6
  [0.25, 0.75, 0], // levels 7–8
  [0.2, 0.8, 0], // levels 9–10
];

export function bandIndex(level: number): number {
  if (level <= 3) return 0;
  if (level <= 6) return 1;
  if (level <= 8) return 2;
  return 3;
}

/** Tiered buildings: level 1 = band 1–3, level 2 = band 4–6, level 3 = band 9–10. */
export const TIERED_BAND_INDEX: Record<number, number> = { 1: 0, 2: 1, 3: 3 };

// ── Population model ────────────────────────────────────────────────────────

export const HOUSING_PER_HEARTHSTEAD = 10;
export const TROOPS_PER_MUSTER_HALL = 10;
export const SLOTS_PER_BUILDING_LEVEL = 20; // workers, merchants, researchers, spies, scouts
export const STORAGE_PER_LEVEL = 20000; // protected capacity per storage-building level

/** Growth: 1/day … 100/day across 130 total civilian levels. */
export const GROWTH = {
  BASE_PER_DAY: 1,
  MAX_PER_DAY: 100,
  TOTAL_CIVILIAN_LEVELS: 130, // 13 buildings × 10 levels
};

/** Fully rubbled walls = −50% pop/day (proportional to damage; temporary). */
export const WALL_DAMAGE_POP_PENALTY = 0.5;

/** Settlement titles by total civilian levels (cosmetic-but-visible). */
export const SETTLEMENT_TITLES = [
  { title: "Village", min: 0 },
  { title: "Town", min: 40 },
  { title: "City", min: 90 },
] as const;

// ── Training costs (base = light tier; tunable) ─────────────────────────────

// Ore is the war-metal: buildings need none, so every scrap of it goes into
// blades, arrowheads, and barding. Troop ore costs are correspondingly steep.
export const TRAINING_COSTS = {
  warrior: { gold: 50, wood: 0, stone: 0, ore: 0 },
  footman: { gold: 100, wood: 20, stone: 0, ore: 90 }, // sword, shield, mail
  archer: { gold: 100, wood: 40, stone: 0, ore: 55 }, // arrowheads + bow
  cavalry: { gold: 300, wood: 20, stone: 0, ore: 130 }, // barding, lance, blade
  siegeEngineer: { gold: 200, wood: 0, stone: 0, ore: 0 },
  spy: { gold: 300, wood: 0, stone: 0, ore: 0 },
  scout: { gold: 200, wood: 0, stone: 0, ore: 0 },
};

/** Equipment cost multiplier per tier (combat power ≈ 1 / 1.8 / 3). */
export const TIER_COST_MULT = { light: 1, medium: 2, heavy: 4 } as const;

// ── War Foundry ladder (levels 1–10, offense/counter pairs) ────────────────

export interface FoundryStep {
  level: number;
  side: "offense" | "defense";
  name: string;
  gearKey?: "ropes" | "ladders" | "rams" | "ballistae" | "trebuchets";
  counters?: "ropes" | "ladders" | "rams" | "ballistae" | "trebuchets";
}

export const WAR_FOUNDRY_LADDER: FoundryStep[] = [
  { level: 1, side: "offense", name: "Ropes & Grapples", gearKey: "ropes" },
  { level: 2, side: "defense", name: "Bill-hooks", counters: "ropes" },
  { level: 3, side: "offense", name: "Ladders", gearKey: "ladders" },
  { level: 4, side: "defense", name: "Fork Poles", counters: "ladders" },
  { level: 5, side: "offense", name: "Battering Ram", gearKey: "rams" },
  { level: 6, side: "defense", name: "Boiling Oil", counters: "rams" },
  { level: 7, side: "offense", name: "Ballista", gearKey: "ballistae" },
  { level: 8, side: "defense", name: "Hoardings", counters: "ballistae" },
  { level: 9, side: "offense", name: "Trebuchet", gearKey: "trebuchets" },
  { level: 10, side: "defense", name: "Counter-Engine", counters: "trebuchets" },
];

/** Each defensive counter reduces its paired weapon's effect by 75% (tunable). */
export const COUNTER_REDUCTION = 0.75;

/** Offensive siege gear: purchase cost + engineer crew required. */
export const SIEGE_GEAR = {
  ropes: { gold: 50, wood: 10, stone: 0, ore: 5, crew: 1 },
  ladders: { gold: 100, wood: 50, stone: 0, ore: 10, crew: 1 },
  rams: { gold: 400, wood: 200, stone: 0, ore: 50, crew: 2 },
  ballistae: { gold: 800, wood: 300, stone: 20, ore: 100, crew: 3 },
  trebuchets: { gold: 2000, wood: 800, stone: 100, ore: 300, crew: 5 },
};

export const WALL_NAMES = [
  "", // level 0 — no walls
  "Timber Palisade",
  "Earthen Rampart",
  "Motte & Bailey",
  "Stone Footings",
  "Curtain Wall",
  "Flanking Towers",
  "Machicolated Wall",
  "The Barbican",
  "Concentric Walls",
  "The Citadel",
];

export function maxLevel(id: BuildingId): number {
  if (id === "hearthstead" || id === "muster_hall") return Infinity;
  if (TIERED_BUILDING_IDS.includes(id)) return 3;
  return 10;
}

// ── Bombard targets & integrity effects (spec/combat.md) ────────────────────

/** Storage buildings — their integrity scales protected capacity. */
export const STORAGE_BUILDING: Record<"food" | "wood" | "stone" | "ore" | "gold", BuildingId> = {
  food: "granary",
  wood: "timberyard",
  stone: "masons_yard",
  ore: "ironhold",
  gold: "counting_house",
};

/** Producer buildings — their integrity scales output of that resource. */
export const PRODUCTION_BUILDINGS: BuildingId[] = [
  "grange",
  "masons_quarry",
  "deepvein_mine",
  "sawyers_mill",
];

/**
 * Once the walls are down, a bombard's stray fire lands on a random building,
 * weighted: storages take the most (there is the loot), then production, then
 * the Collegium. Only buildings the defender actually owns are eligible.
 */
export const BOMBARDABLE: { id: BuildingId; weight: number }[] = [
  { id: "granary", weight: 3 },
  { id: "timberyard", weight: 3 },
  { id: "masons_yard", weight: 3 },
  { id: "ironhold", weight: 3 },
  { id: "counting_house", weight: 3 },
  { id: "grange", weight: 2 },
  { id: "masons_quarry", weight: 2 },
  { id: "deepvein_mine", weight: 2 },
  { id: "sawyers_mill", weight: 2 },
  { id: "collegium", weight: 1 },
];
