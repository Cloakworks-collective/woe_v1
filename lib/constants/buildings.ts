// Buildings — the STRUCTURE of the tree lives here: ids, display metadata, the
// foundry ladder, counter pairings, and derived helpers. Every tunable NUMBER
// (costs, bands, growth, gear tables, housing…) lives in balance.ts — THE
// tuning file — and is re-exported below.

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
  { id: "grange", name: "The Grange", desc: "Each level lifts every farmer's food output (50/turn at L1 → 500 at L10). Farmers are unlimited." },
  { id: "masons_quarry", name: "Mason's Quarry", desc: "Each level lifts every quarryman's stone output (50→500/turn). Quarrymen are unlimited." },
  { id: "deepvein_mine", name: "Deepvein Mine", desc: "Each level lifts every miner's ore output (50→500/turn). Miners are unlimited." },
  { id: "sawyers_mill", name: "Sawyer's Mill", desc: "Each level lifts every lumberjack's wood output (50→500/turn). Lumberjacks are unlimited." },
  { id: "granary", name: "Granary", desc: "+20,000 protected food capacity per level" },
  { id: "timberyard", name: "Timberyard", desc: "+20,000 protected wood capacity per level" },
  { id: "masons_yard", name: "Mason's Yard", desc: "+20,000 protected stone capacity per level" },
  { id: "ironhold", name: "Ironhold", desc: "+20,000 protected ore capacity per level" },
  { id: "counting_house", name: "Counting House", desc: "Bank — +20,000 protected gold capacity per level" },
  { id: "market_square", name: "Market Square", desc: "Merchants are unlimited; each level lets every caravan carry +1,000 goods AND reach the Bazaar faster (L1: 100 turns → L10: 10)" },
  { id: "collegium", name: "The Collegium", desc: "Researchers are unlimited; each level lifts every scholar's research (50→500/turn)" },
  { id: "shadow_guild", name: "Shadow Guild", desc: "Spies are unlimited; each level makes every spy mission bite deeper" },
  { id: "rangers_lodge", name: "Ranger's Lodge", desc: "Scouts are unlimited; each level sharpens recon & catches higher-level enemy spies" },
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

// ── Every tunable number, from THE tuning file ─────────────────────────────

export {
  BUILDING_COST_CURVE,
  GOLD_COST_SHARE,
  BASE_COSTS,
  type RatioBand,
  CIVILIAN_BANDS,
  MILITARY_BANDS,
  TIERED_BAND_INDEX,
  HOUSING_PER_HEARTHSTEAD,
  TROOPS_PER_MUSTER_HALL,
  STORAGE_SHELTER_CURVE,
  GROWTH_CURVE,
  WALL_DAMAGE_POP_PENALTY,
  SETTLEMENT_TITLES,
  TRAINING_COSTS,
  TIER_COST_MULT,
  SIEGE_GEAR,
  SIEGE_COUNTERS,
  BOMBARDABLE,
} from "./balance";

/** Cost-band index by target level: 1–3 / 4–6 / 7–8 / 9–10. */
export function bandIndex(level: number): number {
  if (level <= 3) return 0;
  if (level <= 6) return 1;
  if (level <= 8) return 2;
  return 3;
}

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

export type CounterType = "billhooks" | "forkpoles" | "boiling_oil" | "hoardings" | "counter_engine";

/** Counter types heaviest-crew first — the order engineers man them (like gear). */
export const COUNTER_TYPES: CounterType[] = ["counter_engine", "hoardings", "boiling_oil", "forkpoles", "billhooks"];

/** The counter that neutralises each offensive weapon. */
export const COUNTER_FOR: Record<"ropes" | "ladders" | "rams" | "ballistae" | "trebuchets", CounterType> = {
  ropes: "billhooks",
  ladders: "forkpoles",
  rams: "boiling_oil",
  ballistae: "hoardings",
  trebuchets: "counter_engine",
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

/** Counted, not levelled: you raise MORE of these rather than upgrading one.
 *  A tenth Hearthstead is another cottage, not a grander one. */
export const COUNTED_BUILDING_IDS: BuildingId[] = ["hearthstead", "muster_hall"];

export function isCounted(id: BuildingId): boolean {
  return COUNTED_BUILDING_IDS.includes(id);
}

export function maxLevel(id: BuildingId): number {
  if (isCounted(id)) return Infinity;
  if (TIERED_BUILDING_IDS.includes(id)) return 3;
  return 10;
}

/** Which of the three art stages a structure wears at a given level, so the
 *  town visibly grows as you pour stone into it. The tiered trainers (max 3)
 *  step every level; the 1–10 ladders step at 4 and 8. Counted buildings never
 *  change shape — they only ever multiply — so they keep their single form. */
export function artStage(id: BuildingId, level: number): 1 | 2 | 3 {
  if (isCounted(id)) return 1;
  if (TIERED_BUILDING_IDS.includes(id)) return level >= 3 ? 3 : level >= 2 ? 2 : 1;
  return level >= 8 ? 3 : level >= 4 ? 2 : 1;
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
