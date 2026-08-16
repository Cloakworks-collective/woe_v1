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
 *                                      fire is halved by a wall's own
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

/** Engineers are untiered. They never march out to attack — they crew engines,
 *  and they die. The power below is what they manage when a sortie reaches the
 *  siege lines and they pick up whatever is to hand: it is read ONLY by the
 *  rear-guard clash, never by the archer, cavalry or footman phases. */
export const UNIT_POWER = {
  engineer: { power: 10, health: 10 },
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
  /** The dedicated anti-troop engine, and now the ONLY one: trebuchets gave up
   *  their share of this so each engine has exactly one job. 0.10 -> 0.60. */
  ballistae: { troops: 0.6, walls: 0, buildings: 0, siege: 0 },
  /** Walls, buildings and engines — never men. It used to read 0.15 against
   *  troops as well, which made it the only engine doing three jobs at once and
   *  left the ballista with no identity of its own. */
  trebuchets: { troops: 0, walls: 0.3, buildings: 0.2, siege: 0.2 },
  /** Escalade tools deal no damage — they carry troops over the wall. */
  ropes: { troops: 0, walls: 0, buildings: 0, siege: 0 },
  ladders: { troops: 0, walls: 0, buildings: 0, siege: 0 },
  siege_towers: { troops: 0, walls: 0, buildings: 0, siege: 0 },

  // Defensive counters — purpose-built, point-blank, and they only ever shoot
  // at engines. They read 0.30 where a trebuchet reads 0.20: half again as
  // accurate at the one job they have, because it is the only job they have.
  //
  // They are NOT perfect. These used to read 1.00 — every point of power
  // landing, the only weapon in the game with no accuracy tax at all, and then
  // MORE than perfect once Siegecraft carried counterBattery to 1.30. A machine
  // that throws something at a distant target misses like any other, and that
  // one asymmetry was most of the reason a defended wall could not be besieged
  // at all past about twenty engines.
  //
  // As with the trebuchet's rows, this is the LEVEL-0 figure; the research ramp
  // lives in SIEGE_ACCURACY.counterBattery and is what the engine actually
  // reads (see counterBatteryDelivery).
  billhooks: { troops: 0, walls: 0, buildings: 0, siege: 0.3 },
  forkpoles: { troops: 0, walls: 0, buildings: 0, siege: 0.3 },
  fire_pots: { troops: 0, walls: 0, buildings: 0, siege: 0.3 },
  boiling_oil: { troops: 0, walls: 0, buildings: 0, siege: 0.3 },
  hoardings: { troops: 0, walls: 0, buildings: 0, siege: 0.3 },
  counter_engine: { troops: 0, walls: 0, buildings: 0, siege: 0.3 },
};

/** SIEGECRAFT raises the trebuchet's delivery against structures
 *  (and its counter-battery fire) — the ONE research that moves a gate rather
 *  than the additive pool, which is exactly why it is so strong. Interpolated
 *  linearly from level 0 to MAX_FIELD_LEVEL. */
export const SIEGE_ACCURACY = {
  walls: { from: 0.3, to: 0.6 },
  buildings: { from: 0.2, to: 0.5 },
  siege: { from: 0.2, to: 0.4 },
  /**
   * The DEFENDER's counter-battery fire, on exactly the same shape as the
   * attacker's: half again the trebuchet's accuracy at level 0, doubling at
   * mastery, so the field is worth taking on both sides of a siege.
   *
   *   trebuchet vs engines   0.20 → 0.40
   *   counter   vs engines   0.30 → 0.60
   *
   * Was 1.00 → 1.30, which made the counter a perfect weapon and then a better
   * than perfect one. A delivery gate is "what FRACTION of my power shows up"
   * (see the header) and a fraction cannot exceed 1 — that entry was an
   * additive bonus wearing a gate's clothes, compounding where it should have
   * summed. Every gate in the file is under 1.0 again.
   */
  counterBattery: { from: 0.3, to: 0.6 },
};

// ─── 4 · WALLS ──────────────────────────────────────────────────────────────

/**
 * The wall's defence edge, and the two things that dilute it.
 *
 * BASE is what a defender enjoys behind whole masonry, and it does NOT grow
 * with wall level — a standing wall is a standing wall. What level buys is
 * durability (WALL_HP_CURVE). Every defender behind
 * intact masonry gets the full edge, however many attackers come.
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
 *  trebuchets and no Siegecraft that is now nearer 625 volleys, so a siege
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
 *  walls — they were never built to be shot at. Exactly a tenth of a wall at
 *  every level: same quadratic shape, a tenth the coefficient. */
export const BUILDING_HP_CURVE: Curve = { kind: "polynomial", coefficients: [0, 0, 3000] };

/**
 * Health per INSTANCE for the counted structures, which have no level to square.
 *
 * A quadratic read of a count is nonsense: `level()` on a counted building
 * returns how MANY you own, so BUILDING_HP_CURVE would price a 240-hall
 * barracks at 172,800,000 health — fifty-seven Citadels. Linear is the only
 * shape that means anything here. Twenty cottages are twenty cottages; they are
 * not one enormous cottage.
 *
 * A Muster Hall is twice a Hearthstead because it is built to house soldiers
 * and their kit rather than a family, and because losing beds costs an empire
 * more than losing housing does — the army cannot be replaced in a day.
 *
 * For scale: 100 Hearthsteads is 200,000, a level-8 building. A 240-hall
 * barracks is 960,000, a shade over three level-10 buildings — heavy, but they
 * are 240 separate structures and only reachable after the wall has fallen.
 */
export const COUNTED_HP_PER_UNIT: Record<string, number> = {
  hearthstead: 2000,
  muster_hall: 4000,
};

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
  hoardings: { power: 1200, health: 1200, crew: 3, gold: 800, wood: 300, stone: 0, ore: 100, foundryLevel: 8, counters: "ballistae", name: "Hoardings" },
  /** NEW — fire against timber. The siege tower's answer. */
  fire_pots: { power: 400, health: 900, crew: 2, gold: 900, wood: 200, stone: 0, ore: 150, foundryLevel: 8, counters: "siege_towers", name: "Fire Pots" },
  /**
   * The artillery duel's other half — and now the FRAGILE half: 800 health
   * against the trebuchet's 1,000.
   *
   * It was 2,000, on the reasoning that an emplaced engine is sturdier than one
   * dragged across a field. Stacked with 100% accuracy that made a battery of
   * thirty simply unbeatable — a siege against one ran past 120 bombards, which
   * is four days of an empire's entire turn budget spent on one wall. Accuracy
   * came down to 0.30 first; this is the rest of it.
   *
   * The counter still wins the duel on rate of fire (0.30 against a trebuchet's
   * 0.20 at the same job) and on the emplacement edge. What it no longer does is
   * win it on being twice as hard to break as well.
   */
  counter_engine: { power: 400, health: 800, crew: 5, gold: 2000, wood: 800, stone: 0, ore: 300, foundryLevel: 10, counters: "trebuchets", name: "Counter-Engine" },
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

  /** Boiling oil scalds the men on the beams as well as the beams themselves.
   *  Per cauldron, and capped — both cut by 5 (from 0.05 / 0.30), because oil is
   *  already suppressing the ram's wall damage by about a third and did not need
   *  to be a people-killer on top of that. The cap binds at six cauldrons. */
  OIL_SCALD_PER_CAULDRON: 0.01, // frac of the ram crew
  OIL_SCALD_CAP: 0.06, // frac

  /**
   * SILENCE. A counter ground below this share of its own health is wreckage,
   * and the crews are pulled back off it. It takes no further part — it neither
   * fires nor is fired at — until somebody mends it.
   *
   * PERSISTENT, and derived rather than stored: it is simply "is this type's
   * integrity under the floor", so a bombardment the next morning finds the guns
   * still silent, and `repairSiege` sets integrity to 1 and brings them back
   * with no flag to clear and nothing to keep in sync.
   *
   * Deliberately just ABOVE SIEGE_DESTROYED_BELOW (0.20), and the gap is the
   * whole design: engines are still wrecked on the way down, so a besieger can
   * really hurt a battery — but the survivors stand down before they can be
   * annihilated. You can break a battery; you cannot erase one. The price the
   * defender pays is that the wall is naked until they come back and pay for
   * the repairs.
   *
   * Defender-side only. An attacker's engines are in the field by choice and
   * have nowhere to be pulled back to.
   */
  SILENCE_FLOOR: 0.25, // frac of engine health
};

/** Bombard-specific artillery rules. */
export const ARTILLERY_DUEL = {
  /**
   * PERSONNEL COME OFF LIGHTLY. An artillery duel is machines breaking
   * machines: the men are behind the frames, at range, with earth and timber
   * between them and the incoming. Engines are the thing that dies.
   *
   * Both bands were cut by 90% (attacker 0.05–0.10 → 0.005–0.010, defender
   * 0.01–0.05 → 0.001–0.005). At the old rates a single barrage killed 62 of
   * 250 crew, which made a bombard a way of killing ENGINEERS rather than a way
   * of knocking a wall down — and engineers are slow to raise and cannot be
   * mended the way an engine can. Wrecked engines are the cost of a siege;
   * dead crews were an accident of the numbers.
   */
  /** Attacker's engineers start dying once the defender's artillery is at
   *  least this fraction of the attacker's — a token battery is no threat. */
  ATTACKER_ENGINEER_RISK_ABOVE: 0.3, // frac
  ATTACKER_ENGINEER_RISK: { min: 0.005, max: 0.01 } as Band,
  /** Defender's engineers only start dying once their own battery is being
   *  shot to pieces. */
  DEFENDER_ENGINEER_RISK_AFTER_LOSS: 0.4, // frac of starting artillery lost
  DEFENDER_ENGINEER_RISK: { min: 0.001, max: 0.005 } as Band,
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

// A sortie is not a formula, it is THREE battles fought in sequence, and the
// charge is drawn off a piece at a time as it goes:
//
//   1 FOOT vs HORSE      the attacker's footmen draw off and occupy
//                        FOOTMEN_HOLD riders EACH.
//   2 HORSE vs HORSE     the attacker's own cavalry counter-charge and occupy
//                        CAVALRY_HOLD riders each.
//   3 REAR GUARD         only what neither could draw off reaches the archers
//                        and engineers standing at the engines. Half of what
//                        the riders land there goes into the park, half into
//                        the men holding it.
//
// Every stage is a real exchange — both sides take losses at each — and the
// gates only open at all if the garrison clears TRIGGER_RATIO.
//
// The holds are counted in MEN, and the charge is split by the share of riders
// each stage drew off. Power then decides who WINS each clash — never who is
// in it. That separation is the point: a screen protects the siege train by
// being NUMEROUS, so cheap troops out front are a real answer to a sortie and
// not merely a worse version of expensive ones.
//
// Only ONE multiplier survives in the whole phase, and it belongs to the
// garrison: horse coming out of a gate at speed are worth half again. The
// besieger's footmen and cavalry fight at flat power in clashes 1 and 2.

export const SORTIE = {
  /** Only worth attempting when the defender's field arm outweighs the
   *  attacker's screen by this much. */
  TRIGGER_RATIO: 1.5, // ×
  /**
   * A garrison will not open its gates below this much stamina. Tired men do
   * not counter-attack — they hold the wall and wait.
   *
   * Note how far ABOVE `STAMINA.MERCY_FLOOR` (30) this sits. Between the two a
   * defender is well enough to fight but not well enough to sally, which is the
   * band the whole clause exists to create: sorties are a FIRST answer, not a
   * last one. A garrison being ground down stops riding out long before it
   * stops fighting.
   */
  MIN_STAMINA: 70, // of STAMINA.MAX
  /**
   * …and not with a gutted screen. Measured against the hire cap in the arms
   * that actually ride out — footmen and cavalry — because sellswords absorb
   * CASUALTY_SPLIT.MERC_SHARE of every blow aimed at their rank, and riding out
   * without them means the charge is paid for in your own population.
   *
   * Archer and engineer sellswords are deliberately not counted: they stay
   * behind the wall and cannot cushion a charge they are nowhere near.
   */
  MIN_SCREEN: 0.7, // frac of the hire cap in footmen + cavalry
  /** Cavalry lead the charge and fight at their best in the open. */
  CAVALRY_BONUS: 0.5, // frac, additive
  /** Each cavalryman brings this many footmen along behind. */
  FOOTMEN_PER_CAVALRY: 3,
  /** How many riders ONE of the attacker's FOOTMEN draws off and occupies.
   *  COUNTED IN MEN, not power: a hundred footmen tie up two hundred riders
   *  whoever those riders are and whatever anyone's research says. What a
   *  shield wall does is occupy people, and every rider it occupies is a rider
   *  not reaching the archers, the crews and the engines. */
  FOOTMEN_HOLD: 2, // riders per footman
  /** …and how many one of the attacker's own CAVALRY draw off, counter-
   *  charging. More than footmen manage: horse answer horse better than
   *  anything else does. Also counted in men. */
  CAVALRY_HOLD: 3, // riders per horseman
  /**
   * UNUSED as of the three-clash sortie. The besieger's arms fight at flat
   * power in every stage — the garrison's CAVALRY_BONUS is the only multiplier
   * left in the phase. Kept rather than deleted because the `bonusPool` branch
   * that would read it (ctx.entrenched) is still wired; nothing sets that flag.
   */
  ENTRENCHED_BONUS: 0.2, // frac, additive — not currently read
  /** What an archer manages with horse already inside the lines. A bow is a
   *  poor weapon at knife range, but the man holding it is still a soldier —
   *  half power, which is still near three times an engineer. Read ONLY by the
   *  rear-guard clash: archers shoot at full power from a parapet. */
  ARCHER_MELEE: 0.5, // frac of power
  /** Of what the breakthrough lands, this share goes into the siege park and
   *  the rest into the archers and engineers defending it. Riders come for the
   *  engines — but they have to go through people to reach them. */
  ENGINE_SHARE: 0.5, // frac
};

// ─── 9 · UNIT ROLES ─────────────────────────────────────────────────────────
// Where each arm earns its keep. Archers are lethal from a parapet; footmen
// hold it; cavalry are wasted on it but own the counter-charge. On the other
// side, footmen push rams best and archers barely at all.

/** Battering rams are pushed by hand. Crew is drawn footmen first, then
 *  cavalry, then archers — and how well the ram works depends on who is
 *  pushing it. Ram crews take no part in the assault until the wall is
 *  breached (WALL_BREACH_PIVOT), and boiling oil can kill them where they
 *  stand. */
export const RAM_CREW = {
  /**
   * Hands on the beams per ram — and therefore hands OUT of the battle line
   * until the gate gives.
   *
   * Was 20, which quietly decided sieges. Thirty rams committed 600 men drawn
   * FOOTMEN FIRST, so a besieger who brought a proper battering train had no
   * screen left standing when the defender rode out: the sortie met archers
   * and engineers directly however many footmen were mustered. At 6 the same
   * thirty rams cost 180 hands, the screen survives to hold the siege lines,
   * and the SORTIE hold multipliers mean what they say they mean.
   */
  TROOPS_PER_RAM: 6,
  /**
   * The ram's wall damage, multiplied. A ram reads 100% against masonry and is
   * described as THE wall-breaker, but at 300 power ten of them took 67 attacks
   * to breach a Stone Footing and 417 to breach a Citadel — which is not a
   * wall-breaker, it is a rounding error with a crew of 200.
   *
   * Applied to the wall damage ONLY, never to the ram's raw power, because
   * `parkStrength` sums that raw power for the crew-risk threshold and a 20x
   * ram would drown every other engine in it.
   */
  WALL_MULTIPLIER: 20, // ×
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

/**
 * The share of a blow that actually tells. Everything else is turned, ducked or
 * taken on a shield.
 *
 * Drilled soldiers turn a blow that would land square on a hireling — so this
 * is skill, not armour, and deliberately NOT extra health. The distinction
 * matters: health feeds `totalHealth`, which feeds the worth that decides when
 * a defender lays down arms. Making regulars tougher by giving them health
 * would raise the surrender threshold in step with their toughness, so they
 * would survive longer per strike and still capitulate having lost the same
 * fraction — duration bought, survival not. Mitigating the damage instead
 * leaves the yield line exactly where it was and lets the toughness show up
 * where it was meant to: in living soldiers.
 */
export const DAMAGE_TAKEN: Record<"footman" | "archer" | "cavalry" | "engineer", number> = {
  // Footmen live behind a shield and are drilled to use it: four blows in five
  // turned. Cavalry are moving targets but committed to a line once they
  // charge. Archers are the worst of the three — hands full of bow, no shield,
  // and standing still to shoot.
  footman: 0.2, // dodges 80%
  cavalry: 0.3, // dodges 70%
  archer: 0.4, // dodges 60%
  // Engineers do not dodge anything — they run, and read this as flight rather
  // than skill: they scatter into the lines the moment horse are among the
  // engines, and a rider chasing one is a rider not burning a trebuchet.
  // Without some relief here a single breakthrough would end a siege by killing
  // every crew on the field. But they are the ones caught in the open with
  // tools instead of weapons, so they get less of it than a drilled footman
  // does — running is worse than a shield, better than standing to shoot.
  engineer: 0.3, // 70% get away
};

/**
 * Kept as an alias so nothing outside combat has to know the table was renamed
 * when it stopped being regulars-only.
 */
export const REGULAR_DAMAGE_TAKEN = DAMAGE_TAKEN;

/** Within regulars and within mercs alike, the cheap ranks fall first — so a
 *  layer of light troops beneath your heavies is a genuine shock absorber. */
export const CASUALTY_TIER_ORDER = ["light", "medium", "heavy"] as const;

/**
 * A bombardment is ONE exchange, like every other attack — this is how heavily
 * it lands. Five volleys' worth of stone, resolved in a single pass.
 *
 * Rounds are gone from bombard too. They bought nothing a multiplier does not:
 * a barrage has no manoeuvre and no decisions inside it, so ten iterations of
 * the same arithmetic were ten chances for the reader to lose the thread and
 * one long log nobody finished. What a sustained barrage actually IS — more
 * stone than a single throw — is a number, and this is the number.
 */
export const BOMBARD_INTENSITY = 5; // ×

/**
 * SIEGE STANCE — a standing order, like the defender's sortie.
 *
 * Trebuchets can only spend their fire once. In the GENERAL stance a share goes
 * to the enemy battery (whatever `siegeDelivery` says, 20% up to 40% with
 * Siegecraft) and everything left over falls on the wall, or on the town once
 * the wall is breached.
 *
 * COUNTER-SIEGE FIRST buys accuracy against their engines with everything else:
 * the share against the battery is half again as large — 0.20 → 0.30, and a
 * maxed 0.40 → 0.60 — and the remainder is simply WASTED. No stone reaches the
 * masonry at all.
 *
 * That is the trade, and it is meant to be a real one. Against a heavy battery
 * you cannot out-shoot, silencing it first is the only way the wall ever falls;
 * against a token battery it throws your whole barrage away. The defender keeps
 * their emplacement edge either way — choosing to duel does not make the duel
 * fair, it only makes you better at it.
 */
export const SIEGE_STANCE = {
  /** How much sharper your fire is against engines when you commit to the duel. */
  COUNTER_FOCUS_BONUS: 0.5, // frac, multiplicative on the delivery share
};

/**
 * TEMPO — what fraction of an arm's power lands in the ONE exchange a battle is.
 *
 * ****  THE DIAL. If you want strikes to bite harder or softer, move this   ****
 * ****  and nothing else. Everything about how much a war costs runs        ****
 * ****  through this number.                                               ****
 *
 * The fourth delivery ratio. Power and Health share a scale but they are not the
 * same KIND of quantity — health is a pool spent once, power is spent every time
 * the armies meet. Read raw, a medium archer (30 power) kills 1.5 light footmen
 * (25 health, ~35 after bonuses) in a single volley, so an equal host is wiped
 * out before the cavalry have even moved. This is the ratio that turns a swing
 * into a bite instead of a beheading.
 *
 * Applied to ANTI-TROOP damage only — never to rams or trebuchets working
 * masonry. Wall and building health are calibrated against a separate anchor
 * (see the header: 40 trebuchets, one Citadel); scaling siege by this would move
 * that anchor and turn every siege into a month. It changes how fast men die,
 * and nothing else.
 *
 * NOT TUNED. 0.15 is a placeholder that produces sane-looking numbers, not a
 * fitted value — it was fitted to a ten-round model that no longer exists. What
 * one strike should cost, and how many strikes should break an empire, is a
 * question for `pnpm sim` and the person reading it. Sweep it; don't trust it.
 */
export const COMBAT_TEMPO = 0.10; // frac

/** Fog of war: ±this, rolled fresh per side per round. Delivery, not a bonus. */
export const LUCK_SWING = 0.1; // frac

// ─── 11 · STAMINA ───────────────────────────────────────────────────────────

export const STAMINA = {
  MAX: 100,
  PASSIVE_RECOVERY_PER_TURN: 1,
  PASSIVE_FOOD_PER_TROOP: 0.02,
  /**
   * Resting is bought by the POINT, and it is bought with food alone.
   *
   * It used to be a single button: 5 action turns and 0.2 food a head for a
   * flat +20. Two things were wrong with that. The turns were the larger cost
   * by far — half an attack, spent on nothing that happens to anybody else —
   * which made the sensible play "attack tired" rather than "rest first", the
   * exact opposite of what stamina is for. And a flat +20 gave the ruler no
   * way to buy the 3 points that would carry them over a threshold, nor to top
   * a nearly-full army up without overpaying.
   *
   * So: no turns at all, and a price per point of the army you are actually
   * feeding. Regulars and engineers — the standing army in the Muster Hall.
   * Sellswords eat at their employer's expense.
   */
  REST_FOOD_PER_POINT_PER_TROOP: 10,

  /**
   * THE STAMINA DIAL, per ARM. How tiring a battle is, as a multiplier on the
   * work each part of the host actually did.
   *
   * Drain is "what fraction of the enemy did I get through", read onto the
   * stamina scale — cut through the whole host and you are spent. This weights
   * that by WHO did the cutting, so an army's tiring rate follows its shape:
   *
   *   archers  1.5  loose from a standing line and never close
   *   cavalry  2.0  one committed charge, then a fight on horseback
   *   footmen  2.5  the melee, where the work is hardest and longest
   *
   * Engine fire is NOT in this table and contributes nothing. A windlass being
   * cranked does not tire the men standing in the line, and stamina measures
   * how hard your soldiers swung.
   *
   * ONE stamina pool still — the weights are averaged by damage contribution,
   * NOT by headcount. Archers deal roughly double a footman's damage per head,
   * so a host that is a third bowmen by bodies can be two thirds bowmen by
   * drain, and its tiring rate drifts toward its footmen as the archers fall.
   *
   * Deliberately separate from COMBAT_TEMPO. Drain used to be nothing but
   * `MAX × damage ÷ enemy health`, which made it a hostage of the tempo:
   * lowering the tempo to make battles less decisive also made every battle
   * less tiring, so a long grind could never grind anyone down.
   */
  DRAIN_RATE: {
    archer: 1.5,
    cavalry: 2.0,
    footman: 2.5,
  } as Record<"archer" | "cavalry" | "footman", number>,
  /**
   * Delivery gate: staminaMod = MOD_BASE + MOD_PER_POINT × stamina.
   *
   * STRAIGHT PROPORTION. Stamina now IS the intensity — 100% fights at 100%,
   * 70% fights at 70%, and an army on its knees brings nothing.
   *
   * It used to read 0.5 + 0.005×s, a floor of half your power no matter how
   * spent you were: at 70 stamina you still swung at 85%, and even at zero you
   * hit for half. That floor made resting nearly pointless and made grinding a
   * tired defender almost as good as fighting a fresh one, because the thing
   * you had ground down still fought at half strength forever.
   */
  MOD_BASE: 0,
  MOD_PER_POINT: 0.01,
  /** At or below this a defender yields to anything but revenge. Raised from
   *  25: with stamina now driving intensity in a straight line, an army at 30
   *  is already fighting at less than a third and the extra five points of
   *  grinding bought the attacker nothing but corpses. */
  MERCY_FLOOR: 30,

  // Where the troops START LOOKING tired (components/TiredArt.tsx). Art only —
  // no engine code reads these, and moving them changes no arithmetic.
  //
  // Placed on thresholds that already mean something rather than on round
  // numbers. Below ART_SPENT_BELOW an army is at the MERCY_FLOOR and will lay
  // down arms rather than be cut apart, so the torn-armour sprite and the
  // surrender are the same moment. Keep the two in step if either moves.
  ART_WORN_BELOW: 70,
  ART_SPENT_BELOW: 25,
};

// ─── 12 · THE BATTLEFIELD YIELD ─────────────────────────────────────────────

export const YIELD = {
  /**
   * Lay down arms once the attacker outweighs the defender by this much on
   * POWER + HEALTH together — the whole worth of a host, not half of it.
   *
   * Both halves, because either one alone rates an army by an accident of its
   * composition. Against POWER only, a tanky host is judged on a number it was
   * never built to maximise; against HEALTH only, a glass-cannon host is judged
   * on the one it deliberately gave up. Summed, a heavy archer (55 + 40) and a
   * heavy footman (30 + 65) come out identical at 95, which is the honest
   * answer — they cost the same and they are worth the same, they simply spend
   * it differently.
   *
   * Same quantity on both sides, so the constant finally means what it says: an
   * attacker needs half again the host, whatever either side is made of.
   */
  WORTH_ADVANTAGE: 1.4,
  /** The sellswords cover the retreat. That is what sellswords are for. */
  MERC_LOSS_FRACTION: 0.25,
};

// ─── 12b · STRIPPING THE DEAD ───────────────────────────────────────────────

/**
 * SALVAGE — what the victor picks up off the field itself, and it is NOT loot.
 *
 * Whoever holds the ground walks it afterwards and strips the fallen: their
 * enemy's dead and their own alike. Two sources, one rate each:
 *
 *   DEAD REGULARS give back ORE, at ORE_SHARE. Mail, plate and blades outlive
 *   the man wearing them, so this is the generous one.
 *   DEAD SELLSWORDS give back GOLD, at GOLD_SHARE. They were bought rather than
 *   built; their whole cost was coin, and coin is what their bodies return.
 *
 * Nothing else is stripped. Not engineers, not timber (arrows are loosed and
 * staves splinter), and a regular's muster gold stays spent.
 *
 * Kept deliberately apart from LOOT, in its own report line and its own field:
 *
 *   LOOT comes out of the DEFENDER'S STOREHOUSES. Capped, size-scaled, halved on
 *   a surrender, and revenge and bombard take none of it.
 *
 *   SALVAGE comes off the BODIES. It scales with nothing but how many died, and
 *   does not care which mode was fought — so REVENGE, which carries nothing home
 *   by design, still pays for the armour of the men it killed. A punishment
 *   should cost the attacker something less than everything, without ever
 *   becoming the efficient way to farm somebody.
 *
 * Bombard has no salvage at all: it kills engineers, and engineers are not
 * stripped.
 */
export const SALVAGE = {
  /** Share of a dead SELLSWORD's hire price, recovered as gold. */
  GOLD_SHARE: 0.4, // frac
  /** Share of a dead REGULAR's ore, recovered as ore. Higher, because steel
   *  outlives the soldier. */
  ORE_SHARE: 0.7, // frac
};

// ─── 13 · LOOT ──────────────────────────────────────────────────────────────
// Raids take goods. Castle attacks take gold. Neither takes both — which is
// what makes "bombard the storehouses open, then raid, then castle" a plan
// rather than a single button.

/**
 * THE FOUR NUMBERS, and nothing else decides a share:
 *
 *                      FOUGHT AND LOST      LAID DOWN ARMS
 *   at war                    100%                50%
 *   at peace              up to 50%        up to 25%
 *
 * Two rules produce that whole table, which is why there are not four bands:
 *
 *   WAR removes the roll, the size-scaling and the relief. Everything outside
 *   the vault is simply gone, and the vault becomes the only defence there is.
 *
 *   SURRENDER always costs half of what fighting would have. One factor, applied
 *   last, in war and peace alike. It used to be a separate pair of bands that
 *   happened to work out at 0.6–0.71× a win, and in WAR it did not apply at all
 *   — `lootShare` returned WAR_SHARE before it ever looked at whether the
 *   defender had yielded, so laying down arms in wartime cost exactly as much as
 *   dying. Half is the point of surrendering.
 */
export const LOOT = {
  /** Won the field outright. Rolled, then scaled by size, then relieved, then
   *  clamped to PEACE_CEILING. */
  RAID_WIN: { min: 0.5, max: 0.7 } as Band,
  CASTLE_WIN: { min: 0.5, max: 0.7 } as Band,

  /** Laying down arms costs half of what fighting to the end would have —
   *  in war and in peace alike. Applied last, after the ceiling. */
  YIELD_FACTOR: 0.5, // ×

  /** Size scaling, applied to the rolled band. Punching up pays; farming
   *  minnows does not. */
  BIG_TARGET_RATIO: 1.5, // ×  target this much stronger…
  BIG_TARGET_BONUS: 1.25, // …× this much loot
  SMALL_TARGET_RATIO: 0.5, // ×  target this much weaker…
  SMALL_TARGET_PENALTY: 0.75, // …× this much loot

  /**
   * PEACETIME RELIEF. Applied to every peacetime share. Losing a raid should
   * sting without emptying you — the whole point of the war rules is that they
   * are worse, and they can only be worse if peace is survivable.
   */
  PEACE_MULTIPLIER: 0.85,

  /**
   * The hard ceiling on any peacetime share, applied after the roll, the size
   * scaling and the relief. Without it the big-target bonus carried a peacetime
   * raid to 74.4%, which is war money for a peacetime blow — and it left war
   * with nothing to escalate TO.
   *
   * Half in peace, all of it in war: that gap is the entire incentive to declare.
   */
  PEACE_CEILING: 0.5, // frac

  /**
   * CLAN WAR — the gloves come off, but only on the modes that already loot.
   * Between members of two clans formally at war, a raid or a castle attack
   * takes everything left outside the vault. No roll, no size-scaling, no
   * relief, no ceiling.
   *
   *              PEACE            WAR
   *   raid       goods ≤50%   →   goods 100%
   *   castle     gold  ≤50%   →   gold  100%
   *   bombard    nothing      →   nothing    (2× damage instead)
   *   revenge    nothing      →   nothing    (2× damage instead)
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

/**
 * Attacking is refused outright above this score ratio — it is what stops small
 * accounts harassing large ones. Applies to bombard too (engineers count toward
 * ranking, so a siege specialist is not locked out of their own strategy).
 * Revenge is exempt.
 *
 * It is also the top of the MATCHUP ladder below: the most you can ever be
 * punching up by is the most the gate will let you attack.
 */
export const ATTACK_REFUSAL_RATIO = 1.75; // ×

/**
 * EXPERIENCE POINTS — a ledger, not a pool.
 *
 * Veterancy used to be a 0–100 pool that decayed PROPORTIONALLY: `xp × (1 −
 * lost/before)`. Two things were wrong with that, and they were structural
 * rather than a matter of tuning.
 *
 *   It compounded. A flat +5 for being attacked was a rounding error when a
 *   battle was a ten-round engagement you fought once. Once a strike became one
 *   exchange and an empire could throw 28 of them a day, that +5 became the
 *   largest force in the game — measured at 80 XP for the defender against 9
 *   for the attacker after twelve strikes between IDENTICAL armies. Attacking
 *   somebody trained them.
 *
 *   It saturated. At 100 there was nowhere left to go, so the difference
 *   between a seasoned army and a legendary one was nothing at all.
 *
 * The ledger fixes both by being ABSOLUTE on both sides. You are credited for
 * the men you kill and debited for the men you lose, in points, and the balance
 * is what you have. No percentage of a pile, no ceiling.
 *
 *     gained = (casualties×PER_CASUALTY + attackerRegularBonus) × matchup × outcome × luck
 *     paid   = own regulars lost × PER_REGULAR_LOST          ← never scaled
 *     net    = min(MAX_PER_BATTLE, gained) − paid
 *
 * The debit is deliberately NOT scaled by the matchup: losing two hundred men
 * costs the same whoever killed them. Scale it and punching up would make your
 * own casualties cheaper, which is backwards and farmable.
 */
export const EXPERIENCE = {
  /** Points that buy +100% to power and health. The bonus is CONTINUOUS —
   *  `points / POINTS_FOR_DOUBLE` — and has no ceiling: 10,000,000 is +200%.
   *  2% per 100,000 points, which is where this figure comes from. */
  POINTS_FOR_DOUBLE: 5_000_000,

  /** 100,000 points = +2%. PURELY a display granularity — the bonus itself is
   *  continuous, and the engine never reads this. It exists so the UI can say
   *  "34,000 to your next 2%" instead of drawing a bar against a ceiling that
   *  does not exist. */
  POINTS_PER_STEP: 100_000,

  /** Every enemy soldier who falls to you, regular or sellsword alike. */
  PER_CASUALTY: 45,

  /**
   * ATTACKER ONLY, and on REGULARS only — on top of PER_CASUALTY.
   *
   * Withheld from defenders on purpose. If killing regulars paid the defender,
   * two players could collude: march an army into a friend's garrison, let it
   * die, and hand them the points. Regulars are the attacker's prize precisely
   * because the attacker is the one who chose the fight.
   */
  ATTACKER_PER_REGULAR: 45,

  /** What your own dead cost you. Absolute, and never scaled. */
  PER_REGULAR_LOST: 40,

  /** Discharging is cheaper than dying — you keep some of what they knew. */
  DISCHARGE_FACTOR: 0.5, // ×

  /** Outcome. Attackers take 20% more than defenders for the same work; losing
   *  still teaches you something, but half as much. */
  WON_ATTACK: 1.2, // ×
  WON_DEFENCE: 1.0, // ×
  LOST: 0.5, // ×

  /**
   * MATCHUP, on `ratio = theirScore ÷ yourScore` — and read from EACH SIDE'S
   * OWN point of view, so one table serves both. Punching up pays; repelling
   * somebody bigger than you pays the same way. Crushing a minnow costs you,
   * whether you marched on them or they were foolish enough to march on you.
   *
   * Breakpoints, linear between:
   *
   *   ratio  ×        what it is
   *   0.00   −1.0     bullying — the more you massacre, the more you LOSE
   *   0.50    0.0     nothing to learn here
   *   0.75    1.0     ─┐
   *   1.25    1.0     ─┘ "in your range", FLAT — an even fight is ×1
   *   1.25+   2.0     punching up starts
   *   1.75    3.0     the most the gate will even permit
   *
   * The in-range band is deliberately FLAT rather than a ramp. Ramping it read
   * an even fight at ×0.75, which quietly undercut every point target the
   * system is calibrated against — ratio 1.0 has to be exactly ×1 or nothing
   * else means what it says.
   *
   * Two boundaries are steps rather than slopes, and both come straight from
   * the spec: ×0.5→×1 at 0.75, and ×1→×2 at 1.25. A hair of score either side
   * of those changes the award sharply. Deleting the `1.2501` row smooths the
   * upper one; moving `0.75` down to `mult: 0.5` smooths the lower.
   */
  MATCHUP: [
    { ratio: 0.0, mult: -1.0 },
    { ratio: 0.5, mult: 0.0 },
    { ratio: 0.75, mult: 1.0 },
    { ratio: 1.25, mult: 1.0 },
    { ratio: 1.2501, mult: 2.0 },
    { ratio: ATTACK_REFUSAL_RATIO, mult: 3.0 },
  ] as { ratio: number; mult: number }[],

  /**
   * Revenge never reads below "in your range".
   *
   * Without this, a big empire raided by a small one would be PENALISED for
   * answering — the bully band would fire on a blow they did not choose. Revenge
   * already skips the refusal gate for the same reason. Not in the original
   * spec; delete it if retaliation should carry the bully penalty too.
   */
  REVENGE_MATCHUP_FLOOR: 1.0, // ×

  /** Fog of war on the award, rolled once per side per battle. */
  LUCK: 0.1, // ± frac

  /** Nothing beyond this is awarded for one battle, however large it was. The
   *  size ladder is meant to approach it and stop short: giant 2,000-man hosts
   *  land at 10–15k, and only a huge field with heavy regular losses reaches
   *  the cap. */
  MAX_PER_BATTLE: 20_000,
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
  /**
   * Hired blades per REGULAR of the same arm — so 3/7 here is 30% of the HOST,
   * which is the figure the cap is actually chosen against:
   *
   *     merc / (reg + merc)  =  (3/7) / (10/7)  =  0.30
   *
   * Worth stating because the two readings differ by a lot and the constant is
   * the less intuitive of the pair: at 1/3 (the old value) only a QUARTER of a
   * host was hired.
   */
  CAP_RATIO: 3 / 7,
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
 * BLOODLUST — what an avenging host hits for above its ordinary weight.
 *
 * Men who have come to answer a blow struck against them fight harder than the
 * same men marching out for plunder. It is the only damage bonus in the game
 * that is bought with nothing: no research, no building, no gold. You earn it
 * by being hit.
 *
 * Additive into the bonus pool like every other modifier, so it contributes
 * exactly what it says and never multiplies the whole stack — see the note at
 * the top of `bonusPool`. It is applied to the ATTACKING side only, and only
 * when the mode is a revenge.
 *
 * It matters more than 20% sounds. A revenge is the one attack that cannot be
 * answered with a yield and the one that takes no loot: the payment IS dead
 * regulars. This is the dial that decides whether that payment is ever
 * actually collected.
 */
export const REVENGE_BLOODLUST = 0.2; // frac, additive

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
 *   Armoury, Engine Yard) — an enemy may not disarm you by shelling; you break
 *   an army by killing it, not by cracking the sheds that made it. This matters
 *   more since the Forge and Armoury started granting combat bonuses outright:
 *   shelling them would let a besieger weaken the garrison they are about to
 *   fight, which is precisely the lever this rule exists to deny.
 * - **Shadow Guild and Ranger's Lodge** — spies and scouts are the intel game,
 *   and blinding someone from outside the walls would gut it.
 * (Hearthsteads and Muster Halls WERE immune, on the grounds that terror already
 * displaces civilians and their roofs should not be a second lever on the same
 * thing. They are targetable as of 2026-08 because the lever turned out to be a
 * different one: shelling them does not evict anybody, it closes the gates. See
 * COUNTED_HP_PER_UNIT and vacantHousing.)
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
  /**
   * Housing and barracks. Weight 2 — worth more of a besieger's attention than
   * the Collegium, less than a storehouse full of loot.
   *
   * What shelling them does is NOT eviction. Nobody already under a roof is
   * turned out: the peasants stay, the garrison stays. What falls is CAPACITY,
   * so tomorrow's settlers find no bed and are turned away, and no fresh troops
   * can be mustered until the roofs are mended. A slow strangling rather than a
   * massacre — which is a different lever from the terror that displaces
   * civilians outright, and why they are fair game after all.
   */
  { id: "hearthstead", weight: 2 },
  { id: "muster_hall", weight: 2 },
];
