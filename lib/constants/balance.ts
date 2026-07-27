// ═══════════════════════════════════════════════════════════════════════════
// THE BALANCE FILE — every number that shapes how the game plays, in one place.
//
// This is the single tuning surface for an era: change a value here, restart
// the dev server (or reseed the world if the change invalidates old saves),
// and the next age behaves differently. Everything is PURE DATA — numbers,
// strings, tables; no functions — so a future per-era override layer can diff
// and merge it (see spec/balance.md).
//
// What does NOT live here: display text (descriptions.ts), structural identity
// (building/field/race IDs, counter pairings, phase order), formula SHAPES
// (those live in the engine and read their parameters from here).
//
// Units convention: every value is commented with its unit —
//   /turn  · per 10-minute game turn        gold/wood/stone/ore/food · units
//   frac   · fraction 0–1                   ×  · multiplier (1 = neutral)
//   turns/hours/days · durations            pts · ranking score points
// ═══════════════════════════════════════════════════════════════════════════

import type { BuildingId } from "./buildings";
import type { Curve } from "./curves";
import type { Race, RaceModifiers } from "./races";

// ─── 1 · TIME & PACING ──────────────────────────────────────────────────────

export const TURN_MINUTES = 10; // minutes of real time per game turn
export const TURNS_PER_DAY = 144; // one game "day" (dawn to dawn)
export const TICKS_PER_HOUR = 6;

/** No attacks of any kind during the first N days of an era. */
export const ERA_PEACE_DAYS = 5; // days
/** Attack immunity for players joining mid-era. */
export const NEWCOMER_SHIELD_HOURS = 72; // hours

// ─── 2 · STARTING EMPIRE ────────────────────────────────────────────────────

/** What every new banner begins with (lib/engine/newEmpire.ts). */
export const START = {
  GOLD: 5000, // gold
  RESOURCES_EACH: 1000, // food/wood/stone/ore, each
  IDLE_PEASANTS: 80,
  LIGHT_FOOTMEN: 20, // total starting pop = peasants + footmen = 100
  STAMINA: 100,
  /** Founding structures — level-1 banking so day-one raids can't strip a
   *  newcomer bare, plus homes and two barracks. */
  BUILDINGS: {
    hearthstead: 15,
    muster_hall: 2,
    counting_house: 1,
    granary: 1,
    timberyard: 1,
    masons_yard: 1,
    ironhold: 1,
  } as Partial<Record<BuildingId, number>>,
};

// ─── 3 · POPULATION & GROWTH ────────────────────────────────────────────────

/** Settlers/day as a CURVE of x = total civilian building levels (0–130).
 *  Default: linear 1/day at 0 levels → 100/day at all 130. Arrivals beyond
 *  empty Hearthstead beds are LOST, never queued. (Engine floors at 1.) */
export const GROWTH_CURVE: Curve = { kind: "expr", formula: "1 + 99 * x / 130" };

export const HOUSING_PER_HEARTHSTEAD = 10; // beds per hearthstead

/** Fully rubbled walls = −50% pop/day (proportional to damage; temporary). */
export const WALL_DAMAGE_POP_PENALTY = 0.5; // frac

/** Peasants scatter at the daily reset when troops guard too few of them. */
export const SCATTERING = {
  TROOP_RATIO: 0.3, // frac — scatter if troops < 30% of civilians
  EXEMPT_BELOW_POPULATION: 500, // empires under this total pop never scatter
};

/** Settlement titles by total civilian levels (cosmetic-but-visible). */
export const SETTLEMENT_TITLES = [
  { title: "Village", min: 0 },
  { title: "Town", min: 40 },
  { title: "City", min: 90 },
] as const;

// ─── 4 · ECONOMY ────────────────────────────────────────────────────────────

/**
 * Gold per civilian per turn at 100% tax.
 * Rebalanced 40 → 0.4 (2026-07, sim-driven): anchor is one civilian at 50% tax
 * netting ~29 g/day, so a mid-game army costs DAYS of income to rebuild and
 * treasury stays a healthy few % of ranking score.
 */
export const GOLD_PER_CIVILIAN_AT_FULL_TAX = 0.4; // gold/turn

export const DEFAULT_TAX_RATE = 0.5; // frac

/**
 * The production model: workers are UNLIMITED; each building level lifts every
 * worker's output. y = units/turn per worker at 0% tax, as a CURVE of
 * x = building level. Default: linear 50 × level — 50/turn at level 1 up to
 * 500/turn at level 10. Also the per-scholar research rate (× Collegium level).
 */
export const WORKER_OUTPUT_CURVE: Curve = { kind: "linear", base: 0, perX: 50 };

/** Food consumed per person (civilians + regular troops) per turn. */
export const FOOD_UPKEEP_PER_PERSON = 0.1; // food/turn

// Surrender — the white flag halves the economy and locks your sword arm.
export const SURRENDER_TAX_FACTOR = 0.5; // × on tax income
export const SURRENDER_PRODUCTION_FACTOR = 0.5; // × on production
export const SURRENDER_DAYS_PER_ERA = 20; // days, cumulative per era
export const SURRENDER_TICKS_PER_ERA = SURRENDER_DAYS_PER_ERA * TURNS_PER_DAY;
/** After lowering the flag, no fresh attacks for this long (revenge exempt). */
export const SURRENDER_REATTACK_COOLDOWN_TICKS = 18 * TICKS_PER_HOUR;

// Mercenaries — one merc's upkeep ≈ five civilians' net income: a premium.
export const MERC_UPKEEP_GOLD_PER_TURN = 1; // gold/turn; unpaid mercs all defect
export const MERC_CAP_RATIO = 0.25; // frac of regular army headcount
export const MERC_PRICE_GOLD = 500; // gold, light tier; × race mercCost × wonder discount

/** Protected capacity as a CURVE of x = storage-building level (× integrity
 *  applied by the engine). Default: linear 20,000 per level. */
export const STORAGE_SHELTER_CURVE: Curve = { kind: "linear", base: 0, perX: 20000 };

// ─── 5 · BUILDING COSTS ─────────────────────────────────────────────────────
// resourceCost(level) = baseCost × BUILDING_COST_CURVE(level), split by ratio
// bands. goldCost(level) = GOLD_COST_SHARE × resourceCost(level).

/** Cost MULTIPLIER as a curve of x = target level. Default: ×1.5 per level. */
export const BUILDING_COST_CURVE: Curve = { kind: "expr", formula: "1.5 ^ (x - 1)" };
export const GOLD_COST_SHARE = 0.5; // frac of the resource cost, paid in gold

export const BASE_COSTS = {
  civilian: 800, // levelled civilian buildings
  military: 1200, // levelled/tiered military buildings
  hearthstead: 300, // flat per instance
  muster_hall: 500, // flat per instance
};

/** [wood, stone, ore] shares of the non-gold cost. Buildings use no ore —
 *  it is reserved for arming troops (TRAINING_COSTS). */
export type RatioBand = [number, number, number];

/** Civilian: wood-heavy early → stone-heavy late. */
export const CIVILIAN_BANDS: RatioBand[] = [
  [0.6, 0.4, 0], // levels 1–3
  [0.4, 0.6, 0], // levels 4–6
  [0.3, 0.7, 0], // levels 7–8
  [0.3, 0.7, 0], // levels 9–10
];

/** Military: stone-heavy (its ore goes into weapons, not walls). */
export const MILITARY_BANDS: RatioBand[] = [
  [0.45, 0.55, 0], // levels 1–3
  [0.3, 0.7, 0], // levels 4–6
  [0.25, 0.75, 0], // levels 7–8
  [0.2, 0.8, 0], // levels 9–10
];

/** Tiered trainers (3 levels): which cost band each tier level uses. */
export const TIERED_BAND_INDEX: Record<number, number> = { 1: 0, 2: 1, 3: 3 };

export const TROOPS_PER_MUSTER_HALL = 10; // beds per hall

/** Wall repair: damagedFraction × wall build cost × this factor. */
export const WALL_REPAIR_COST_FACTOR = 0.5; // frac

// ─── 6 · RESEARCH ───────────────────────────────────────────────────────────

export const MAX_FIELD_LEVEL = 5; // levels per field (10 fields)

/** Each level = +20% of the field's max effect (all fields). */
export const EFFECT_PER_LEVEL = 0.2; // frac

/**
 * Research cost is GLOBAL and progressive: the price of your x-th research
 * level overall (any field) is this CURVE, in research points — the ORDER you
 * research in is the strategy. Default: geometric 2000 × 1.3^(x−1). (Engine
 * rounds to whole points.)
 */
export const RESEARCH_COST_CURVE: Curve = { kind: "expr", formula: "2000 * 1.3 ^ (x - 1)" };

/** Fraction of the CURRENT field's banked progress LOST when the scholars are
 *  re-pointed to a different field. */
export const RESEARCH_SWITCH_LOSS = 0.5; // frac

// ─── 7 · UNITS & TRAINING ───────────────────────────────────────────────────

/** Unit base stats (light tier): attack / defence. */
export const UNIT_STATS = {
  footman: { attack: 10, defence: 10 },
  archer: { attack: 12, defence: 6 },
  cavalry: { attack: 15, defence: 8 },
  siegeEngineer: { attack: 0, defence: 5 }, // crew only
};

/** Combat power per tier (heavy ≈ 3 lights; costs ×1/×2/×4). */
export const TIER_POWER = { light: 1, medium: 1.8, heavy: 3 } as const;

/** Per-light training costs; medium ×2, heavy ×4 (TIER_COST_MULT). Ore is the
 *  war-metal — buildings need none, troops eat it. */
export const TRAINING_COSTS = {
  footman: { gold: 150, wood: 20, stone: 0, ore: 90 }, // muster + sword, shield, mail
  archer: { gold: 150, wood: 40, stone: 0, ore: 55 }, // muster + arrowheads + bow
  cavalry: { gold: 350, wood: 20, stone: 0, ore: 130 }, // muster + barding, lance, blade
  siegeEngineer: { gold: 200, wood: 0, stone: 0, ore: 0 },
  spy: { gold: 300, wood: 0, stone: 0, ore: 0 },
  scout: { gold: 200, wood: 0, stone: 0, ore: 0 },
};

/** Equipment cost multiplier per tier. */
export const TIER_COST_MULT = { light: 1, medium: 2, heavy: 4 } as const;

// ─── 8 · BATTLE ─────────────────────────────────────────────────────────────

export const ACTION_TURNS = {
  PER_GAME_TURN: 2, // regained each game turn
  START: 200,
  CAP: 500,
  ATTACK_COST: 10,
  SPY_MISSION_COST: 5,
  SCOUT_RECON_COST: 2,
  REST_COST: 5,
};

export const STAMINA = {
  MAX: 100,
  PASSIVE_RECOVERY_PER_TURN: 1, // pts/turn
  DRAIN_PER_ROUND_ATTACKER: 8, // pts/round
  DRAIN_PER_ROUND_DEFENDER: 5, // pts/round
  REST_GAIN: 20, // pts per Rest command
  REST_FOOD_PER_TROOP: 0.2, // food per troop per Rest
  /** staminaMod = MOD_BASE + MOD_PER_POINT × stamina. */
  MOD_BASE: 0.5,
  MOD_PER_POINT: 0.005,
  /** Raid/siege/bombard blocked vs defenders below this (mercy rule). */
  MERCY_FLOOR: 25, // pts
};

export const MAX_ROUNDS = 10; // rounds per battle (= committed action turns)
export const K_LETHALITY = 2; // casualties = damage / (k × effective defence)
export const BREAK_THRESHOLD = 0.3; // frac — a side breaks below 30% strength
export const LUCK_SWING = 0.1; // frac — ±10% rolled per side per round

/** Wall defence bonus (frac) as a curve of x = wall level (× integrity and
 *  race walls factor applied by the engine). Default: +10%/level, Citadel
 *  (10) = +100%. */
export const WALL_BONUS_CURVE: Curve = { kind: "linear", base: 0, perX: 0.1 };

/** Siege engine fire per crewed engine per round. */
export const ENGINE_FIRE = {
  ballistae: { troopDamage: 40, wallDamage: 0 },
  trebuchets: { troopDamage: 60, wallDamage: 0.05 }, // wall frac/round
  rams: { troopDamage: 0, wallDamage: 0.03 },
};

/** Escalade: troops covered per crewed team (bypass the wall bonus). */
export const ESCALADE_COVERAGE = { ropes: 10, ladders: 25 }; // troops/team

/** XP bands by defenderScore / attackerScore ratio. */
export const XP = {
  MAX: 100,
  REFUSAL_RATIO: 1.75, // ≥75% stronger → attack refused (revenge exempt)
  BOLD: { min: 1.2, gain: 8 },
  FAIR: { min: 0.8, gain: 5 },
  WEAK: { min: 0.5, gain: 1 },
  BULLY_GAIN: -5, // > 50% weaker
  DEFENDER_GAIN: 5, // always
};

export const LOOT = {
  FRACTION: 0.25, // frac of unstored resources / unbanked gold
  BIG_TARGET_RATIO: 1.5, // target ≥150% strength → bonus loot
  BIG_TARGET_BONUS: 1.5, // ×
  SMALL_TARGET_RATIO: 0.5, // target ≤50% → scaled down
  SMALL_TARGET_FLOOR: 0.25, // × floor
};

export const REVENGE_WINDOW_HOURS = 18; // hours

/** Attacker loses this share of committed siege gear on defeat. */
export const SIEGE_GEAR_LOSS_ON_DEFEAT = 0.5; // frac

// Bombard — the pure artillery duel.
/** Building integrity damage per trebuchet per round (once fire spills past
 *  the walls). */
export const BUILDING_DAMAGE_PER_TREB = 0.03; // frac/treb/round
/** Buildings can only be bombed down to this floor — cracked open, never
 *  levelled. */
export const BUILDING_INTEGRITY_FLOOR = 0.5; // frac
/** Bombard pounds the walls until integrity ≤ this, THEN hits the town. */
export const WALL_BOMBARD_PIVOT = 0.5; // frac

/** Once the walls are down, stray bombard fire lands on a random building,
 *  weighted — storages take the most (there is the loot). */
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

// ─── 9 · SIEGE EQUIPMENT ────────────────────────────────────────────────────

/** Offensive siege gear: purchase cost + engineer crew required. */
export const SIEGE_GEAR = {
  ropes: { gold: 50, wood: 10, stone: 0, ore: 5, crew: 1 },
  ladders: { gold: 100, wood: 50, stone: 0, ore: 10, crew: 1 },
  rams: { gold: 400, wood: 200, stone: 0, ore: 50, crew: 2 },
  ballistae: { gold: 800, wood: 300, stone: 20, ore: 100, crew: 3 },
  trebuchets: { gold: 2000, wood: 800, stone: 100, ore: 300, crew: 5 },
};

/** Defensive counters — purchased & crewed like gear, manned when you DEFEND;
 *  each crewed counter cancels ONE incoming engine of its paired weapon. */
export const SIEGE_COUNTERS: Record<
  "billhooks" | "forkpoles" | "boiling_oil" | "hoardings" | "counter_engine",
  { gold: number; wood: number; stone: number; ore: number; crew: number; foundryLevel: number; counters: keyof typeof SIEGE_GEAR; name: string }
> = {
  billhooks: { gold: 50, wood: 10, stone: 5, ore: 5, crew: 1, foundryLevel: 2, counters: "ropes", name: "Bill-hooks" },
  forkpoles: { gold: 100, wood: 50, stone: 10, ore: 10, crew: 1, foundryLevel: 4, counters: "ladders", name: "Fork Poles" },
  boiling_oil: { gold: 400, wood: 100, stone: 100, ore: 50, crew: 2, foundryLevel: 6, counters: "rams", name: "Boiling Oil" },
  hoardings: { gold: 800, wood: 300, stone: 200, ore: 100, crew: 3, foundryLevel: 8, counters: "ballistae", name: "Hoardings" },
  counter_engine: { gold: 2000, wood: 800, stone: 200, ore: 300, crew: 5, foundryLevel: 10, counters: "trebuchets", name: "Counter-Engine" },
};

// ─── 10 · ESPIONAGE ─────────────────────────────────────────────────────────

export const SABOTAGE_PER_SPY = 0.5; // gear destroyed = spiesSent × this
export const TORCH_PCT_PER_SPY = 0.01; // frac of unstored resources per spy
export const TORCH_CAP = 0.25; // frac cap per mission
export const UNREST = { HOURS: 24, TAX_PENALTY: 0.25, PRODUCTION_PENALTY: 0.25 };

/** Mission effect × (1 + this × Shadow Guild level). */
export const GUILD_EFFECT_PER_LEVEL = 0.1; // frac/level

/** ±20% luck on mission effect and catch roll (twice battle variance). */
export const SPY_LUCK_SWING = 0.2; // frac

export const CATCH = {
  PER_SPY_PER_LODGE_LEVEL: 0.005, // frac — spiesSent × 0.5% × lodgeLevel
  MAX: 0.9, // frac cap
  PATHFINDING_PER_LEVEL: 0.2, // × (1 + this × pathfindingLevel)
};

/** Scout recon: fuzzy army size ±this; Pathfinding tightens toward exact. */
export const RECON_FUZZ = 0.2; // frac

// ─── 11 · MARKET (the Grand Bazaar) ─────────────────────────────────────────

/** Caravan capacity per merchant = this × Market Square level. */
export const CARAVAN_CAPACITY_PER_MARKET_LEVEL = 1000; // units

/** Delivery time (turns) as a curve of x = Market Square level, floored at
 *  MIN_TURNS by the engine. Default: 110 − 10×level — 100 turns at L1 down to
 *  10 at L10. Goods aren't buyable (and don't count toward price/supply)
 *  until they arrive. */
export const CARAVAN_DELIVERY_CURVE: Curve = { kind: "linear", base: 110, perX: -10 };
export const CARAVAN_DELIVERY_MIN_TURNS = 10; // turns floor

/** Fee on every sale, paid by the seller, BURNED (the gold sink). */
export const MARKET_FEE = 0.05; // frac

/** Ask prices are whole gold per unit, bounded to this band. */
export const MARKET_PRICE_MIN = 2; // gold
export const MARKET_PRICE_MAX = 50; // gold

// ─── 12 · CLANS ─────────────────────────────────────────────────────────────

export const LEADERSHIP = { LEADERS: 1, VICE_LEADERS: 1, OFFICERS: 3 };

export const STORAGE_CAP_PER_LEVEL = 250000; // units per resource type
export const WITHDRAW_MULTIPLE = 3; // withdrawable = this × lifetime deposits − withdrawn

/** Clan Hall (levels 1–4): member cap + tax-penalty shelter. */
export const HALL = [
  { level: 1, memberCap: 5, taxPenaltyFelt: 1.0 },
  { level: 2, memberCap: 10, taxPenaltyFelt: 0.83 },
  { level: 3, memberCap: 15, taxPenaltyFelt: 0.66 },
  { level: 4, memberCap: 20, taxPenaltyFelt: 0.5 },
];

export const WONDER_DISCOUNT_PER_LEVEL = 0.1; // frac/level off merc/troop/siege costs
export const WONDER_REQUIRES_STORAGE = { 1: 4, 2: 7, 3: 10 } as const;

/** Mending a bombarded clan work costs this fraction of its current-level build
 *  cost, scaled by the damage taken (1 − integrity). Mirrors the empire wall
 *  repair factor. Paid from the clan pool. */
export const CLAN_REPAIR_COST_FACTOR = 0.5;

/** Clan build costs — pure data (`each` = wood AND stone AND ore, per level).
 *  hall[1].gold is the solo founding fee. Derived accessors in clans.ts. */
export const CLAN_BUILD_COSTS = {
  storagePerLevel: { gold: 100000, each: 50000 },
  hall: [
    null,
    { gold: 50000, each: 0 }, // L1 — the founding fee
    { gold: 500000, each: 250000 },
    { gold: 1500000, each: 750000 },
    { gold: 3000000, each: 1500000 },
  ],
  wonder: [
    null,
    { gold: 1000000, each: 500000 },
    { gold: 2500000, each: 1250000 },
    { gold: 5000000, each: 2500000 },
  ],
};

export const FOUNDING_MEMBERS = 5; // legacy member-cap fallback (Hall L1 cap)

export const WAR = {
  DAMAGE_BONUS: 1.0, // frac — +100% battle damage both ways
  NET_REGULAR_KILLS_TO_WIN: 200,
  XP_TRANSFER: 0.05, // frac — losers −5% army XP, winners +5% (cap 100)
  TRIBUTE_RATE: 0.2, // frac of production per turn…
  TRIBUTE_TURNS: 144, // …for one day…
  TRIBUTE_CAP_GOLD_EQ: 1000000, // …or until this gold-equivalent
  TRUCE_HOURS: 48, // loser can't be re-declared on; victory clocks frozen
};

export const CHURN = {
  REJOIN_COOLDOWN_HOURS: 48, // after leaving or being kicked
  MAX_DEPARTURES_PER_ERA: 2, // leaves + kicks both count
};

// ─── 13 · VICTORY & RANKING ─────────────────────────────────────────────────

export const HOLD_CLOCKS = {
  CUMULATIVE_HOURS: 72, // at #1, never resets
  STREAK_HOURS: 12, // consecutive at #1, resets when knocked off
};

export const POPULATION_FLOORS = {
  GRAND_OVERLORD: 10000, // civilians + regular troops, no mercs
  CLAN: 150000, // total across the clan
};

/** Ranking score weights — the visible empire. Siege gear/engineers, spies,
 *  scouts, mercenaries, and shadow research are worth ZERO. */
export const SCORE = {
  PER_CIVILIAN: 10, // pts
  PER_TROOP_BASE: 10, // pts × tier power (1 / 1.8 / 3)
  PER_BUILDING_LEVEL: 200, // pts, levelled buildings (civilian + military)
  PER_COUNTED_BUILDING: 50, // pts — hearthsteads, muster halls
  GOLD_DIVISOR: 100, // pts = gold ÷ this
  RESOURCE_DIVISOR: 2000, // pts = resources ÷ this (bulk ≈ 0.05 g each)
  PER_XP_POINT: 100, // pts, army experience 0–100
  PER_RESEARCH_LEVEL: 1000, // pts, ranked fields only (7 of 10)
};

/** Walls ranking score (pts) as a curve of x = wall level (× integrity applied
 *  by the engine). Default: quadratic level² × 100. */
export const WALLS_SCORE_CURVE: Curve = { kind: "polynomial", coefficients: [0, 0, 100] };

/** Clan score adds building points × integrity. */
export const CLAN_BUILDING_POINTS = {
  storage: 500, // pts × level × integrity
  hall: 2000,
  wonder: 10000,
};

// ─── 14 · RACES ─────────────────────────────────────────────────────────────
// Ported from Simon Taylor's 2006 balance workbook (races2.xls "Proposed"),
// with deliberate divergences (see races.ts header). NOT sum-zero; balance is
// judged by equal-cost army power. All values are multipliers (1 = neutral).

export const RACES: Record<Race, RaceModifiers> = {
  human: {
    production: { food: 1.25, wood: 1.25, stone: 1.25, ore: 1.25 },
    attack: 1.0,
    defence: 1.0,
    units: { footman: 1.1, archer: 1.1, cavalry: 1.1 },
    siege: 1.0,
    walls: 1.0,
    spy: 1.25,
    scout: 1.0,
    mercCost: 1.0,
  },
  elf: {
    production: { food: 1.2, wood: 1.5, stone: 0.6, ore: 0.5 },
    attack: 1.0,
    defence: 0.95,
    units: { footman: 0.9, archer: 1.35, cavalry: 1.0 },
    siege: 0.9,
    walls: 0.9,
    spy: 1.05,
    scout: 1.0,
    mercCost: 1.0,
  },
  orc: {
    production: { food: 1.4, wood: 0.6, stone: 0.8, ore: 1.4 },
    attack: 1.0,
    defence: 1.0,
    units: { footman: 0.9, archer: 1.05, cavalry: 1.25 },
    siege: 0.8,
    walls: 0.8,
    spy: 0.9,
    scout: 1.0,
    mercCost: 1.0,
  },
  troll: {
    production: { food: 0.7, wood: 0.8, stone: 1.6, ore: 1.1 },
    attack: 1.0,
    defence: 1.05,
    units: { footman: 1.25, archer: 0.8, cavalry: 0.8 },
    siege: 1.4,
    walls: 1.1,
    spy: 0.9,
    scout: 1.0,
    mercCost: 1.0,
  },
  dwarf: {
    production: { food: 0.7, wood: 0.4, stone: 1.4, ore: 1.4 },
    attack: 1.0,
    defence: 1.05,
    units: { footman: 1.3, archer: 0.8, cavalry: 0.8 },
    siege: 1.05,
    walls: 1.25,
    spy: 0.95,
    scout: 1.0,
    mercCost: 1.0,
  },
  gnoll: {
    production: { food: 1.1, wood: 1.3, stone: 0.7, ore: 0.9 },
    attack: 1.0,
    defence: 0.95,
    units: { footman: 1.1, archer: 1.3, cavalry: 1.0 },
    siege: 1.1,
    walls: 1.1,
    spy: 1.2,
    scout: 1.2,
    mercCost: 1.0,
  },
};

// ─── 15 · PREMIUM (gameplay side only — pricing lives in premium.ts) ────────

/** Cap on each Steward queue and on standing orders. */
export const STEWARD_QUEUE_CAP = 10;
