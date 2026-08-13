// ═══════════════════════════════════════════════════════════════════════════
// THE BALANCE FILE — every number that shapes how the game plays, in one place.
//
// This is the single tuning surface for an era: change a value here, restart
// the dev server (or reseed the world if the change invalidates old saves),
// and the next age behaves differently. Everything is PURE DATA — numbers,
// strings, tables; no functions — so a future per-era override layer can diff
// and merge it (see spec/overview.md).
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

export const HOUSING_PER_HEARTHSTEAD = 10; // beds per hearthstead

/**
 * DAILY SETTLER INTAKE — four things people look at before moving in.
 *
 *     per day = BASE + safety + prosperity + walls     clamped to [MIN, MAX]
 *                10  +  ≤10   +    ≤40      +  ≤40   =  10 … 100
 *
 * Additive on purpose, and each term answers a different question a settler
 * asks: is there a garrison, is there work, is there a wall. None of them
 * multiplies another, so no single stat can be stacked into runaway growth and
 * none of them can zero the others out — the floor of 10 means an empire that
 * has lost everything still repopulates.
 *
 * Housing gates the result separately: arrivals that find no vacant bed are
 * turned away, not queued. Build Hearthsteads or the intake is theoretical.
 */
export const POP_GROWTH = {
  /** Everyone gets this, regardless of anything else. Also the hard floor. */
  BASE: 10, // people/day
  MIN: 10,
  MAX: 100,
  /**
   * SAFETY — the guard-to-civilian ratio, cumulative as it rises. A town with
   * no garrison attracts nobody; the returns taper because the first soldiers
   * do most of the reassuring.
   *
   *   < 20%      →  +0        ≥ 25%  →  +8
   *   ≥ 20%      →  +4        ≥ 30%  →  +10  (max)
   *
   * Deliberately the same ratio the scattering check uses (SCATTERING.TROOP_RATIO
   * = 0.2): the level at which people stop fleeing is the level at which they
   * start arriving. Sellswords count — a hired blade on the gate reassures a
   * farmer exactly as well as a levied one.
   */
  SAFETY_TIERS: [
    { ratio: 0.2, add: 4 },
    { ratio: 0.25, add: 4 },
    { ratio: 0.3, add: 2 },
  ],
  /** PROSPERITY — one settler per level of the four RESOURCE buildings (not
   *  storage: a full granary is not a job). Four buildings × 10 levels = +40. */
  PROSPERITY_PER_LEVEL: 1,
  PROSPERITY_MAX: 40,
  /** WALLS — settlers pay for stone they can stand behind. Scaled by wall
   *  integrity, so a rubbled wall reassures nobody until it is rebuilt. */
  WALLS_PER_LEVEL: 4,
} as const;

/**
 * Peasants scatter at the daily reset when the guard falls below this share of
 * them. Regulars AND mercenaries both count — a sellsword on the gate reassures
 * a farmer just as well as a levyman does.
 *
 * Sitting exactly on the line is fatal. 1,000 civilians needs 200 troops to
 * satisfy it, but a bad night costs 30–40 troops and the mercenary cascade
 * takes more on top — so the real floor a ruler should hold is nearer 250.
 */
export const SCATTERING = {
  TROOP_RATIO: 0.2, // frac
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
 *
 * 40 → 0.4 (2026-07, sim-driven), then 0.4 → 400 (2026-08), then 400 → 50
 * (2026-08, harness-driven). The age still runs COIN-RICH and GOODS-POOR —
 * gold is the thing you spend rather than the thing you hoard — but 400
 * overshot, and the buildings harness showed exactly how far.
 *
 * The swing paired a tenfold CUT to what a worker digs (WORKER_OUTPUT_CURVE,
 * 50 → 5) with a thousandfold RISE in what a civilian pays. That left the two
 * sides a hundredfold apart, and the Black Market — which converts one into the
 * other at a price fixed long before (BLACK_MARKET.BUY_PRICE) — was never
 * re-tuned to match. The result, at the default tax rate:
 *
 *   · a peasant's own taxes bought 10 goods/turn with NO building at all,
 *     which is what a level-4 producer yields — so producer levels 1–4 earned
 *     less than nothing, and a maxed level 10 beat buying by only 2.5×;
 *   · for a mid-sized empire the fence supplied ~44% of all goods, making it
 *     the main road rather than the "floor and ceiling" §11b describes.
 *
 * At 50 a peasant pays 25 gold/turn at the default rate, buying 1.25 goods
 * against the 2.5 they dig at a level-1 building: digging leads from the first
 * level and the ladder spans 2× → 20× as it climbs, so every level is worth
 * wanting. The fence falls to ~9% of a mid empire's goods — a real lifeline
 * when you are stuck, never the economy itself.
 *
 * Still 125× the pre-swing 0.4: this corrects the magnitude, it does not undo
 * the swing. Re-derive with `SIM_ONLY=buildings pnpm sim` — the slider section
 * prints this trade-off level by level for a range of candidate values.
 */
export const GOLD_PER_CIVILIAN_AT_FULL_TAX = 50; // gold/turn

export const DEFAULT_TAX_RATE = 0.5; // frac

/**
 * The production model: workers are UNLIMITED; each building level lifts every
 * worker's output. y = units/turn per worker at 0% tax, as a CURVE of
 * x = building level. Linear 10 × level — 10/turn at level 1 up to 100/turn at
 * level 10.
 *
 * 50 → 5 (2026-08) was the other half of the coin-rich, goods-poor swing: what
 * you dig became scarce and what you tax did not. 5 → 10 (2026-08, later the
 * same month) came with PRODUCER_COST: the producers were taken off the shared
 * civilian ladder and made a real investment, so what they return had to double
 * to be worth the new price.
 *
 * LINEAR is a deliberate choice and a known compromise. It keeps the number a
 * player can read off the building card — "+10 a level, 100 at the top" — at the
 * cost of a FLAT marginal return, which is what makes payback degrade across the
 * ladder (see PRODUCER_COST for the arithmetic and why 2.0 is the rate that
 * keeps every rung reachable anyway).
 */
export const WORKER_OUTPUT_CURVE: Curve = { kind: "linear", base: 0, perX: 10 };

/**
 * Research points per scholar per turn, as a curve of x = Collegium level.
 * Linear 10 × level — 10/turn at level 1 up to 100/turn at level 10.
 *
 * Was 50 × level. Cut fivefold alongside COLLEGIUM_COST, which took the
 * Collegium off the shared civilian ladder and made it a real investment: the
 * old rate finished a research level in minutes and made the Collegium's own
 * level nearly irrelevant to what you could reach.
 *
 * Research prices are GLOBAL and progressive (RESEARCH_COST_CURVE, 2000 × 1.3^n),
 * so what this really sets is HOW FAR UP that curve an age can climb. The tree
 * is not meant to be finished — the order you research in is the strategy — and
 * this rate decides where the wall stands.
 */
export const RESEARCH_OUTPUT_CURVE: Curve = { kind: "linear", base: 0, perX: 10 };

/** Food consumed per person (civilians + regular troops) per turn. */
export const FOOD_UPKEEP_PER_PERSON = 0.1; // food/turn

// Vacation — stepping away from the age entirely. Not to be confused with a
// battlefield yield (see YIELD below): vacation is a standing state you choose
// out of combat, halving your economy and locking your sword arm in exchange
// for being untouchable by everything but revenge.
export const VACATION_TAX_FACTOR = 0.5; // × on tax income
export const VACATION_PRODUCTION_FACTOR = 0.5; // × on production
export const VACATION_DAYS_PER_ERA = 20; // days, cumulative per era
export const VACATION_TICKS_PER_ERA = VACATION_DAYS_PER_ERA * TURNS_PER_DAY;
/** After returning from vacation, no fresh attacks for this long (revenge exempt). */
export const VACATION_REATTACK_COOLDOWN_TICKS = 18 * TICKS_PER_HOUR;

// Mercenaries — instant strength you rent. They cost no population and no
// training time, which is their whole appeal; everything else about them is
// expensive. They now take barracks space like any other soldier (a sellsword
// still needs a bed), they are paid off automatically when the regulars who
// commanded them die (see MERCENARIES.CAP_RATIO in battleBalance), and their
// upkeep re-pays their purchase price every few days.
export const MERC_UPKEEP_GOLD_PER_TURN = 1; // gold/turn; unpaid mercs all defect
export const MERC_PRICE_GOLD = 900; // gold, light tier; × race mercCost × wonder discount
/** Merc price for the specialist arms, priced off their regular training cost
 *  at the same multiple the line troops carry. */
export const MERC_PRICE_BY_ARM = {
  footman: 900,
  archer: 900,
  cavalry: 1400,
  engineer: 800,
  spy: 1100,
  scout: 800,
};

/**
 * Protected capacity as a CURVE of x = storage-building level (× integrity
 * applied by the engine). GEOMETRIC, doubling every level: 20,000 at level 1
 * up to 10,240,000 at level 10.
 *
 * It was linear (+20,000 a level, flat) and that could not survive the wall
 * repricing. A maxed store sheltered 200,000 against a Citadel's 26,000,000
 * stone bill — 132× more than could ever be protected — so anyone climbing the
 * top of the wall ladder carried a fortune in the open for weeks with no play
 * available to them. Storage that cannot keep pace with the things you save FOR
 * is not a decision, it is a tax on ambition.
 *
 * Doubling also fixes the shape. Flat capacity under a geometric cost curve
 * meant the price of sheltering one more unit rose 38× across the ladder;
 * matched growth holds it constant, so every level of a store is the same
 * proposition as the last.
 */
export const STORAGE_SHELTER_CURVE: Curve = { kind: "expr", formula: "20000 * 1.9 ^ (x - 1)" };

/**
 * The Counting House shelters COIN, and starts higher — 50,000 at level 1,
 * doubling to 25,600,000 at level 10.
 *
 * Gold is the abundant resource by design (see GOLD_PER_CIVILIAN_AT_FULL_TAX)
 * and walls alone cost more in coin than in materials, so a vault sized to a
 * granary would leave every treasury permanently overflowing.
 */
export const GOLD_SHELTER_CURVE: Curve = { kind: "expr", formula: "50000 * 1.9 ^ (x - 1)" };

/**
 * THE STOREHOUSES — priced apart, like the walls, and for the same reason.
 *
 * On the shared civilian ladder (800 base × 1.5) the whole five-store ladder
 * cost 453,330 goods — less than a single level-5 wall. Storage was free in
 * practice, so "can I protect this?" was never a question anyone asked.
 *
 *   BASE        1,000 gold and 900 goods at level 1, ore included from the
 *               start — a store is a real building, not a shed.
 *   RATE        2.4 per level against shelter's 1.9, so each level is ~1.26×
 *               dearer per unit protected than the last. Storage stays a
 *               decision at the top of the ladder rather than an automatic buy.
 *   MAX_LEVEL   12, two beyond every other civilian building.
 *
 * The gap between 2.4 and 1.9 is the whole design. Matched rates would make
 * every level an identical trade and maxing stores a formality; too wide a gap
 * (2.4 against 1.8) pushes the top levels past 1.0 goods per unit sheltered,
 * where a level costs more than the capacity it buys and nobody sane builds it.
 * 1.9 keeps every rung worth having while making the last few cost real thought.
 */
export const STORAGE_COST = {
  BASE: { gold: 1000, wood: 400, stone: 400, ore: 100 },
  RATE: 2.4,
  MAX_LEVEL: 12,
} as const;

/**
 * THE FOUR PRODUCERS — the Grange, Sawyer's Mill, Mason's Quarry and Deepvein
 * Mine, priced apart like the walls and the storehouses.
 *
 * On the shared civilian ladder (800 × 1.5) the whole four-producer tree cost
 * 362,664 goods — less than a single level-6 wall. The buildings that generate
 * the entire economy were the cheapest ladder in the game.
 *
 * THE RATE IS THE WHOLE DESIGN, and it is chosen against a hard constraint:
 * WORKER_OUTPUT_CURVE is linear, so each level adds a FLAT +10 per worker while
 * cost multiplies. Payback therefore degrades by the cost rate to the ninth
 * power, and the only question that matters is whether the top of the ladder is
 * still reachable by an empire that actually exists:
 *
 *     rate   L10 cost      diggers to repay L10 in a day
 *     2.6    5,972,454     4,148   — unreachable
 *     2.5    4,196,167     2,914   — unreachable
 *     2.0    1,126,400       782   — reachable
 *
 * A season's empire fields roughly 1,400 workers per resource (harness D), so
 * 2.0 is the rate at which every rung can actually be paid for. Above it the
 * last two or three levels are arithmetic nobody can complete — not a hard
 * choice, an impossible one.
 *
 * Doubling the base instead buys the same weight without that cost: a level-1
 * producer is a real building at 2,200 goods rather than pocket change at 800.
 */
export const PRODUCER_COST = {
  BASE: { gold: 2000, wood: 1000, stone: 1000, ore: 200 },
  RATE: 2.0,
} as const;

/** Cost MULTIPLIER for a producer as a curve of x = target level. */
export const PRODUCER_COST_CURVE: Curve = {
  kind: "expr",
  formula: `${PRODUCER_COST.RATE} ^ (x - 1)`,
};

/** Cost MULTIPLIER for a storehouse as a curve of x = target level. */
export const STORAGE_COST_CURVE: Curve = {
  kind: "expr",
  formula: `${STORAGE_COST.RATE} ^ (x - 1)`,
};

// ─── 5 · BUILDING COSTS ─────────────────────────────────────────────────────
// resourceCost(level) = baseCost × BUILDING_COST_CURVE(level), split by ratio
// bands. goldCost(level) = GOLD_COST_SHARE × resourceCost(level).

/** Cost MULTIPLIER as a curve of x = target level. Default: ×1.5 per level. */
export const BUILDING_COST_CURVE: Curve = { kind: "expr", formula: "1.5 ^ (x - 1)" };
export const GOLD_COST_SHARE = 0.5; // frac of the resource cost, paid in gold

export const BASE_COSTS = {
  /**
   * UNUSED as of the 2026-08 pass, and kept only as the reference point every
   * bespoke ladder was priced against.
   *
   * All thirteen levelled civilian buildings now have their own cost block —
   * PRODUCER_COST, STORAGE_COST, MARKET_COST, COLLEGIUM_COST, GUILD_COST,
   * LODGE_COST — because a single 800 × 1.5 ladder could not serve buildings
   * whose returns range from accelerating (the Market Square) to flat (the
   * Ranger's Lodge). Nothing reads this; `buildingCost` has no civilian
   * fall-through left.
   */
  civilian: 800, // levelled civilian buildings — see above, no longer read
  military: 1200, // levelled/tiered military buildings
  hearthstead: 300, // flat per instance
  muster_hall: 500, // flat per instance
};

/**
 * [wood, stone, ore] shares of the non-gold cost.
 *
 * The arc of a realm, read in materials: you begin in TIMBER, you grow into
 * STONE, and the last few levels of anything demand EVERYTHING at once —
 * seasoned beams, dressed masonry and iron fittings together. That final band
 * is the wall an empire hits at levels 7–10, and it is deliberate: nothing is
 * maxed cheaply.
 *
 * Stone carries more weight here than it used to, because siege engines no
 * longer consume any — quarries feed buildings now, forges feed war.
 */
export type RatioBand = [number, number, number];

/** Civilian: timber village → stone town → iron-fitted city. */
export const CIVILIAN_BANDS: RatioBand[] = [
  [0.7, 0.3, 0.0], // levels 1–3  — timber frames and thatch
  [0.35, 0.65, 0.0], // levels 4–6  — the realm's stone age
  [0.25, 0.6, 0.15], // levels 7–8  — ironwork enters the bill
  [0.2, 0.55, 0.25], // levels 9–10 — everything, all at once
];

/** Military: stone-heavier throughout — these are fortifications, and their
 *  late levels are the most demanding structures in the game. */
export const MILITARY_BANDS: RatioBand[] = [
  [0.55, 0.45, 0.0], // levels 1–3  — palisade and drill yard
  [0.3, 0.7, 0.0], // levels 4–6  — curtain walls and towers
  [0.2, 0.65, 0.15], // levels 7–8  — machicolation, portcullis, iron
  [0.15, 0.55, 0.3], // levels 9–10 — the Citadel's price
];

/** Tiered trainers (3 levels): which cost band each tier level uses. */
export const TIERED_BAND_INDEX: Record<number, number> = { 1: 0, 2: 1, 3: 3 };

/**
 * THE WALLS — priced apart from every other structure, on purpose.
 *
 * Walls used to ride the shared military ladder (BASE_COSTS.military on
 * BUILDING_COST_CURVE), and the pacing harness showed where that led: an empire
 * that never fought finished the entire wall ladder, Citadel included, on
 * DAY EIGHT. A 500-strong realm went level 6 → 10 in 41 turns — under three
 * hours. The most formidable structure in the game was an afternoon's errand.
 *
 * Three departures from the shared machinery, each doing a different job:
 *
 *   BASE_GOODS  a level-1 Palisade costs 4,000 goods rather than 1,200, so the
 *               first wall is a real decision on day one instead of pocket
 *               change.
 *   GOLD_SHARE  walls cost MORE in coin than in materials (1.25× the resource
 *               bill, against GOLD_COST_SHARE's 0.5 everywhere else). They are
 *               the one thing a coin-rich empire should pour its treasury into.
 *   RATE        a single flat step per level, steeper than the 1.5 everything
 *               else climbs, and capped so no rung is ever a cliff.
 *
 * The rate is what makes the upper levels a campaign rather than a purchase —
 * and it deliberately outruns storage. A Citadel's stone bill is far beyond what
 * a maxed Mason's Yard can shelter (STORAGE_SHELTER_CURVE), so the pile you are
 * saving sits loose and raidable. Building the greatest wall in the realm should
 * mean surviving the window in which you are visibly carrying a fortune.
 *
 * Re-derive with `SIM_ONLY=pacing pnpm sim`, which reports the day each ladder
 * tops out. The target is a season that ends with everything BARELY finished.
 */
export const WALLS_COST = {
  BASE_GOODS: 4000, // goods at level 1 — 2,000 wood + 2,000 stone
  GOLD_SHARE: 1.25, // × the resource cost, paid in gold — 5,000 at level 1
  /**
   * What each level costs relative to the one below it. FLAT — every rung is
   * the same step, and no rung may exceed 3×.
   *
   * This replaced a pivot-and-steepen shape (ordinary 1.5 through level 6, then
   * a compounding ×5.5, then a gentler top). It priced the season correctly and
   * was still wrong: it made levels 7, 8 and 9 cost 8.25× the rung below, so the
   * ladder had a cliff in the middle that no amount of planning could smooth.
   * A ruler saving for Concentric Walls was not climbing, they were stopped.
   *
   * A single rate has no cliff anywhere by construction, and it is the whole
   * shape in one number — there is no interaction between three regimes to
   * reason about when this moves.
   */
  RATE: 2.8,
} as const;

/** Cost MULTIPLIER for walls as a curve of x = target level: RATE per level,
 *  the same at every rung. */
export const WALLS_COST_CURVE: Curve = {
  kind: "geometric",
  base: 1 / WALLS_COST.RATE, // so that x = 1 yields exactly 1
  ratio: WALLS_COST.RATE,
};

/**
 * Walls' own [wood, stone, ore] bands. Level 1 is an even split of timber and
 * stone; stone takes over as the realm grows into masonry.
 *
 * From level 7 the mix is PINNED — stone at 2.5× the wood, ore at 0.5× — and it
 * does not keep tilting toward stone and iron the way MILITARY_BANDS does. Ore
 * is the war-metal: troops and siege engines both eat it, and a wall ladder that
 * demanded ever more of it would quietly price an empire out of the army it
 * needs to fight behind that wall.
 */
export const WALLS_BANDS: RatioBand[] = [
  [0.5, 0.5, 0.0], // levels 1–3  — palisade, rampart, motte
  [0.3, 0.7, 0.0], // levels 4–6  — the realm's stone age
  [0.25, 0.625, 0.125], // levels 7–8  — stone 2.5× wood, ore 0.5× wood
  [0.25, 0.625, 0.125], // levels 9–10 — the same mix, at the Citadel's scale
];

export const TROOPS_PER_MUSTER_HALL = 10; // beds per hall

/** Wall repair: damagedFraction × wall build cost × this factor. */
export const WALL_REPAIR_COST_FACTOR = 0.5; // frac

// ─── 6 · RESEARCH ───────────────────────────────────────────────────────────

export const MAX_FIELD_LEVEL = 5; // levels per field

/** The DEFAULT per-level effect: +20%, so a maxed field is +100%. */
export const EFFECT_PER_LEVEL = 0.2; // frac

/**
 * Per-field overrides. One global rate stopped being workable once fields
 * started doing different KINDS of thing: Free Companies at +100% would make
 * mercenaries free, and Siege Accuracy moves a delivery gate (30%→60%) rather
 * than adding to the bonus pool at all. Anything absent here uses
 * EFFECT_PER_LEVEL.
 */
export const RESEARCH_EFFECT_PER_LEVEL: Record<string, number> = {
  /** Cuts the price of hiring sellswords — −50% at level 5. The field that
   *  makes a long war affordable, since mercenaries now churn constantly. */
  free_companies: 0.1,
  /** Handled by SIEGE_ACCURACY in battleBalance — it interpolates two delivery
   *  gates instead of contributing to the additive pool. Listed as 0 so nothing
   *  double-counts it. */
  siege_accuracy: 0,
  /** Deeper vaults: +5% protected capacity per level, +25% at level 5. Modest
   *  on purpose — shelter already doubles-ish with each storehouse level, so a
   *  research field that moved it 20% a level would outrun the building it is
   *  meant to supplement. */
  granarycraft: 0.05,
};

/**
 * Research cost is GLOBAL and progressive: the price of your x-th research
 * level overall (any field) is this CURVE, in research points — the ORDER you
 * research in is the strategy. Geometric 1000 × 1.2^(x−1). (Engine rounds to
 * whole points.)
 *
 * The BASE (1000) and the EXPONENT (1.2) do different jobs, and it is worth
 * keeping them straight. The base scales every price uniformly, so halving it
 * is exactly equivalent to doubling everyone's research output — it shifts the
 * ceiling by a fixed ~3.8 levels and changes nothing about the shape. The
 * exponent decides how steeply the ladder climbs, and therefore how much any
 * investment in scholars is ever worth. Reach for the base to move the whole
 * game a notch; reach for the exponent to change what research IS.
 *
 * 1.3 → 1.2 (2026-08). At 1.3 the tree cost 2.34 TRILLION points and a 60-day
 * age reached 33 levels of 80: over half the tree was decorative, unreachable
 * by any empire at any size, and 10× more research output bought only 8.8 more
 * levels — so investing in scholars barely moved the ceiling.
 *
 * THIS EXPONENT IS THE ONLY LEVER ON THAT CEILING. The Collegium sets the speed;
 * this sets how far up the price an age can climb, and nothing else does. At 1.2
 * the same age reaches ~45, a committed one ~67, and 10× output buys 12.6
 * levels — so scale finally tells.
 *
 * The trade, deliberately accepted: research responds ~43% more to investment,
 * which favours whoever is already largest. Art of War, Shieldcraft and
 * Siegecraft are all +100% fields, so a big empire now maxes more of the
 * military tree where before it had to choose.
 */
export const RESEARCH_COST_CURVE: Curve = { kind: "expr", formula: "1000 * 1.2 ^ (x - 1)" };

/** Fraction of the CURRENT field's banked progress LOST when the scholars are
 *  re-pointed to a different field. */
export const RESEARCH_SWITCH_LOSS = 0.5; // frac, before Scholarship

/**
 * SCHOLARSHIP — endowed chairs, a standing faculty, and a library that keeps
 * its notes when the scholars are re-pointed.
 *
 * Two effects, and the SMALLER number is the one that matters:
 *
 *   OUTPUT       +20% a level, ×2.00 at mastery. Reads like the headline and is
 *                nearly decorative. Research prices climb 1.3× a level, so
 *                breaking even on five levels spent would need 1.3^5 = 3.71×
 *                output. Doubling buys back 2.6 levels against the 5 it cost —
 *                a net loss of about two. It is here because it makes the field
 *                feel like something, not because it pays.
 *   SWITCH LOSS  −10 POINTS a level, so 50% → 0% at mastery. This is the real
 *                product. Every ill-timed redirection currently burns half of
 *                whatever is banked toward the current field — up to half a
 *                level, a quarter on average — and twenty of those across an age
 *                is the five levels the field costs.
 *
 * Deliberately NOT a counter to espionage, though it was considered. Scouts are
 * the only defence against spies (see covertBalance.ts) and the whole covert
 * economy rests on that: a research field granting free, agentless mitigation
 * would have half-obsoleted Pathfinding.
 */
export const SCHOLARSHIP = {
  /** Off RESEARCH_SWITCH_LOSS per level, in ABSOLUTE fractions: 50% → 0%. */
  SWITCH_LOSS_PER_LEVEL: 0.1,
  /** Added to every scholar's output per level. ×2.00 at mastery. */
  OUTPUT_PER_LEVEL: 0.2, // frac
};

// ─── 7 · UNITS & TRAINING ───────────────────────────────────────────────────

// Unit power/health and tier scaling now live in battleBalance.ts, on the same
// shared scale as walls, buildings and siege engines (see UNIT_POWER,
// TIER_SCALE). Re-exported at the foot of this file.

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

/** The army's clock. Espionage runs on its own, scarcer clock — see
 *  SPY_TURNS in covertBalance.ts. */
export const ACTION_TURNS = {
  PER_GAME_TURN: 2, // regained each game turn — 288/day
  START: 200,
  CAP: 500,
  ATTACK_COST: 10,
  REST_COST: 5,
};

// Everything that decides a fight now lives in battleBalance.ts, and everything
// that decides the shadow war in covertBalance.ts. Both are re-exported at the
// foot of this file, so `lib/constants` remains the single import surface.
//
// Why they moved: the combat rework put walls, buildings, troops and engines on
// ONE shared power/health scale, and that model needs to be documented as a
// whole rather than scattered through a general-purpose balance file.

export const ATTACK_HISTORY_TICKS = 72 * TICKS_PER_HOUR;

// ─── 11 · MARKET (the Grand Bazaar) ─────────────────────────────────────────

/** Caravan capacity per merchant = this × Market Square level. 10,000 at level
 *  1 up to 100,000 at level 10 — a caravan is a real shipment, not a cart. */
export const CARAVAN_CAPACITY_PER_MARKET_LEVEL = 10000; // units

/**
 * THE MARKET SQUARE — its own ladder, apart from the other civilian buildings.
 *
 * It earned one: it is the only building whose return ACCELERATES. Every level
 * raises capacity AND cuts the road time, and throughput is their product, so
 * the last level adds +9,167 units/turn where the first added 167. A ×2.0 cost
 * rate against a 100× throughput range leaves value degradation at ~5.7× — and
 * the top of the ladder is the best-value rung on it, which is true of nothing
 * else in the game.
 */
export const MARKET_COST = {
  BASE: { gold: 6000, wood: 2000, stone: 2000, ore: 500 },
  RATE: 2.0,
} as const;

export const MARKET_COST_CURVE: Curve = {
  kind: "expr",
  formula: `${MARKET_COST.RATE} ^ (x - 1)`,
};

/**
 * THE COLLEGIUM — off the shared ladder, on its own ×1.9.
 *
 * Gentler than the Market Square's ×2.0 on purpose. The Market's return
 * accelerates (capacity × speed), so it can carry a steep price; the Collegium's
 * is FLAT at +10 RP a level, and it is spending those points against a cost
 * curve that climbs 1.3× per research level. Its late levels are therefore
 * fighting an exponential from both sides, and pricing them like the Market's
 * would make the last two or three worth nobody's stone.
 */
export const COLLEGIUM_COST = {
  BASE: { gold: 6000, wood: 2000, stone: 2000, ore: 500 },
  RATE: 1.9,
} as const;

export const COLLEGIUM_COST_CURVE: Curve = {
  kind: "expr",
  formula: `${COLLEGIUM_COST.RATE} ^ (x - 1)`,
};

/**
 * THE SHADOW GUILD and THE RANGER'S LODGE — the last two off the shared ladder.
 *
 * All four of the old shared buildings now climb at their OWN rate, and the
 * order is not arbitrary — it tracks how much a level actually returns:
 *
 *     Market Square    2.0   return ACCELERATES (capacity × road speed)
 *     Collegium        1.9   flat +10 RP, against a 1.2 price curve
 *     Shadow Guild     1.8   flat +10% to spy work
 *     Ranger's Lodge   1.7   flat +10% to scout work
 *
 * The Lodge is the cheapest deliberately. Scouts are the ONLY defence against
 * spies (covertBalance.ts) as well as the whole intelligence arm, so its levels
 * are the ones a player cannot opt out of — and defence a newcomer cannot afford
 * is defence that does not exist. The Guild sits a rung above it because
 * espionage is a campaign you choose to run.
 *
 * These two also carry a HEAVIER BASE than the Market and Collegium — 7,000
 * goods at level 1 against 4,500 — paired with the two softest rates. That is
 * the right shape for a flat return: weight at the entry, where committing to a
 * covert arm at all is the real decision, rather than in a tail where a level
 * costs a fortune for the same +10% the first one gave. Steeper rates were
 * considered and rejected for exactly that reason — ×1.9 put the Guild's last
 * level at 2.26M goods and its degradation at 323×, which is a level nobody
 * without a dedicated spy game would ever buy.
 */
export const GUILD_COST = {
  BASE: { gold: 9000, wood: 3000, stone: 3000, ore: 1000 },
  RATE: 1.8,
} as const;

export const LODGE_COST = {
  BASE: { gold: 9000, wood: 3000, stone: 3000, ore: 1000 },
  RATE: 1.7,
} as const;

export const GUILD_COST_CURVE: Curve = { kind: "expr", formula: `${GUILD_COST.RATE} ^ (x - 1)` };
export const LODGE_COST_CURVE: Curve = { kind: "expr", formula: `${LODGE_COST.RATE} ^ (x - 1)` };

/** Delivery time (turns) as a curve of x = Market Square level, floored at
 *  MIN_TURNS by the engine. Default: 110 − 10×level — 100 turns at L1 down to
 *  10 at L10. Goods aren't buyable (and don't count toward price/supply)
 *  until they arrive. */
export const CARAVAN_DELIVERY_CURVE: Curve = { kind: "linear", base: 66, perX: -6 };
export const CARAVAN_DELIVERY_MIN_TURNS = 6; // turns floor — level 10 sits on it

/**
 * Fee on every sale, paid by the seller, BURNED (the gold sink).
 *
 * 5% → 20%, and now fully removable: The Merchants' Charter cuts it by
 * MARKET_FEE_PER_RESEARCH_LEVEL a level and reaches ZERO at mastery. A flat 5%
 * was too small to notice and too small to sink meaningful gold; a fifth of
 * every sale is a real cost, and buying your way out of it is a real reward.
 */
export const MARKET_FEE = 0.2; // frac, before The Merchants' Charter

/** Ask prices are whole gold per unit, bounded to this band. The band sits
 *  strictly INSIDE the Black Market's spread (see §11b): the system pays
 *  BLACK_MARKET.SELL_PRICE and charges BLACK_MARKET.BUY_PRICE, so player asks
 *  are always better for both sides than dealing with the fence. */
export const MARKET_PRICE_MIN = 2; // gold
export const MARKET_PRICE_MAX = 19; // gold

/** Fraction of a recalled caravan's remaining goods LOST on the road home.
 *  Turning a caravan around costs you — it stops the Bazaar being a free
 *  parking space you can pull goods out of the moment a raid is inbound. */
export const MARKET_RECALL_LOSS = 0.5; // frac, before The Merchants' Charter

// ─── 11c · THE TWO TRADE FIELDS ─────────────────────────────────────────────
//
// Every other economic pillar had a research field behind it — four for
// production, one for the treasury, one for storage — and trade had none. These
// two fill that gap, and they are deliberately shaped so neither is a strict
// upgrade of the other: one shortens the ROAD, the other changes the TERMS.
//
// Both are unranked. What they publish is how efficiently you trade and how
// cheaply you muster, and neither is martial strength (see SCORE).

/**
 * THE KING'S ROADS — metalled roads and a courier chain.
 *
 * Cuts BOTH the muster bill and the road time, because they are the same
 * problem: moving people and goods across your own territory. The delivery cut
 * compounds with the Market Square's own curve, so a maxed market on maxed
 * roads runs 6 turns → 5 (Math.ceil keeps every figure a whole turn — a caravan
 * arrives in 18 turns, never 18.45).
 */
export const KINGS_ROADS = {
  /** Off the gold+goods cost of training regulars, per level. −25% at mastery. */
  TROOP_COST_PER_LEVEL: 0.05, // frac
  /** Off caravan delivery turns, per level. −25% at mastery, then rounded UP. */
  DELIVERY_PER_LEVEL: 0.05, // frac
};

/**
 * THE MERCHANTS' CHARTER — guild privileges, bonded warehouses, safe passage.
 *
 * Three things at once, all about the TERMS of trade rather than its speed:
 * the Bazaar's cut, how much a caravan carries, and how much survives a recall.
 * The fee reaching exactly zero at mastery is the headline — it turns the
 * Bazaar from something you pay to use into something you own.
 */
export const MERCHANTS_CHARTER = {
  /** Off MARKET_FEE, per level, in ABSOLUTE fractions. 0.04 × 5 = the whole
   *  0.20 fee, so mastery trades free. */
  FEE_PER_LEVEL: 0.04,
  /** Added to caravan capacity, per level. +25% at mastery. */
  CAPACITY_PER_LEVEL: 0.05, // frac
  /** Off MARKET_RECALL_LOSS, per level, in ABSOLUTE fractions: 50% → 25%.
   *  Turning a caravan around stays costly — it must never become a free undo,
   *  or the Bazaar is a raid-proof warehouse again (see cancelOrder). */
  RECALL_LOSS_PER_LEVEL: 0.05,
};

// ─── 11b · THE BLACK MARKET (the fence) ─────────────────────────────────────
//
// A SYSTEM counterparty, not a player one: instant, unlimited, anonymous, and
// deliberately the worst price in the game. It exists to put a hard floor and
// ceiling under the Bazaar rather than to be used.
//
//     sell to the fence ──►  1 gold/unit   (floor: goods are never worthless)
//     player Bazaar     ──►  2 … 19        (where trade actually happens)
//     buy from the fence ─► 20 gold/unit   (ceiling: gold can always buy bread)
//
// The spread is what makes it safe. Every round trip through the fence loses
// money — buy at 20 and dump at 1 and you are down 19 a unit — so there is no
// arbitrage loop, and no path that mints either resource or gold for free.
// Selling is a gold faucet and a resource sink; buying is the exact reverse.

export const BLACK_MARKET = {
  /** Gold paid per unit when you dump resources on the fence. */
  SELL_PRICE: 1, // gold / unit
  /** Gold charged per unit when you buy from the fence. Above MARKET_PRICE_MAX
   *  by design — the fence must never undercut a player caravan. */
  BUY_PRICE: 20, // gold / unit
} as const;
// Siege salvage is also fenced here, but the rate lives with the engines it
// values (SIEGE_SALVAGE_VALUE, battleBalance.ts) — one number, one home.

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
/** The Wonder's zenith — and the clan victory clock's price of entry. It was
 *  written as a bare 3 in the build check and again in the victory check; one
 *  constant so raising it can never move only half the game. */
export const WONDER_MAX_LEVEL = 3;

/** Mending a bombarded clan work costs this fraction of its current-level build
 *  cost, scaled by the damage taken (1 − integrity). Mirrors the empire wall
 *  repair factor. Paid from the clan pool. */
export const CLAN_REPAIR_COST_FACTOR = 0.5;

/** Clan build costs — pure data (`each` = wood AND stone AND ore, per level).
 *  hall[1].gold is the solo founding fee. Derived accessors in clans.ts. */
/**
 * THE CLAN BEACON — the horns that sound when war is declared.
 *
 * A declared war does not turn lethal at once. Every clan gets a grace period
 * in which attacks between the two sides still resolve at PEACETIME rates —
 * normal damage, normal loot bands — and the Beacon buys more of it:
 *
 *     no Beacon →  6h      L1 → 12h      L2 → 18h      L3 → 24h
 *
 * The grace is PER CLAN and protects that clan's own members. Attacks on you
 * stay peaceful until YOUR horns have finished sounding, whatever the other
 * side has built. So a clan with taller Beacons than its enemy gets a genuine
 * one-sided window: it can strike at full war rates while blows against it are
 * still landing at peacetime rates.
 *
 * That asymmetry is the point, and it is what makes the Beacon worth its price
 * — it is not a shield, it is the drum you beat first. The counter is to build
 * your own, or to not be at war with someone who has.
 */
export const CLAN_BEACON = {
  MAX_LEVEL: 3,
  /** Grace every clan gets, Beacon or not. */
  BASE_GRACE_HOURS: 6,
  GRACE_HOURS_PER_LEVEL: 6,
  /** Hard ceiling, so raising MAX_LEVEL alone cannot make wars unfightable. */
  MAX_GRACE_HOURS: 24,
};

export const CLAN_BUILD_COSTS = {
  storagePerLevel: { gold: 100000, each: 50000 },
  /** Dearer than Storage, cheaper than a Wonder: it wins no points on the
   *  ladder to speak of, it buys tempo. */
  beacon: [
    null,
    { gold: 400000, each: 200000 }, // L1 — 12h
    { gold: 1000000, each: 500000 }, // L2 — 18h
    { gold: 2000000, each: 1000000 }, // L3 — 24h
  ],
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
  /** A war with no blows struck between the two clans for this long lapses.
   *  Whoever is ahead on net regular kills takes the record; a war that never
   *  drew blood (or is dead even) ends with no winner and no loser at all. */
  STALE_HOURS: 72,
};

export const CHURN = {
  REJOIN_COOLDOWN_HOURS: 48, // after leaving or being kicked
  MAX_DEPARTURES_PER_ERA: 2, // leaves + kicks both count
};

/** Chat retention. A clan hall keeps a rolling window of its own talk — older
 *  words are dropped for good. TOTAL is the backstop across every channel. */
export const CHAT = {
  CLAN_HISTORY: 200, // messages kept per clan channel
  TOTAL_HISTORY: 2000, // hard cap across all channels combined
};

/**
 * How often one ruler may speak in a PUBLIC room (era hall and clan hall).
 *
 * Three windows, all enforced together, because one limit only stops one shape
 * of spam: the burst catches a flood, the hour catches a steady drip, and the
 * day catches someone who paces themselves all afternoon. Letters are exempt —
 * a private thread with one other player is not a room anyone can be shouted
 * out of.
 */
export const CHAT_LIMITS = {
  BURST: { messages: 3, minutes: 5 },
  HOURLY: { messages: 20, minutes: 60 },
  DAILY: { messages: 50, minutes: 60 * 24 },
};

/**
 * Clan-hall silences a leader may hand out. They stop POSTING, never reading —
 * a member who cannot see the hall cannot follow the war they are fighting in.
 */
export const CLAN_MUTE_DAYS = [1, 3] as const;

/**
 * The cut taken from a direct gift between clan members, and burned.
 *
 * Member-to-member aid deliberately bypasses the vault's 3× withdrawal rule, so
 * it needs its own friction or it becomes the frictionless funnel the 3× rule
 * exists to prevent. A flat rate rather than the sender's tax dial: a dial you
 * can set to zero for one turn is not a cost, and taxing the giver MORE for
 * running a high-tax economy makes no sense.
 */
export const CLAN_GIFT_TAX = 0.1; // frac, burned

// ─── 13 · VICTORY & RANKING ─────────────────────────────────────────────────

export const HOLD_CLOCKS = {
  CUMULATIVE_HOURS: 72, // at #1, never resets
  STREAK_HOURS: 12, // consecutive at #1, resets when knocked off
};

/**
 * ARMY FLOORS to be eligible for a victory clock — REGULARS ONLY.
 *
 * Regulars, not population and not mercenaries. You cannot buy the throne: a
 * war chest hires sellswords in an afternoon, but regulars are barracks, beds,
 * training time and food, and losing them is the one thing that genuinely
 * costs. Tying the crown to them means the empire that wins is the one that
 * actually built an army and kept it alive.
 */
export const ARMY_FLOORS = {
  INDIVIDUAL: 2400, // regulars, for a lone empire's clock
  CLAN: 25000, // regulars summed across the clan's members
};

/**
 * Ranking score weights — MARTIAL STRENGTH AND PEOPLE, nothing else.
 *
 * The ladder publishes ONE number, and many different empires produce the same
 * number. A turtle behind a Citadel and a hammer with a huge field army can
 * rank identically while needing opposite answers — so rank tells you WHETHER
 * a target is worth your turns, and only a scout tells you HOW to attack.
 * That is deliberate: it is what keeps Map the Army and Map the Siege Train
 * worth paying for.
 *
 * COUNTED: troops (regulars AND mercenaries), engineers, defensive counters,
 * walls, scouts (at a discount), army veterancy, population, research.
 *
 * NOT COUNTED — and this is the load-bearing part:
 *   · OFFENSIVE siege gear. Your siege train is the single most valuable thing
 *     a rival could know about you, so it never appears. Engineers DO count
 *     (they are dual-use — they crew your counters when you are not attacking),
 *     which means the investment shows without the composition showing.
 *   · Spies. Covert is covert.
 *   · Civilian buildings, housing, and liquid wealth.
 *
 * BALANCE CONDITION: these weights must stay roughly gold-equivalent per point.
 * If any one path buys rank appreciably cheaper than the others, everyone
 * builds that one thing, every empire converges on one shape, and the
 * "many compositions, same score" property — the thing protecting scouting —
 * collapses. The sim checks points-per-gold across every path for outliers.
 */
export const SCORE = {
  PER_CIVILIAN: 10, // pts
  /** Troops and engineers score their COMBAT POWER directly — the same number
   *  the battle engine uses, so there is one source of truth. */
  PER_POWER_POINT: 1, // pts per point of unit power
  /** Sellswords count now: they hold a wall and they die like anyone else. */
  MERC_POWER_FACTOR: 1.0, // ×
  /** Defensive counters score their power, discounted. An engine's raw power
   *  is on the same scale as a soldier's but costs far less per point, so at
   *  1.0 a Counter-Engine bought nearly 4× the rank per gold that a footman
   *  did — enough that every empire would have converged on the same shape and
   *  taken the value of scouting down with it (see the ranking-honesty sim). */
  COUNTER_POWER_FACTOR: 0.25, // ×
  /** Siege scores ONLY when crewed — forty uncrewed trebuchets are lumber, and
   *  this stops rank-farming by hoarding engines you cannot man. */
  SIEGE_REQUIRES_CREW: true,
  /** Rangers are worth something, but less than a soldier. */
  PER_SCOUT: 10, // pts (regular scouts only — mercenary rangers score nothing)
  /** Engineers score as a corps rather than as fighters (their combat power is
   *  zero by design). This is what keeps a bombardier visible on the ladder
   *  without revealing whether their engines throw stones or pour fire. */
  PER_ENGINEER: 12, // pts — priced against a footman per gold spent
  PER_XP_POINT: 100, // pts, army experience 0–100
  PER_RESEARCH_LEVEL: 1000, // pts, ranked fields only
};

/** Walls ranking score (pts) as a curve of x = wall level (× integrity applied
 *  by the engine). Quadratic level² × 100 — a Citadel is worth 100× a
 *  palisade, mirroring how much more it absorbs. */
export const WALLS_SCORE_CURVE: Curve = { kind: "polynomial", coefficients: [0, 0, 100] };

/** Clan score adds building points × integrity. */
export const CLAN_BUILDING_POINTS = {
  storage: 500, // pts × level × integrity
  hall: 2000,
  // Modest on purpose. The Beacon's value is tempo, not prestige — scoring it
  // richly would make it a way to buy ladder position rather than preparation.
  beacon: 750,
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

// ─── 16 · THE SPECIALIST TUNING FILES ───────────────────────────────────────
// Battle and espionage grew their own files once they grew their own models.
// Re-exported here so `lib/constants` stays the one import surface for the
// engine, and so the Balance Workbench can enumerate everything from one place.

export * from "./battleBalance";
export * from "./covertBalance";
