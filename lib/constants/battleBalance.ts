// ═══════════════════════════════════════════════════════════════════════════
// THE BATTLE BALANCE FILE — every number that decides a fight, in one place.
//
// THE MODEL (read this first; the whole engine is one line)
// ────────────────────────────────────────────────────────────────────────────
//
//     damage = basePower × (1 + Σ bonuses) × delivery
//
//   · basePower  — what a unit or engine is worth, raw. Everything that can
//                  attack has Power; everything that can be hurt has Health.
//                  Walls, buildings, troops and engines all live on ONE scale,
//                  so "damage" means the same thing everywhere.
//
//   · bonuses    — ADDITIVE. Race, veterancy (XP), research, wall edge, clan
//                  war, entrenchment, unit-role bonuses. They all sum into a
//                  single pool, so adding a new bonus later contributes exactly
//                  what it says and never multiplies the whole stack.
//
//   · delivery   — MULTIPLICATIVE, and only three things qualify. Each answers
//                  "what FRACTION of my power actually shows up?":
//                     stamina        how much power you can bring
//                     effectiveness  how much applies to THIS target
//                     luck           how much lands today
//                  These are ratios, not bonuses. Ratios don't add.
//
// WHY THE SPLIT MATTERS: a trebuchet is 30% effective against walls. Fold that
// into the additive pool as "−70%" and a maxed attacker's trebuchet does ~79%
// of a ram's wall damage instead of 30% — the ram/trebuchet distinction dies.
// Effectiveness must stay a ratio. Same for stamina (exhaustion would cost 15%
// instead of 50%) and luck (the ±10% fog of war would shrink to ±3%).
//
// THE ANCHOR: every siege number below is fitted to one target —
//   a MID-GAME attacker (Siegecraft 3, ~50 engineer XP, no race bonus) with
//   40 crewed trebuchets levels a Citadel in 10 bombards (100 action turns).
//   With full defensive siege answering, 20 bombards.
// Change TREBUCHET power or WALL_HP_CURVE and that target moves. Everything
// else is calibrated against it.
//
// Units convention: frac · fraction 0–1   × · multiplier (1 = neutral)
//                   pwr  · power/health points (one shared scale)
// ═══════════════════════════════════════════════════════════════════════════

import type { Curve } from "./curves";

// ─── 1 · RANDOM BANDS ───────────────────────────────────────────────────────

/** A randomised range. ALWAYS rolled with the battle's injected RNG so tests
 *  and simulations stay reproducible — never Math.random inside the engine. */
export interface Band {
  min: number;
  max: number;
}

// ─── 2 · UNIT POWER & HEALTH ────────────────────────────────────────────────

/**
 * Every arm at every tier, POWER and HEALTH given outright.
 *
 * This replaced a single TIER_SCALE multiplier (×1 / ×1.8 / ×3) applied to a
 * light unit's stats. One multiplier could not say what the arms needed to say:
 * an archer's power climbs steeply while its health barely moves, and a
 * footman's does the reverse. Under one scale every arm had the same SHAPE and
 * differed only in starting numbers, which made the three arms interchangeable
 * once you had done the arithmetic.
 *
 * Read down a column to see what a tier buys; read across a row to see what an
 * arm IS:
 *
 *   footman   13/25 → 20/40 → 30/65    the line. Least power, most health.
 *   archer    20/16 → 30/30 → 55/40    the damage. Most power at every tier,
 *                                      least health — and a wall halves their
 *                                      fire (ARCHER_VS_WALL_CURVE), which is
 *                                      the check on it.
 *   cavalry   18/25 → 28/40 → 50/65    the hammer. A footman's health with
 *                                      most of an archer's power, dearest by
 *                                      far, and murderous in a sortie.
 *
 * Costs still scale flat by tier (TIER_COST_MULT ×1 / ×2 / ×4), so these
 * numbers alone decide whether a tier is worth its price.
 */
export const UNIT_STATS = {
  footman: {
    light: { power: 13, health: 25 },
    medium: { power: 20, health: 40 },
    heavy: { power: 30, health: 65 },
  },
  archer: {
    light: { power: 20, health: 16 },
    medium: { power: 30, health: 30 },
    heavy: { power: 55, health: 40 },
  },
  cavalry: {
    light: { power: 18, health: 25 },
    medium: { power: 28, health: 40 },
    heavy: { power: 50, health: 65 },
  },
} as const;

/** Engineers are untiered — they never attack, they crew engines and they die. */
export const UNIT_POWER = {
  engineer: { power: 0, health: 10 },
};

// ─── 3 · THE EFFECTIVENESS MATRIX ───────────────────────────────────────────
// The single most important table in the game. Read a row to learn what a
// thing is FOR. A zero means "this weapon cannot touch that target at all".
//
// Rams read 1.00 against walls and 0 against everything else: they are the
// wall-breaker and nothing more. Trebuchets read 0.30 — inaccurate, but the
// only engine that reaches walls, buildings AND engines. That contrast IS the
// siege game.

export type TargetKind = "troops" | "walls" | "buildings" | "siege";

export const EFFECTIVENESS: Record<string, Record<TargetKind, number>> = {
  // Field troops — they fight men, never masonry.
  footman: { troops: 1.0, walls: 0, buildings: 0, siege: 0 },
  archer: { troops: 1.0, walls: 0, buildings: 0, siege: 0 },
  cavalry: { troops: 1.0, walls: 0, buildings: 0, siege: 0 },

  // Offensive engines.
  rams: { troops: 0, walls: 1.0, buildings: 0, siege: 0 },
  ballistae: { troops: 0.1, walls: 0, buildings: 0, siege: 0 },
  trebuchets: { troops: 0.15, walls: 0.3, buildings: 0.2, siege: 0.2 },
  /** Escalade tools deal no damage — they carry troops over the wall. */
  ropes: { troops: 0, walls: 0, buildings: 0, siege: 0 },
  ladders: { troops: 0, walls: 0, buildings: 0, siege: 0 },
  siege_towers: { troops: 0, walls: 0, buildings: 0, siege: 0 },

  // Defensive counters — purpose-built, point-blank, and they only ever shoot
  // at engines. That is why they read 1.00 where trebuchets read 0.20.
  billhooks: { troops: 0, walls: 0, buildings: 0, siege: 1.0 },
  forkpoles: { troops: 0, walls: 0, buildings: 0, siege: 1.0 },
  fire_pots: { troops: 0, walls: 0, buildings: 0, siege: 1.0 },
  boiling_oil: { troops: 0, walls: 0, buildings: 0, siege: 1.0 },
  hoardings: { troops: 0, walls: 0, buildings: 0, siege: 1.0 },
  counter_engine: { troops: 0, walls: 0, buildings: 0, siege: 1.0 },
};

/** Siege Accuracy research raises the trebuchet's delivery against structures
 *  (and its counter-battery fire) — the ONE research that moves a gate rather
 *  than the additive pool, which is exactly why it is so strong. Interpolated
 *  linearly from level 0 to MAX_FIELD_LEVEL. */
export const SIEGE_ACCURACY = {
  walls: { from: 0.3, to: 0.6 },
  buildings: { from: 0.2, to: 0.5 },
  siege: { from: 0.2, to: 0.4 },
  /** It also sharpens the defender's counter-battery fire, so the field is
   *  worth taking on both sides of a siege. */
  counterBattery: { from: 1.0, to: 1.3 },
};

// ─── 4 · WALLS ──────────────────────────────────────────────────────────────

/**
 * The wall's defence edge, and the two things that dilute it.
 *
 * BASE is what a defender enjoys behind whole masonry, and it does NOT grow
 * with wall level — a standing wall is a standing wall. What level buys is
 * durability (WALL_HP_CURVE) and, since 2026-08, HOW MUCH ARMY the wall can
 * hold off at once (COVER_PER_LEVEL).
 *
 * Two dilutions, applied together:
 *
 *   TACKLE   troops who came over on a siege tower fight a far lesser wall
 *            than troops climbing bare stone. Blended by how many of the host
 *            each surviving engine carried (blendWallEdge).
 *   NUMBERS  a wall has a LENGTH. Only so many attackers can be met at the
 *            parapet; the rest spill round and fight as if there were no wall
 *            at all.
 *
 * The second is the one that gives wall level a say in who WINS. Before it, a
 * 500-strong garrison fell to 500 attackers behind no wall and behind a Citadel
 * alike: the edge was the same +50% however many came, so level decided nothing
 * but how long the masonry lasted. It also makes NUMBERS the counter to walls
 * and quality not — three thousand heavy foot are covered where nine thousand
 * light are covered a third — which is exactly the right way round, and gives
 * cheap troops a job.
 */
export const WALL_EDGE = {
  /** Additive bonus to every defending unit behind an intact wall. */
  BASE: 0.5, // frac
  /**
   * Attackers a wall can meet at the parapet, per level. A Palisade holds off
   * 300; a Citadel 3,000 — which covers a serious field army, against a solo
   * victory floor of 2,400 regulars.
   *
   * Applied as a fraction, not a cliff: a wall covering 3,000 against 6,000
   * attackers gives half its edge, rather than full protection to some troops
   * and none to others. Continuous, and it composes with the tackle blend by
   * multiplication.
   */
  COVER_PER_LEVEL: 300, // attackers
  /** Troops who came over on grapples fight a lesser wall. */
  VS_GRAPPLE: 0.3, // frac
  /** Ladder parties do better still; siege towers best of all. */
  VS_LADDER: 0.2, // frac
  VS_TOWER: 0.1, // frac
  /** Troops carried per crewed escalade team. */
  TROOPS_PER_GRAPPLE: 10,
  TROOPS_PER_LADDER: 30,
  TROOPS_PER_TOWER: 100,
};

/** Wall HEALTH as a curve of x = wall level. Quadratic 30,000 × level²:
 *  a Timber Palisade (1) is 30,000 and falls to a few volleys; the Citadel (10)
 *  is 3,000,000. Damage persists between battles until repaired.
 *
 *  10,000 → 30,000 (2026-08), alongside the coverage rule above. The old figure
 *  was fitted to a "ten bombards to level a Citadel" anchor; at 40 crewed
 *  trebuchets and no Siege Accuracy that is now nearer 625 volleys, so a siege
 *  is a campaign rather than an afternoon — and a defender who mends between
 *  volleys (repair costs half the damage) can genuinely outlast a besieger who
 *  cannot keep engines in the field. Re-derive with `SIM_ONLY=bombard pnpm sim`
 *  before moving it again. */
export const WALL_HP_CURVE: Curve = { kind: "polynomial", coefficients: [0, 0, 30000] };

/** Bombard fire pounds the walls until integrity falls to this, THEN spills
 *  onto the town. Ram crews join the assault at the same threshold. */
export const WALL_BREACH_PIVOT = 0.5; // frac

// ─── 5 · BUILDINGS ──────────────────────────────────────────────────────────

/** Building HEALTH as a curve of x = building level. Buildings are softer than
 *  walls — they were never built to be shot at. */
export const BUILDING_HP_CURVE: Curve = { kind: "polynomial", coefficients: [0, 0, 3000] };

/** Artillery cracks a structure open but never levels it. */
export const BUILDING_INTEGRITY_FLOOR = 0.5; // frac

// ─── 6 · SIEGE ENGINES ──────────────────────────────────────────────────────
// Power feeds the effectiveness matrix above. Health is what counter-fire eats.
// Costs are gold/wood/ore only — stone belongs in buildings now.

export const SIEGE_GEAR = {
  ropes: { power: 0, health: 100, crew: 1, gold: 50, wood: 10, stone: 0, ore: 5, foundryLevel: 1 },
  ladders: { power: 0, health: 200, crew: 1, gold: 100, wood: 50, stone: 0, ore: 10, foundryLevel: 3 },
  /** The wall-breaker. Cheap, fragile, needs a footman crew to push it, and
   *  does nothing at all once the wall is down. */
  rams: { power: 300, health: 600, crew: 2, gold: 400, wood: 200, stone: 0, ore: 50, foundryLevel: 5 },
  ballistae: { power: 400, health: 800, crew: 3, gold: 800, wood: 300, stone: 0, ore: 100, foundryLevel: 7 },
  /** The anchor engine. 400 power × 0.30 wall delivery is what fits the
   *  10-bombards-to-a-Citadel target. */
  trebuchets: { power: 400, health: 1000, crew: 5, gold: 2000, wood: 800, stone: 0, ore: 300, foundryLevel: 9 },
  /** NEW. Carries 100 troops over the wall — three ladders' worth in one
   *  engine, and they arrive fighting a much reduced wall edge. Expensive,
   *  slow, and fire is its answer. */
  siege_towers: { power: 0, health: 1500, crew: 4, gold: 2500, wood: 1200, stone: 0, ore: 200, foundryLevel: 7 },
};

export type SiegeGearKey = keyof typeof SIEGE_GEAR;

/** Defensive counters. Bought and crewed like gear, manned when you DEFEND.
 *  Each duels its paired offensive engine — it does not "cancel" it; it shoots
 *  at it until one of them is wreckage. */
export const SIEGE_COUNTERS = {
  billhooks: { power: 100, health: 200, crew: 1, gold: 50, wood: 10, stone: 0, ore: 5, foundryLevel: 2, counters: "ropes", name: "Bill-hooks" },
  forkpoles: { power: 150, health: 300, crew: 1, gold: 100, wood: 50, stone: 0, ore: 10, foundryLevel: 4, counters: "ladders", name: "Fork Poles" },
  /** Answers the ram, and answers it hard — see COUNTER_DUEL.BOILING_OIL_BONUS.
   *  It also scalds the ram's footman crew, which nothing else does. */
  boiling_oil: { power: 300, health: 800, crew: 2, gold: 400, wood: 100, stone: 0, ore: 50, foundryLevel: 6, counters: "rams", name: "Boiling Oil" },
  hoardings: { power: 400, health: 1200, crew: 3, gold: 800, wood: 300, stone: 0, ore: 100, foundryLevel: 8, counters: "ballistae", name: "Hoardings" },
  /** NEW — fire against timber. The siege tower's answer. */
  fire_pots: { power: 400, health: 900, crew: 2, gold: 900, wood: 200, stone: 0, ore: 150, foundryLevel: 8, counters: "siege_towers", name: "Fire Pots" },
  /** The artillery duel's other half. Emplaced and sturdy: 2,000 health against
   *  the trebuchet's 1,000, which is what makes a bombard a war of attrition
   *  rather than a single decisive volley. */
  counter_engine: { power: 400, health: 2000, crew: 5, gold: 2000, wood: 800, stone: 0, ore: 300, foundryLevel: 10, counters: "trebuchets", name: "Counter-Engine" },
} as const;

export type CounterKey = keyof typeof SIEGE_COUNTERS;

/** An engine still standing but battered fires proportionally weaker — power
 *  scales with surviving health. Below this fraction it is wreckage: destroyed
 *  outright, not repairable. */
export const SIEGE_DESTROYED_BELOW = 0.2; // frac of max health

/** Mending an engine costs this share of its build cost, scaled by damage —
 *  so building from scratch is ~3× the price of repairing. */
export const SIEGE_REPAIR_COST_FACTOR = 1 / 3;

/** Selling an engine back returns this share of its build cost. The pressure
 *  valve when the treasury runs dry. */
export const SIEGE_SALVAGE_VALUE = 0.5; // frac

// ─── 7 · THE COUNTER DUEL ───────────────────────────────────────────────────
// Every round of a castle attack, revenge or bombard, each counter type trades
// fire with the engine it answers. Survivors go on to do their real job.

export const COUNTER_DUEL = {
  /** Boiling oil is not a fair fight — it is poured straight down onto men
   *  pushing a ram against the gate. */
  BOILING_OIL_BONUS: 1.0, // frac, additive
  /** Defenders shoot from a fixed emplacement at a known range, against
   *  engines crawling toward them. Rolled once per battle. */
  DEFENDER_EDGE: { min: 0.1, max: 0.2 } as Band,
  /** A counter that outguns the engines it faces by this much stops shooting
   *  at wood and starts killing the crews. */
  OVERWHELM_RATIO: 3.0, // ×
};

/** Bombard-specific artillery rules. */
export const ARTILLERY_DUEL = {
  /** Attacker's engineers start dying once the defender's artillery is at
   *  least this fraction of the attacker's — a token battery is no threat. */
  ATTACKER_ENGINEER_RISK_ABOVE: 0.3, // frac
  ATTACKER_ENGINEER_RISK: { min: 0.05, max: 0.1 } as Band,
  /** Defender's engineers only start dying once their own battery is being
   *  shot to pieces. */
  DEFENDER_ENGINEER_RISK_AFTER_LOSS: 0.4, // frac of starting artillery lost
  DEFENDER_ENGINEER_RISK: { min: 0.01, max: 0.05 } as Band,
  /** The battery stops answering only when BOTH hold — 70% of it is wreckage
   *  AND what is left is half the attacker's strength. Requiring both is what
   *  stops "keep no counters" from being a cheap way to opt out of the duel:
   *  you cannot reach the give-up state without first being ground down to it.
   *  Once silent, no more engineers or engines are lost — but walls and
   *  buildings take fire freely. */
  GIVE_UP_LOSS: 0.7, // frac of starting artillery destroyed
  GIVE_UP_STRENGTH: 0.5, // frac — and at most half the attacker's strength
};

// ─── 8 · THE SORTIE ─────────────────────────────────────────────────────────
// Cavalry are useless on a wall and murderous in the open. That asymmetry is
// the point: a cavalry-heavy defender rides out; a footman-heavy one holds.
// The defender chooses whether to sortie at all (a standing order).

export const SORTIE = {
  /** Only worth attempting when the defender's field arm outweighs the
   *  attacker's screen by this much. */
  TRIGGER_RATIO: 1.5, // ×
  /** Cavalry lead the charge and fight at their best in the open. */
  CAVALRY_BONUS: 0.5, // frac, additive
  /** Each cavalryman brings this many footmen along behind. */
  FOOTMEN_PER_CAVALRY: 3,
  /** The attacker's screen holds off this multiple of its own strength before
   *  anything reaches the engineers and the engines behind it. */
  SCREEN_ABSORB: 5, // ×
  /** …and it is dug in around the siege lines while it does. */
  ENTRENCHED_BONUS: 0.2, // frac, additive
};

// ─── 9 · UNIT ROLES ─────────────────────────────────────────────────────────
// Where each arm earns its keep. Archers are lethal from a parapet; footmen
// hold it; cavalry are wasted on it but own the counter-charge. On the other
// side, footmen push rams best and archers barely at all.

/** Additive bonuses for DEFENDING units on an intact wall. */
export const WALL_ROLE_BONUS = {
  archer: 0.2, // frac — lethal from the parapet
  footman: 0.1, // frac — built for holding it
  cavalry: 0.0, // dismounted and wasted
};

/** Attacking archers shoot at a defender behind cover. Delivery, not a bonus:
 *  a curve of x = wall integrity. 1.0 → ×0.5 (half your arrows find nothing
 *  but stone); 0.5 → ×0.9; a rubbled wall hides nobody. */
export const ARCHER_VS_WALL_CURVE: Curve = { kind: "expr", formula: "min(1, 0.1 + 0.8 * (1 - x))" };

/** Battering rams are pushed by hand. Crew is drawn footmen first, then
 *  cavalry, then archers — and how well the ram works depends on who is
 *  pushing it. Ram crews take no part in the assault until the wall is
 *  breached (WALL_BREACH_PIVOT), and boiling oil can kill them where they
 *  stand. */
export const RAM_CREW = {
  TROOPS_PER_RAM: 20,
  PRIORITY: ["footman", "cavalry", "archer"] as const,
  EFFECTIVENESS: { footman: 1.2, cavalry: 1.1, archer: 1.0 },
};

// ─── 10 · CASUALTIES ────────────────────────────────────────────────────────

/** Sellswords are the front line of their own arm. Damage into a category
 *  splits this way — so regulars ALWAYS leak a little, which is what keeps
 *  "losing regulars is the worst thing" true even when the buffer holds. */
export const CASUALTY_SPLIT = {
  MERC_SHARE: 0.7, // frac of a phase's damage onto the merc pool
};

/** Within regulars and within mercs alike, the cheap ranks fall first — so a
 *  layer of light troops beneath your heavies is a genuine shock absorber. */
export const CASUALTY_TIER_ORDER = ["light", "medium", "heavy"] as const;

/** A side breaks and quits the field below this share of its starting power. */
export const BREAK_THRESHOLD = 0.3; // frac

/** Rounds per battle. Also the reason an attack costs 10 action turns. */
export const MAX_ROUNDS = 10;

/** Fog of war: ±this, rolled fresh per side per round. Delivery, not a bonus. */
export const LUCK_SWING = 0.1; // frac

// ─── 11 · STAMINA ───────────────────────────────────────────────────────────

export const STAMINA = {
  MAX: 100,
  PASSIVE_RECOVERY_PER_TURN: 1,
  PASSIVE_FOOD_PER_TROOP: 0.02,
  /** Drain scales with damage DEALT against what it would have taken to wipe
   *  the enemy out. Swinging hard tires an army; holding a line does not. */
  MAX_DRAIN_ATTACKER: 80,
  MAX_DRAIN_DEFENDER: 50,
  REST_GAIN: 20,
  REST_FOOD_PER_TROOP: 0.2,
  /** Delivery gate: staminaMod = MOD_BASE + MOD_PER_POINT × stamina, so a
   *  spent army brings half its power no matter how well researched. */
  MOD_BASE: 0.5,
  MOD_PER_POINT: 0.005,
  /** At or below this a defender yields to anything but revenge. */
  MERCY_FLOOR: 25,
};

// ─── 12 · THE BATTLEFIELD YIELD ─────────────────────────────────────────────

export const YIELD = {
  /** Lay down arms when defensive power falls below this share of the
   *  attacker's. Walls count only on castle attacks — a raid is open field. */
  STRENGTH_RATIO: 0.6,
  /** The sellswords cover the retreat. That is what sellswords are for. */
  MERC_LOSS_FRACTION: 0.25,
};

// ─── 13 · LOOT ──────────────────────────────────────────────────────────────
// Raids take goods. Castle attacks take gold. Neither takes both — which is
// what makes "bombard the storehouses open, then raid, then castle" a plan
// rather than a single button.

export const LOOT = {
  /** Won the field outright. */
  RAID_WIN: { min: 0.5, max: 0.7 } as Band,
  CASTLE_WIN: { min: 0.5, max: 0.7 } as Band,
  /** They laid down arms — less is carried off, because less was scattered. */
  RAID_YIELD: { min: 0.3, max: 0.5 } as Band,
  CASTLE_YIELD: { min: 0.3, max: 0.5 } as Band,
  /** Size scaling, applied to the rolled band. Punching up pays; farming
   *  minnows does not. Tops out at 0.70 × 1.25 = 87.5% — never over 100%,
   *  so no cap is needed. */
  BIG_TARGET_RATIO: 1.5, // ×  target this much stronger…
  BIG_TARGET_BONUS: 1.25, // …× this much loot
  SMALL_TARGET_RATIO: 0.5, // ×  target this much weaker…
  SMALL_TARGET_PENALTY: 0.75, // …× this much loot

  /**
   * PEACETIME RELIEF. Applied last, to every peacetime share. Losing a raid
   * should sting without emptying you — the whole point of the clan-war rules
   * below is that they are worse, and they can only be worse if peace is
   * survivable. A 15% haircut on every peacetime share: the ceiling drops
   * 87.5% → 74.4%, and an even-matched win takes 42.5–59.5% instead of 50–70%.
   */
  PEACE_MULTIPLIER: 0.85,

  /**
   * CLAN WAR — the gloves come off, but only on the modes that already loot.
   * Between members of two clans formally at war, a raid or a castle attack
   * takes **everything left outside the vault**. No roll, no size-scaling, no
   * peacetime relief.
   *
   *              PEACE (×0.9)         WAR
   *   raid       goods 42.5–74.4%  →  goods 100%
   *   castle     gold  42.5–74.4%  →  gold  100%
   *   bombard    nothing          →   nothing   (2× damage instead)
   *   revenge    nothing          →   nothing   (2× damage instead)
   *
   * War changes the SHARE and the ferocity, never the character of the blow.
   * Bombard stays a setup move and revenge stays a punishment — if war made
   * every mode loot, the bombard → raid → castle campaign would collapse into
   * one button, and revenge would become the efficient way to farm someone.
   *
   * The vault is therefore the only defence in wartime, and it is a real one:
   * shelter is flat per level, so war punishes hoarding above your cap far
   * more than it punishes being small.
   */
  WAR_SHARE: 1.0,
};

// ─── 14 · EXPERIENCE ────────────────────────────────────────────────────────
// Outcome-based, not opponent-based. Farming a minnow pays badly because there
// is nothing there to kill — no bully band needed, the arithmetic does it.

export const XP = {
  MAX: 100,
  /** Attacking is refused outright above this score ratio. Kept as validation
   *  (it is what stops small accounts harassing large ones), and it applies to
   *  bombard too — engineers count toward ranking, so a siege specialist is
   *  not artificially locked out of their own strategy. Revenge is exempt. */
  REFUSAL_RATIO: 1.75,
  /** Killing regular troops is the highest-paying thing you can do. */
  PER_REGULAR_KILLED: 0.05,
  /** Driving civilians off pays half as well, per head. */
  PER_CIVILIAN_DISPLACED: 0.025,
  /** Mercenary kills pay nothing — they were never anybody's people. */
  PER_MERC_KILLED: 0,
  /** Holding your ground is worth something regardless of outcome. */
  DEFENDER_GAIN: 5,
  /** Ceiling on what one battle can pay, so a single massacre can't max you. */
  MAX_PER_BATTLE: 10,
  /** Veterancy dies with the veterans: XP × (1 − lost/before). Discharging
   *  costs half as much per head — you keep some of what they knew. */
  LOSS_ON_DEATH: 1.0, // ×
  LOSS_ON_DISCHARGE: 0.5, // ×
};

// ─── 15 · CIVILIAN LOSSES ───────────────────────────────────────────────────
// Every successful attack drives people off — they flee a sacked town. This is
// separate from (and compounds with) peasant scattering at the daily reset.

export const CIVILIAN_LOSS = {
  /** Share of civilians driven off by a successful attack, by mode. Bombard
   *  is on the list on purpose: terror does not require a swordsman. */
  RAID: { min: 0.01, max: 0.03 } as Band,
  CASTLE: { min: 0.03, max: 0.06 } as Band,
  REVENGE: { min: 0.04, max: 0.08 } as Band,
  BOMBARD: { min: 0.01, max: 0.02 } as Band,
  /** A yield spares the people along with the soldiers. */
  YIELD_FACTOR: 0.5, // ×
};

// ─── 16 · MERCENARIES ───────────────────────────────────────────────────────

export const MERCENARIES = {
  /** Sellswords may not exceed this share of the REGULARS of the same
   *  category — footmen gate merc footmen, scouts gate merc scouts, and so on.
   *  0.33 means a 75/25 army at full strength. */
  CAP_RATIO: 1 / 3,
  /** Enforced continuously, not just at hire. When regulars die — in battle,
   *  to an assassin, to starvation, to a discharge — the sellswords they can
   *  no longer command are paid off and leave. This is what makes killing
   *  regulars cascade: kill three, lose four. Disbanded mercs are simply gone
   *  and must be re-hired with gold. */
  DISBAND_ON_REGULAR_LOSS: true,
  /** Hired blades earn no veterancy and cost none when they die. */
  EARNS_XP: false,
};

// ─── 17 · SIEGE GEAR ON DEFEAT ──────────────────────────────────────────────

/** A failed assault leaves engines on the field. Applied on top of whatever
 *  the counter duel already wrecked. */
export const SIEGE_GEAR_LOSS_ON_DEFEAT = 0.5; // frac

// ─── 18 · REVENGE & PROTECTION ──────────────────────────────────────────────

export const REVENGE_WINDOW_HOURS = 18;
export const ATTACK_HISTORY_HOURS = 72;

/**
 * Once the walls are breached, stray bombard fire lands on a random building,
 * weighted — storages take the most, because that is where the loot is, and
 * cracking them spills goods out for a follow-up raid.
 *
 * A bombard burns the TOWN, never the army. What it can touch is the civilian
 * economy and nothing else:
 *
 * - **Stores** (weight 3) — the loot is behind those doors.
 * - **Producers** (weight 2) — the yield that refills them.
 * - **Collegium and Market Square** (weight 1) — knowledge and trade, the slow
 *   hurts.
 *
 * Deliberately immune, and they must stay that way:
 *
 * - **The Walls** — damaged, but on their own `wallIntegrity` field, and they
 *   have to come down BEFORE any of this is reachable. Never list them here.
 * - **The war yards** (Drill Yard, Fletcher's Range, Knight's Stables, Forge,
 *   Armoury, War Foundry) — an enemy may not disarm you by shelling; you break
 *   an army by killing it, not by cracking the sheds that made it. This matters
 *   more since the Forge and Armoury started granting combat bonuses outright:
 *   shelling them would let a besieger weaken the garrison they are about to
 *   fight, which is precisely the lever this rule exists to deny.
 * - **Shadow Guild and Ranger's Lodge** — spies and scouts are the intel game,
 *   and blinding someone from outside the walls would gut it.
 * - **Hearthstead and Muster Hall** — the peasants' housing and the barracks.
 *   Terror already displaces civilians (see CIVILIAN_LOSS); their roofs are not
 *   a second lever on the same thing.
 *
 * Everything listed here needs an integrity EFFECT wired somewhere, or damage
 * to it is inert and the sprite lies to the player.
 */
export const BOMBARDABLE: { id: string; weight: number }[] = [
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
  { id: "market_square", weight: 1 },
];
