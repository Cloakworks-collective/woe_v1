// Combat — battle resolution constants (spec/combat.md). All tunable.

export const ACTION_TURNS = {
  PER_GAME_TURN: 2,
  START: 200,
  CAP: 500,
  ATTACK_COST: 10,
  SPY_MISSION_COST: 5,
  SCOUT_RECON_COST: 2,
  REST_COST: 5,
};

export const STAMINA = {
  MAX: 100,
  PASSIVE_RECOVERY_PER_TURN: 1,
  DRAIN_PER_ROUND_ATTACKER: 8,
  DRAIN_PER_ROUND_DEFENDER: 5,
  REST_GAIN: 20,
  REST_FOOD_PER_TROOP: 0.2,
  /** staminaMod = 0.5 + 0.005 × stamina. */
  MOD_BASE: 0.5,
  MOD_PER_POINT: 0.005,
  /** Raid/siege/bombard blocked vs defenders below this (mercy rule). */
  MERCY_FLOOR: 25,
};

/** Unit base stats (light tier): attack / defence. */
export const UNIT_STATS = {
  footman: { attack: 10, defence: 10 },
  archer: { attack: 12, defence: 6 },
  cavalry: { attack: 15, defence: 8 },
  warrior: { attack: 3, defence: 3 }, // unequipped
  siegeEngineer: { attack: 0, defence: 5 }, // crew only
  mercenary: { attack: 18, defence: 18 }, // fixed, medium-footman equivalent
};

/** Combat power per tier (heavy ≈ 3 lights; costs ×1/×2/×4). */
export const TIER_POWER = { light: 1, medium: 1.8, heavy: 3 } as const;

/** Siege engine fire per crewed engine per round. */
export const ENGINE_FIRE = {
  ballistae: { troopDamage: 40, wallDamage: 0 },
  trebuchets: { troopDamage: 60, wallDamage: 0.05 },
  rams: { troopDamage: 0, wallDamage: 0.03 },
};

/** Bombard: building integrity damage per trebuchet per round (once the
 *  walls are down and fire spills onto the town). */
export const BUILDING_DAMAGE_PER_TREB = 0.03;
/** Buildings can only ever be bombed down to 50% — artillery cracks a
 *  structure open (storages spill, production/research slow) but never
 *  levels it. Repairs restore it. */
export const BUILDING_INTEGRITY_FLOOR = 0.5;
/** Bombard pounds the walls until they are this destroyed, THEN the fire
 *  spills onto the buildings behind them (wall integrity ≤ this). */
export const WALL_BOMBARD_PIVOT = 0.5;

/** Escalade: troops covered per crewed team (bypass wall bonus). */
export const ESCALADE_COVERAGE = { ropes: 10, ladders: 25 };

export const MAX_ROUNDS = 10;
export const K_LETHALITY = 2; // casualties = damage / (k × effective defence)
export const BREAK_THRESHOLD = 0.3; // a side breaks below 30% strength
export const LUCK_SWING = 0.1; // ±10%, rolled per side per round

export const WALL_BONUS_PER_LEVEL = 0.1; // Citadel (10) = +100% defence

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
  FRACTION: 0.25, // of unstored resources / unbanked gold
  BIG_TARGET_RATIO: 1.5, // target ≥150% strength → +50% loot
  BIG_TARGET_BONUS: 1.5,
  SMALL_TARGET_RATIO: 0.5, // target ≤50% → scaled down, floor 25% of normal
  SMALL_TARGET_FLOOR: 0.25,
};

export const REVENGE_WINDOW_HOURS = 18;

/** Attacker loses 50% of committed siege gear on defeat. */
export const SIEGE_GEAR_LOSS_ON_DEFEAT = 0.5;

/** Wall repair: damagedFraction × wall build cost × 0.5. */
export const WALL_REPAIR_COST_FACTOR = 0.5;

export const SCATTERING = {
  TROOP_RATIO: 0.3, // scatter if troops < 30% of civilians at daily reset
  EXEMPT_BELOW_POPULATION: 500, // empires under 500 total pop never scatter
};
