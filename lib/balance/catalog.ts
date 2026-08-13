// The Balance Catalog — one description of every tunable, driving BOTH the
// public Codex (read-only) and the admin Workbench (editable). Client-safe:
// imports only pure data from lib/constants (no server/fs). Values here are the
// COMPILED defaults; the workbench overlays local edits on top for preview.
//
// Everything carries a plain-language `desc` so a reader who has never seen the
// engine can tell what a knob does, and is filed under a top-level `category`
// (via its `group`) so the pages can split into digestible tabs.

import { evalCurve, type Curve } from "@/lib/constants/curves";
import * as C from "@/lib/constants";

// ── Categories (the page tabs) ───────────────────────────────────────────────

export interface Category {
  key: string;
  label: string;
  icon: string;
  blurb: string;
  groups: string[]; // which domain groups fall under this tab
}

export const CATEGORIES: Category[] = [
  {
    key: "growth",
    label: "Growth & People",
    icon: "🌱",
    blurb:
      "How your population swells. Settlers arrive each day based on how built-up your realm is, then housing and wall damage decide how many actually stay.",
    groups: ["Growth"],
  },
  {
    key: "economy",
    label: "Economy & Trade",
    icon: "⚖️",
    blurb:
      "Where gold, wood, stone and ore come from and where they go — worker output, building costs, what the taxman takes, the Bazaar, and hired blades.",
    groups: ["Economy", "Market", "Mercenaries"],
  },
  {
    key: "research",
    label: "Research",
    icon: "📚",
    blurb:
      "The price of knowledge. Research is global and progressive: every completed study costs more than the last, so the order you learn things in is the strategy.",
    groups: ["Research"],
  },
  {
    key: "military",
    label: "War & Army",
    icon: "⚔️",
    blurb:
      "Everything that decides a battle — unit stats and tiers, training costs, walls, the lethality maths, experience, loot, siege engines and their counters.",
    groups: ["Units", "War", "Combat", "Siege", "Action turns"],
  },
  {
    key: "covert",
    label: "Spies & Scouts",
    icon: "🗝",
    blurb:
      "The shadow war. Scouts are the whole intelligence arm AND the only defence against spies; spies are the whole destruction arm. Both spend from one scarce pool of spy turns, so watching a rival and robbing them compete for the same purse.",
    groups: ["Covert"],
  },
  {
    key: "endgame",
    label: "Victory & Rank",
    icon: "👑",
    blurb:
      "How the age is won and how the ladder is scored — the crown-hold clocks, population floors, ranking weights, and the clan war rules.",
    groups: ["Victory", "Ranking", "Clans"],
  },
  {
    key: "world",
    label: "World & Races",
    icon: "🌍",
    blurb:
      "The frame the whole game runs in — turn length and pacing — and the six races' production and combat modifiers.",
    groups: ["Races", "Time & pacing"],
  },
];

export const categoryOf = (group: string): string | undefined =>
  CATEGORIES.find((c) => c.groups.includes(group))?.key;

// ── Curves ──────────────────────────────────────────────────────────────────

export interface CurveMeta {
  key: string; // export name in balance.ts
  label: string;
  yUnit: string; // what the output means
  xLabel: string; // what x means
  xMin: number;
  xMax: number;
  xStep: number;
  group: string;
  desc: string; // plain-language: what this governs, and what moving it does
  note?: string;
}

export const CURVES: CurveMeta[] = [
  {
    key: "BUILDING_HP_CURVE",
    label: "Building health",
    yUnit: "health",
    xLabel: "building level",
    xMin: 1,
    xMax: 12,
    xStep: 1,
    group: "Siege",
    desc: "How much bombardment a town building absorbs before its integrity drops, by level. A taller building is a tougher one, so shelling a developed realm costs more volleys than shelling a young one.",
  },
  {
    key: "ARCHER_VS_WALL_CURVE",
    label: "Archer delivery vs a wall",
    yUnit: "× of their power that lands",
    xLabel: "defender's wall integrity",
    xMin: 0,
    xMax: 1,
    xStep: 0.1,
    group: "Siege",
    desc: "What fraction of an ATTACKING archer's fire finds a defender behind cover, read against how whole the wall still is. An intact parapet eats half your arrows; rubble hides nobody. This is delivery, not a bonus — which is why bringing rams first makes your archers better later in the same battle.",
  },
  {
    key: "RESEARCH_OUTPUT_CURVE",
    label: "Scholar output",
    yUnit: "research points / scholar / turn (at 0% tax)",
    xLabel: "Collegium level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "Research",
    desc: "What one scholar produces per turn at each Collegium level. Read it against the research COST curve: prices climb exponentially, so this line does not decide how fast you research so much as how far up that price an age can climb before a single level takes longer than the age has left.",
  },
  {
    key: "PRODUCER_COST_CURVE",
    label: "Producer cost multiplier",
    yUnit: "× base cost",
    xLabel: "target level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "Economy",
    desc: "The Grange, Sawyer's Mill, Mason's Quarry and Deepvein Mine. Worker output is LINEAR, so each level adds the same amount while this multiplies — which means the rate has to stay gentle enough that the top of the ladder is still payable by an empire that actually exists.",
  },
  {
    key: "STORAGE_COST_CURVE",
    label: "Storehouse cost multiplier",
    yUnit: "× base cost",
    xLabel: "target level",
    xMin: 1,
    xMax: 12,
    xStep: 1,
    group: "Economy",
    desc: "The five storehouses, which climb two rungs further than anything else. Judge it against the shelter curve: cost rising faster than capacity is what stops maxing your vaults being a formality, and rising much faster is what makes the last levels cost more than they protect.",
  },
  {
    key: "MARKET_COST_CURVE",
    label: "Market Square cost multiplier",
    yUnit: "× base cost",
    xLabel: "target level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "Market",
    desc: "The only building whose return ACCELERATES — each level raises caravan capacity AND cuts the road time, and throughput is their product. That is why it can carry the steepest rate of the four support buildings and still leave its last level the best-value rung on the ladder.",
  },
  {
    key: "COLLEGIUM_COST_CURVE",
    label: "Collegium cost multiplier",
    yUnit: "× base cost",
    xLabel: "target level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "Research",
    desc: "Gentler than the Market Square's, deliberately: the Collegium's return is FLAT at a fixed number of points per level, and those points are spent against a research price that climbs exponentially. Its late levels fight an exponential from both sides.",
  },
  {
    key: "GUILD_COST_CURVE",
    label: "Shadow Guild cost multiplier",
    yUnit: "× base cost",
    xLabel: "target level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "Covert",
    desc: "Spying is a campaign you choose to run, so it costs more than watching — dearer than the Ranger's Lodge on both the base and this rate. The return is a flat percentage per level, which is why the rate stays soft even so.",
  },
  {
    key: "LODGE_COST_CURVE",
    label: "Ranger's Lodge cost multiplier",
    yUnit: "× base cost",
    xLabel: "target level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "Covert",
    desc: "The gentlest ladder in the game, on purpose. Scouts are the ONLY defence against spies as well as the whole intelligence arm, so these are levels a ruler cannot opt out of — and defence a newcomer cannot afford is defence that does not exist.",
  },
  {
    key: "WARWORKS_COST_CURVE",
    label: "Forge & Armoury cost multiplier",
    yUnit: "× base cost",
    xLabel: "target level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "War",
    desc: "The two war-works share this. Each level adds a flat percentage to what every regular deals (Forge) or endures (Armoury), so the rate is kept soft — a steep tail would price the last levels out of anyone not already winning.",
  },
  {
    key: "WALLS_COST_CURVE",
    label: "Wall cost multiplier",
    yUnit: "× base cost",
    xLabel: "target level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "War",
    desc: "The dearest ladder in the game, and deliberately FLAT in shape — one rate at every rung, so no single level is a cliff you can only stop at. An earlier version pivoted and steepened partway up and made levels 7–9 a wall no plan could smooth.",
  },
  {
    key: "GOLD_SHELTER_CURVE",
    label: "Counting House shelter",
    yUnit: "gold protected",
    xLabel: "Counting House level",
    xMin: 1,
    xMax: 12,
    xStep: 1,
    group: "Economy",
    desc: "Gold safe from a castle assault. Starts higher than the goods stores because gold is the abundant resource — a vault sized like a granary would leave every treasury permanently overflowing. Anything above the line is loose and lootable.",
  },
  {
    key: "BUILDING_COST_CURVE",
    label: "Building cost multiplier",
    yUnit: "× base cost",
    xLabel: "target level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "Economy",
    desc: "The price of the NEXT level of a building, as a multiple of that building's base cost. Level 1 is 1×; each level scales the multiplier up, so raising anything from 8→9 costs far more than 1→2. Steepen this to slow the whole game; flatten it to let empires tower quickly.",
  },
  {
    key: "RESEARCH_COST_CURVE",
    label: "Research cost",
    yUnit: "research points",
    xLabel: "your Nth research overall",
    xMin: 1,
    xMax: 20,
    xStep: 1,
    group: "Research",
    desc: "What your Nth completed research costs — counted across ALL fields, not per field. Your first study is cheap and your twelfth is dear no matter which you pick, so this curve is really a budget on how many things you can ever learn in an age.",
  },
  {
    key: "WORKER_OUTPUT_CURVE",
    label: "Worker output",
    yUnit: "units / turn (at 0% tax)",
    xLabel: "building level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "Economy",
    desc: "How much one fully-staffed production building makes per turn at each level (and, in a research building, the points one scholar generates). Everything downstream — gold via tax, upkeep you can afford, army size — rides on this line.",
  },
  {
    key: "CARAVAN_DELIVERY_CURVE",
    label: "Caravan delivery time",
    yUnit: "turns to reach the Bazaar",
    xLabel: "Market Square level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "Market",
    desc: "How long a caravan spends on the road before its goods hit the Bazaar, by Market Square level. A level-1 market is a slow country road (100 turns); a maxed one is nearly instant. This is the reward for investing in your market — faster trades mean you catch price swings others miss.",
    note: "Engine floors delivery at 10 turns.",
  },
  {
    key: "WALL_HP_CURVE",
    label: "Wall health",
    yUnit: "× defence (fraction)",
    xLabel: "wall level",
    xMin: 0,
    xMax: 10,
    xStep: 1,
    group: "War",
    desc: "The extra defensive strength your walls lend the garrison, as a fraction added on top of raw troop defence. At 0.5 your defenders fight as if half again as strong. Raise this to make turtling viable; lower it to keep offence king.",
  },
  {
    key: "WALLS_SCORE_CURVE",
    label: "Walls ranking score",
    yUnit: "score points",
    xLabel: "wall level",
    xMin: 0,
    xMax: 10,
    xStep: 1,
    group: "Ranking",
    desc: "Ladder points awarded for the height of your walls. It grows with the SQUARE of the level, so the last few levels are worth wildly more than the first — a deliberate nudge to reward heavy fortification on the rankings.",
  },
  {
    key: "STORAGE_SHELTER_CURVE",
    label: "Storage shelter",
    yUnit: "protected capacity",
    xLabel: "store level",
    xMin: 1,
    xMax: 10,
    xStep: 1,
    group: "Economy",
    desc: "How much of each resource is shielded from looters, by storehouse level. Anything you hold ABOVE this line is exposed when you're raided, so this is your safe-to-hoard ceiling — bank or spend the rest before a raid lands.",
  },
];

const CURVE_VALUES: Record<string, Curve> = {
  BUILDING_COST_CURVE: C.BUILDING_COST_CURVE,
  RESEARCH_COST_CURVE: C.RESEARCH_COST_CURVE,
  WORKER_OUTPUT_CURVE: C.WORKER_OUTPUT_CURVE,
  CARAVAN_DELIVERY_CURVE: C.CARAVAN_DELIVERY_CURVE,
  WALL_HP_CURVE: C.WALL_HP_CURVE,
  BUILDING_HP_CURVE: C.BUILDING_HP_CURVE,
  ARCHER_VS_WALL_CURVE: C.ARCHER_VS_WALL_CURVE,
  WALLS_SCORE_CURVE: C.WALLS_SCORE_CURVE,
  STORAGE_SHELTER_CURVE: C.STORAGE_SHELTER_CURVE,
};

export const defaultCurve = (key: string): Curve => CURVE_VALUES[key];

/** Even samples of a curve across its domain — powers the "at a glance" tables. */
export function sampleCurve(curve: Curve, meta: CurveMeta, n = 5): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const x = meta.xMin + ((meta.xMax - meta.xMin) * i) / (n - 1);
    let y: number;
    try {
      y = evalCurve(curve, x);
    } catch {
      y = NaN;
    }
    out.push({ x, y });
  }
  return out;
}

// ── Scalars (the one-off numbers) ────────────────────────────────────────────

export interface ScalarMeta {
  key: string;
  label: string;
  unit: string;
  group: string;
  value: number;
  desc: string;
  /** Editor hints. */
  min?: number;
  max?: number;
  step?: number;
  pct?: boolean; // render/edit as a percentage
}

export const SCALARS: ScalarMeta[] = [
  // Time & pacing
  { key: "TURN_MINUTES", label: "Turn length", unit: "minutes", group: "Time & pacing", value: C.TURN_MINUTES, min: 1, max: 60, step: 1, desc: "Real minutes between ticks. Every resource gain, upkeep charge and action-turn refill happens once per tick, so this sets the whole game's heartbeat." },
  { key: "TURNS_PER_DAY", label: "Turns per day", unit: "turns", group: "Time & pacing", value: C.TURNS_PER_DAY, min: 1, step: 1, desc: "How many ticks make one in-game day. Daily events (population growth, the tax reset) fire on this boundary." },
  { key: "ERA_PEACE_DAYS", label: "Era peace", unit: "days", group: "Time & pacing", value: C.ERA_PEACE_DAYS, min: 0, step: 1, desc: "Opening days of an age during which no one can be attacked — a grace window for everyone to find their feet before the war begins." },
  { key: "NEWCOMER_SHIELD_HOURS", label: "Newcomer shield", unit: "hours", group: "Time & pacing", value: C.NEWCOMER_SHIELD_HOURS, min: 0, step: 1, desc: "How long a freshly-founded empire is protected from attack after joining, so latecomers aren't farmed the moment they arrive." },
  // Economy
  { key: "GOLD_PER_CIVILIAN_AT_FULL_TAX", label: "Gold per civilian at 100% tax", unit: "gold / turn", group: "Economy", value: C.GOLD_PER_CIVILIAN_AT_FULL_TAX, min: 0, step: 5, desc: "Gold each civilian yields per turn if you tax at the maximum. Your actual take scales with your chosen tax rate — higher tax means more gold now but slower growth and rising unrest." },
  { key: "DEFAULT_TAX_RATE", label: "Default tax rate", unit: "%", group: "Economy", value: C.DEFAULT_TAX_RATE, min: 0, max: 1, step: 0.05, pct: true, desc: "The tax rate a new empire starts on before the ruler adjusts it." },
  { key: "FOOD_UPKEEP_PER_PERSON", label: "Food upkeep", unit: "food / person / turn", group: "Economy", value: C.FOOD_UPKEEP_PER_PERSON, min: 0, step: 0.05, desc: "Food eaten per head each turn — civilians and troops alike. Run out and starvation begins, so farms must keep pace with population." },
  { key: "GOLD_COST_SHARE", label: "Building gold share", unit: "×", group: "Economy", value: C.GOLD_COST_SHARE, min: 0, max: 2, step: 0.05, pct: true, desc: "How much gold a building costs relative to its material cost. At 0.5, gold is half the stone/wood bill — a second currency check on top of raw resources." },
  // Mercenaries
  // Priced per ARM. MERC_PRICE_GOLD is no longer read by anything — the engine
  // uses MERC_PRICE_BY_ARM — so a slider for it would tune nothing.
  { key: "MERC_PRICE_FOOTMAN", label: "Sellsword price — footman (light)", unit: "gold", group: "Mercenaries", value: C.MERC_PRICE_BY_ARM.footman, min: 0, step: 50, desc: "Up-front gold for one light hired footman. Sellswords need no training time and no population — instant strength you rent, at a premium, and paid every turn thereafter." },
  { key: "MERC_PRICE_ARCHER", label: "Sellsword price — archer (light)", unit: "gold", group: "Mercenaries", value: C.MERC_PRICE_BY_ARM.archer, min: 0, step: 50, desc: "Up-front gold for one light hired archer." },
  { key: "MERC_PRICE_CAVALRY", label: "Sellsword price — cavalry (light)", unit: "gold", group: "Mercenaries", value: C.MERC_PRICE_BY_ARM.cavalry, min: 0, step: 50, desc: "Up-front gold for one light hired horseman — dearer than the foot arms, as raised cavalry is." },
  { key: "MERC_PRICE_ENGINEER", label: "Sellsword price — engineer", unit: "gold", group: "Mercenaries", value: C.MERC_PRICE_BY_ARM.engineer, min: 0, step: 50, desc: "Hired engine crews. Untiered — they come as they come." },
  { key: "MERC_PRICE_SPY", label: "Sellsword price — spy", unit: "gold", group: "Mercenaries", value: C.MERC_PRICE_BY_ARM.spy, min: 0, step: 50, desc: "Hired knives, capped at a third of your own spies and taken first when a mission is intercepted." },
  { key: "MERC_PRICE_SCOUT", label: "Sellsword price — scout", unit: "gold", group: "Mercenaries", value: C.MERC_PRICE_BY_ARM.scout, min: 0, step: 50, desc: "Hired rangers. They stand the same watch as your own against incoming spies." },
  { key: "MERC_UPKEEP_GOLD_PER_TURN", label: "Mercenary upkeep", unit: "gold / turn", group: "Mercenaries", value: C.MERC_UPKEEP_GOLD_PER_TURN, min: 0, step: 1, desc: "Ongoing wage per mercenary each turn. Rented muscle bleeds your treasury, so it's best for a short, decisive campaign rather than a standing force." },
  // Market
  { key: "CARAVAN_CAPACITY_PER_MARKET_LEVEL", label: "Caravan capacity / market level", unit: "units", group: "Market", value: C.CARAVAN_CAPACITY_PER_MARKET_LEVEL, min: 0, step: 100, desc: "How many goods one caravan can carry per Market Square level — so a taller market ships bigger loads AND (see the delivery curve) ships them faster." },
  { key: "MARKET_FEE", label: "Market sale fee (burned)", unit: "%", group: "Market", value: C.MARKET_FEE, min: 0, max: 1, step: 0.01, pct: true, desc: "Cut skimmed off every completed sale and removed from the economy — a gold sink that stops endless trading from inflating the realm." },
  { key: "MARKET_PRICE_MIN", label: "Min ask price", unit: "gold / unit", group: "Market", value: C.MARKET_PRICE_MIN, min: 1, step: 1, desc: "Floor on the price you may list goods at, so the market can't be crashed to nothing. Keep it ABOVE the Black Market's sell price, or the fence undercuts every caravan." },
  { key: "MARKET_PRICE_MAX", label: "Max ask price", unit: "gold / unit", group: "Market", value: C.MARKET_PRICE_MAX, min: 1, step: 1, desc: "Ceiling on the price you may list goods at, capping speculation. Keep it BELOW the Black Market's buy price, or nobody would ever buy from a player." },
  { key: "MARKET_RECALL_LOSS", label: "Caravan recall loss", unit: "%", group: "Market", value: C.MARKET_RECALL_LOSS, min: 0, max: 1, step: 0.05, pct: true, desc: "Share of a recalled caravan's remaining load lost on the road home. At 0 the Bazaar becomes a raid-proof warehouse you can empty the moment an attack is inbound — the penalty is what makes posting goods a real commitment." },
  // The Black Market (the fence) — a SYSTEM counterparty, instant and unlimited.
  // The two prices must straddle the Bazaar's band: sell < MIN < MAX < buy. That
  // spread is what stops a round trip through the fence from ever turning a
  // profit, so it can't be farmed for free gold or free resources.
  { key: "BLACK_MARKET_SELL_PRICE", label: "Fence pays (sell)", unit: "gold / unit", group: "Market", value: C.BLACK_MARKET.SELL_PRICE, min: 0, step: 1, desc: "Gold per unit the Black Market pays for resources, instantly. The hard FLOOR under every resource — goods are never worthless, but this should stay well below the Bazaar's min ask so players prefer each other." },
  { key: "BLACK_MARKET_BUY_PRICE", label: "Fence charges (buy)", unit: "gold / unit", group: "Market", value: C.BLACK_MARKET.BUY_PRICE, min: 1, step: 1, desc: "Gold per unit the Black Market charges for resources, instantly and without limit. The hard CEILING on prices — gold can always buy bread, but above the Bazaar's max ask so it's the deal of last resort." },
  // Research
  { key: "WARWORKS_BONUS_PER_LEVEL", label: "Forge / Armoury bonus per level", unit: "%", group: "War", value: C.WARWORKS_BONUS_PER_LEVEL, min: 0, max: 1, step: 0.01, pct: true, desc: "What each level of the Forge adds to every regular's attack, and each level of the Armoury to their defence. Reaches half a maxed Art of War or Shieldcraft at level 10, so the buildings support the research rather than replacing it. Sellswords draw on both, exactly as your own troops do." },

  { key: "KINGS_ROADS_TROOP_COST", label: "King's Roads — troop cost cut / level", unit: "%", group: "Research", value: C.KINGS_ROADS.TROOP_COST_PER_LEVEL, min: 0, max: 1, step: 0.01, pct: true, desc: "How much cheaper metalled roads make raising a regular, per research level. A faster muster is a cheaper one — levies reach the drill yard without being fed for a week on the way." },
  { key: "KINGS_ROADS_DELIVERY", label: "King's Roads — road time cut / level", unit: "%", group: "Market", value: C.KINGS_ROADS.DELIVERY_PER_LEVEL, min: 0, max: 1, step: 0.01, pct: true, desc: "How much this research shortens a caravan's road, per level. Compounds with the Market Square's own curve, and the result is always rounded UP to a whole turn — a caravan arrives in 18 turns, never 18.45." },
  { key: "CHARTER_FEE_PER_LEVEL", label: "Merchants' Charter — fee cut / level", unit: "points of fee", group: "Market", value: C.MERCHANTS_CHARTER.FEE_PER_LEVEL, min: 0, max: 1, step: 0.01, pct: true, desc: "How many percentage points this research takes off the Bazaar's cut, per level. Set so mastery reaches exactly zero — the headline of the field is that trade becomes free." },
  { key: "CHARTER_CAPACITY_PER_LEVEL", label: "Merchants' Charter — capacity / level", unit: "%", group: "Market", value: C.MERCHANTS_CHARTER.CAPACITY_PER_LEVEL, min: 0, max: 1, step: 0.01, pct: true, desc: "Extra load every caravan carries, per research level." },
  { key: "CHARTER_RECALL_PER_LEVEL", label: "Merchants' Charter — recall relief / level", unit: "points of loss", group: "Market", value: C.MERCHANTS_CHARTER.RECALL_LOSS_PER_LEVEL, min: 0, max: 1, step: 0.01, pct: true, desc: "How many percentage points this research takes off what a recalled caravan forfeits. Deliberately does NOT reach zero — turning a caravan around must never become a free undo, or the Bazaar is a raid-proof warehouse again." },
  { key: "SCHOLARSHIP_OUTPUT", label: "Scholarship — scholar output / level", unit: "%", group: "Research", value: C.SCHOLARSHIP.OUTPUT_PER_LEVEL, min: 0, max: 1, step: 0.05, pct: true, desc: "What each level adds to every scholar. Reads as the headline of the field and is nearly decorative: research prices climb faster than any flat multiplier can chase, so doubling output buys back fewer levels than the five it cost." },
  { key: "SCHOLARSHIP_SWITCH", label: "Scholarship — switch relief / level", unit: "points of loss", group: "Research", value: C.SCHOLARSHIP.SWITCH_LOSS_PER_LEVEL, min: 0, max: 1, step: 0.01, pct: true, desc: "How many percentage points this research takes off the penalty for re-pointing your scholars. The REAL product of the field: at mastery you may change your mind for nothing, which with sixteen fields competing for a few dozen slots is worth more than speed." },

  { key: "MAX_FIELD_LEVEL", label: "Max research level / field", unit: "levels", group: "Research", value: C.MAX_FIELD_LEVEL, min: 1, step: 1, desc: "How high a single research field can be taken before it's maxed." },
  { key: "EFFECT_PER_LEVEL", label: "Research effect / level", unit: "%", group: "Research", value: C.EFFECT_PER_LEVEL, min: 0, max: 1, step: 0.05, pct: true, desc: "The bonus each research level grants in its field (e.g. +production, +combat). Multiplies out across levels, so a maxed field is a major edge." },
  { key: "RESEARCH_SWITCH_LOSS", label: "Research switch loss", unit: "% of progress", group: "Research", value: C.RESEARCH_SWITCH_LOSS, min: 0, max: 1, step: 0.05, pct: true, desc: "Progress forfeited if you abandon a study mid-way to chase another — the cost of indecision." },
  // Combat
  { key: "MERC_SHARE", label: "Sellswords take this share of damage", unit: "%", group: "Combat", value: C.CASUALTY_SPLIT.MERC_SHARE, min: 0, max: 1, step: 0.05, pct: true, desc: "How much of a blow aimed at an arm lands on its hired blades rather than your own people. The rest ALWAYS reaches your regulars — which is what keeps losing them the worst thing that can happen to you, even while the buffer holds." },
  { key: "BREAK_THRESHOLD", label: "Break threshold", unit: "%", group: "Combat", value: C.BREAK_THRESHOLD, min: 0, max: 1, step: 0.05, pct: true, desc: "The share of an army that must fall before it breaks and the battle ends. Lower it for quick routs; raise it for fights to the last soldier." },
  { key: "LUCK_SWING", label: "Battle luck swing", unit: "± %", group: "Combat", value: C.LUCK_SWING, min: 0, max: 1, step: 0.01, pct: true, desc: "Random ± applied to each side's strength per battle, so an even matchup isn't a foregone conclusion. Higher means more upsets." },
  { key: "MAX_ROUNDS", label: "Max battle rounds", unit: "rounds", group: "Combat", value: C.MAX_ROUNDS, min: 1, step: 1, desc: "Hard cap on combat rounds; if neither side has broken by then the fight is called, protecting both armies from mutual annihilation." },
  { key: "REVENGE_WINDOW_HOURS", label: "Revenge window", unit: "hours", group: "Combat", value: C.REVENGE_WINDOW_HOURS, min: 0, step: 1, desc: "How long after being attacked you may strike back with revenge bonuses — the clock on getting even." },
  { key: "SIEGE_GEAR_LOSS_ON_DEFEAT", label: "Siege gear lost on defeat", unit: "%", group: "Combat", value: C.SIEGE_GEAR_LOSS_ON_DEFEAT, min: 0, max: 1, step: 0.05, pct: true, desc: "Fraction of your siege engines destroyed if your assault fails — the risk that makes committing engines a real decision." },
  { key: "WALL_REPAIR_COST_FACTOR", label: "Wall repair cost factor", unit: "× damage", group: "Combat", value: C.WALL_REPAIR_COST_FACTOR, min: 0, max: 1, step: 0.05, pct: true, desc: "Cost to mend walls, as a fraction of the resources they represent per point of damage — cheaper to repair than to rebuild from scratch." },
  { key: "BUILDING_INTEGRITY_FLOOR", label: "Bombard integrity floor", unit: "%", group: "Combat", value: C.BUILDING_INTEGRITY_FLOOR, min: 0, max: 1, step: 0.05, pct: true, desc: "How far bombardment can knock a building's integrity down — it can be crippled but never smashed below this floor in one campaign." },
  // Growth-adjacent
  { key: "HOUSING_PER_HEARTHSTEAD", label: "Beds per Hearthstead", unit: "beds", group: "Growth", value: C.HOUSING_PER_HEARTHSTEAD, min: 1, step: 1, desc: "Civilians housed per level of Hearthstead. Population can only grow into available beds — build ahead of the growth curve or newcomers are turned away." },
  { key: "TROOPS_PER_MUSTER_HALL", label: "Beds per Muster Hall", unit: "troops", group: "Growth", value: C.TROOPS_PER_MUSTER_HALL, min: 1, step: 1, desc: "Soldiers quartered per level of Muster Hall. Your army can't exceed its barracks, so muster capacity gates military size." },
  // Action turns
  { key: "ATTACK_COST", label: "Attack cost", unit: "action turns", group: "Action turns", value: C.ACTION_TURNS.ATTACK_COST, min: 0, step: 1, desc: "Action turns spent to launch one attack. Action turns are the rate-limit on aggression — you can't march endlessly." },
  // The covert clock (SPY_TURNS) is tuned under Covert, not here. ONE SLIDER
  // PER CONSTANT: two entries reading the same constant means an edit on one
  // tab is silently contradicted by the other, and the emitted diff carries
  // two names for one number. Guarded by catalog.test.ts.
  { key: "TURNS_PER_GAME_TURN", label: "Action turns regained / turn", unit: "action turns", group: "Action turns", value: C.ACTION_TURNS.PER_GAME_TURN, min: 0, step: 1, desc: "Action turns you recover each tick — the refill rate that decides how often you can act. Its covert counterpart, spy turns at half this rate, is tuned under Covert." },
  { key: "TURNS_CAP", label: "Action turn cap", unit: "action turns", group: "Action turns", value: C.ACTION_TURNS.CAP, min: 1, step: 10, desc: "Maximum action turns you can bank, so stepping away doesn't let them pile up without limit." },
  // ── Siege (the rework) ──────────────────────────────────────────────
  { key: "TREBUCHET_POWER", label: "Trebuchet power", unit: "pwr", group: "Siege", value: C.SIEGE_GEAR.trebuchets.power, min: 1, step: 25, desc: "THE ANCHOR of the whole siege model. Every other siege number is fitted around it: 40 crewed trebuchets, a mid-game attacker, ten bombards to level a Citadel. Raise it and every wall in the world falls faster." },
  { key: "TREBUCHET_HEALTH", label: "Trebuchet health", unit: "pwr", group: "Siege", value: C.SIEGE_GEAR.trebuchets.health, min: 1, step: 50, desc: "How much counter-battery fire an engine absorbs before it is wreckage. Half the reason a bombard is a grind rather than a single volley." },
  { key: "COUNTER_ENGINE_HEALTH", label: "Counter-Engine health", unit: "pwr", group: "Siege", value: C.SIEGE_COUNTERS.counter_engine.health, min: 1, step: 50, desc: "Emplaced and sturdy — twice a trebuchet's. This is the other half: a battery that survives long enough to shoot back is what turns ten bombards into twenty." },
  { key: "TREB_VS_WALL", label: "Trebuchet accuracy vs walls", unit: "%", group: "Siege", value: C.EFFECTIVENESS.trebuchets.walls, min: 0, max: 1, step: 0.05, pct: true, desc: "How much of a trebuchet's power finds masonry. Low on purpose — trebuchets are inaccurate, and that inaccuracy is precisely what makes the battering ram (100%) the wall-breaker and leaves room for Siege Accuracy to matter." },
  { key: "SIEGE_DESTROYED_BELOW", label: "Engine wreck threshold", unit: "%", group: "Siege", value: C.SIEGE_DESTROYED_BELOW, min: 0, max: 1, step: 0.05, pct: true, desc: "An engine battered below this share of its health is destroyed outright rather than repairable. Everything above it is worn but mendable." },
  { key: "SIEGE_REPAIR_COST_FACTOR", label: "Engine repair cost", unit: "× build cost", group: "Siege", value: C.SIEGE_REPAIR_COST_FACTOR, min: 0, max: 1, step: 0.05, desc: "Mending an engine against building one anew. At a third, rebuilding costs three times repairing — which is what makes an online defender who mends between volleys genuinely hard to grind down." },
  { key: "SIEGE_SALVAGE_VALUE", label: "Engine resale", unit: "% of cost", group: "Siege", value: C.SIEGE_SALVAGE_VALUE, min: 0, max: 1, step: 0.05, pct: true, desc: "What selling an engine back returns. The pressure valve when the treasury runs dry mid-campaign." },
  { key: "OVERWHELM_RATIO", label: "Counter overwhelm ratio", unit: "×", group: "Siege", value: C.COUNTER_DUEL.OVERWHELM_RATIO, min: 1, step: 0.5, desc: "A counter outgunning the engines it faces by this much stops bothering with the woodwork and starts killing the crews." },
  { key: "GIVE_UP_LOSS", label: "Battery falls silent after losing", unit: "%", group: "Siege", value: C.ARTILLERY_DUEL.GIVE_UP_LOSS, min: 0, max: 1, step: 0.05, pct: true, desc: "A defending battery stops answering only when this much of it is wreckage AND what remains is outgunned. Requiring BOTH is deliberate: it means you cannot reach the give-up state without first being ground down to it, so keeping no counters is never a cheap way to opt out of the duel." },
  { key: "WALL_EDGE_BASE", label: "Wall defence edge", unit: "%", group: "Siege", value: C.WALL_EDGE.BASE, min: 0, max: 2, step: 0.05, pct: true, desc: "What ANY standing wall gives its defenders. Flat by design — a wall is a wall. Wall LEVEL buys health, not a bigger bonus." },
  { key: "TROOPS_PER_TOWER", label: "Troops per siege tower", unit: "troops", group: "Siege", value: C.WALL_EDGE.TROOPS_PER_TOWER, min: 1, step: 10, desc: "A siege tower puts this many men on the parapet in formation, against a ladder's thirty and a grapple's ten — and they arrive fighting a far lesser wall." },
  { key: "SORTIE_SCREEN_ABSORB", label: "Screen absorbs", unit: "× its own strength", group: "Siege", value: C.SORTIE.SCREEN_ABSORB, min: 1, step: 0.5, desc: "How much of a sortie the attacker's footmen and cavalry hold off before anything reaches the engineers and the engines behind them." },
  { key: "RAM_CREW_SIZE", label: "Ram crew", unit: "troops per ram", group: "Siege", value: C.RAM_CREW.TROOPS_PER_RAM, min: 1, step: 5, desc: "Hands needed to push one ram. They are NOT in the battle line until the wall is breached, and boiling oil can scald them where they stand." },
  // ── The mercenary cascade ───────────────────────────────────────────
  { key: "MERC_CAP_RATIO", label: "Sellsword cap", unit: "% of an arm's regulars", group: "Mercenaries", value: C.MERCENARIES.CAP_RATIO, min: 0, max: 1, step: 0.01, pct: true, desc: "Hired blades may not exceed this share of the REGULARS of their own arm — footmen gate merc footmen, scouts gate merc scouts. Enforced continuously, not just at hire: when regulars die the sellswords who can no longer be commanded are paid off and ride away. This is the cascade that makes killing regulars cost an enemy more than the bodies themselves." },
  // ── Civilians ───────────────────────────────────────────────────────
  { key: "CIVILIAN_LOSS_CASTLE", label: "Civilians driven off by a castle attack", unit: "%", group: "Combat", value: C.CIVILIAN_LOSS.CASTLE.max, min: 0, max: 1, step: 0.01, pct: true, desc: "People flee a sacked town. Separate from — and compounding with — the peasant scattering that follows at dawn if the attack left the garrison too thin to reassure anyone." },
  // ── The shadow war ──────────────────────────────────────────────────
  { key: "SPY_TURNS_RATE", label: "Spy turns / game turn", unit: "spy turns", group: "Covert", value: C.SPY_TURNS.PER_GAME_TURN, min: 0, step: 1, desc: "The covert clock, deliberately half the army's rate (144/day against 288). Spies AND scouts both spend from it — every turn spent watching a rival is a turn not spent robbing them." },
  { key: "SPY_TURNS_CEILING", label: "Spy turn ceiling", unit: "spy turns", group: "Covert", value: C.SPY_TURNS.CAP, min: 1, step: 10, desc: "About a day and a half of banking. One deep operation can spend the lot, which is what makes espionage something you plan rather than spam." },
  { key: "INTERCEPT_AT_PARITY", label: "Intercepted at equal strength", unit: "%", group: "Covert", value: C.INTERCEPTION.AT_PARITY, min: 0, max: 1, step: 0.05, pct: true, desc: "The share of agents a watch stops when both sides are equally strong, before the operation's own detection multiplier. THE dial of the shadow war: everything about how many agents to commit hangs off it. Untested against real play." },
  { key: "INTERCEPT_MAX", label: "Interception ceiling", unit: "%", group: "Covert", value: C.INTERCEPTION.MAX, min: 0, max: 1, step: 0.05, pct: true, desc: "Capped below 1 on purpose, so a determined infiltration always lands something and a huge ranger corps can never make you untouchable." },
  { key: "INTERCEPT_REGULAR_SHARE", label: "Caught agent is one of your own", unit: "%", group: "Covert", value: C.INTERCEPTION.REGULAR_SHARE, min: 0, max: 1, step: 0.05, pct: true, desc: "While hired agents remain, this is how often the one lost is a regular. The covert echo of the battle line's mercenary buffer — it is what keeps your veterans alive." },
  { key: "COVERT_CAP_PER_ARM", label: "Spies (or scouts) cap", unit: "% of population", group: "Covert", value: C.COVERT_CAPS.PER_ARM, min: 0, max: 1, step: 0.01, pct: true, desc: "Ceiling on each arm as a share of total population." },
  { key: "COVERT_CAP_COMBINED", label: "Both arms together cap", unit: "% of population", group: "Covert", value: C.COVERT_CAPS.COMBINED, min: 0, max: 1, step: 0.01, pct: true, desc: "You cannot be a realm of nothing but knives and rangers — somebody has to farm." },
  { key: "UNDERMINE_CAP", label: "Undermining cap", unit: "% of wall", group: "Covert", value: C.COVERT_EFFECTS.UNDERMINE_CAP, min: 0, max: 1, step: 0.01, pct: true, desc: "Hard cap on what spies can do to a wall in one mission. Deliberately tiny: if agents could meaningfully breach masonry, the entire siege economy — trebuchets, engineers, repairs, the artillery duel — would be pointless. A nuisance, not a siege." },
  { key: "STEAL_RESEARCH_CAP", label: "Research levels stealable per era", unit: "levels", group: "Covert", value: C.COVERT_EFFECTS.STEAL_RESEARCH_LEVELS_PER_ERA, min: 0, step: 1, desc: "Stolen levels are COPIED — the victim keeps theirs and loses only the secret. Capped so theft can supplement doing the work but never replace it." },
  { key: "COVERT_LUCK", label: "Shadow-war luck swing", unit: "± %", group: "Covert", value: C.COVERT_LUCK_SWING, min: 0, max: 1, step: 0.05, pct: true, desc: "Twice the battle swing — infiltration is a chancier business than a shield wall." },
  { key: "GUILD_BONUS", label: "Shadow Guild / level", unit: "%", group: "Covert", value: C.GUILD_BONUS_PER_LEVEL, min: 0, max: 1, step: 0.05, pct: true, desc: "Additive bonus to your spies' strength per Guild level." },
  { key: "LODGE_BONUS", label: "Rangers Lodge / level", unit: "%", group: "Covert", value: C.LODGE_BONUS_PER_LEVEL, min: 0, max: 1, step: 0.05, pct: true, desc: "Additive bonus to your scouts' strength per Lodge level — both the intelligence they bring back and the watch they stand." },
  // Victory
  { key: "CUMULATIVE_HOURS", label: "Crown hold — cumulative", unit: "hours", group: "Victory", value: C.HOLD_CLOCKS.CUMULATIVE_HOURS, min: 1, step: 1, desc: "Total hours at #1 (need not be consecutive) required to win the age as Grand Overlord." },
  { key: "STREAK_HOURS", label: "Crown hold — unbroken streak", unit: "hours", group: "Victory", value: C.HOLD_CLOCKS.STREAK_HOURS, min: 1, step: 1, desc: "Consecutive hours you must hold #1 without being knocked off — the harder half of the crown condition." },
  { key: "FLOOR_OVERLORD", label: "Overlord army floor", unit: "regulars", group: "Victory", value: C.ARMY_FLOORS.INDIVIDUAL, min: 0, step: 100, desc: "Regular footmen, archers and cavalry needed before a lone empire's victory clock will tick. Regulars only — no mercenaries (gold should not buy a throne) and no engineers. The individual clock also requires having NEVER joined a clan this age." },
  { key: "FLOOR_CLAN", label: "Clan army floor", unit: "regulars", group: "Victory", value: C.ARMY_FLOORS.CLAN, min: 0, step: 1000, desc: "Regulars summed across every member before a clan's victory clock will tick." },
];

// ── Read-only reference tables (shown on both pages; not inline-editable v1) ──

export interface RefTable {
  key: string;
  title: string;
  group: string;
  desc: string;
  headers: string[];
  rows: (string | number)[][];
  /** Many-column tables that should span the full row rather than a grid cell. */
  wide?: boolean;
}

export const REF_TABLES: RefTable[] = [
  {
    key: "training",
    title: "Troop training",
    group: "Units",
    desc: "Resource cost to train one LIGHT unit of each type. Medium units cost ×2 and heavy ×4 (see the tier table). Time and beds apply on top.",
    headers: ["Unit", "Gold", "Wood", "Ore"],
    rows: (["footman", "archer", "cavalry", "siegeEngineer", "spy", "scout"] as const).map((u) => {
      const c = C.TRAINING_COSTS[u];
      return [u, c.gold, c.wood, c.ore];
    }),
  },
  {
    key: "tierpower",
    title: "Tier power & cost",
    group: "Units",
    desc: "Each unit comes in three tiers. A higher tier hits harder AND costs proportionally more to train — a light-vs-heavy trade of quantity against quality.",
    headers: ["Tier", "Combat power", "Cost ×"],
    rows: (["light", "medium", "heavy"] as const).map((t) => [t, C.TIER_SCALE[t], C.TIER_COST_MULT[t]]),
  },
  {
    key: "unitstats",
    title: "Unit base stats (light)",
    group: "Units",
    desc: "Attack and defence of each light unit before race, research, tier and wall modifiers. Footmen anchor the line, archers hit hardest, cavalry balance both, siege engineers exist to crew engines.",
    headers: ["Unit", "Power", "Health"],
    rows: (["footman", "archer", "cavalry", "engineer"] as const).map((u) => [u, C.UNIT_POWER[u].power, C.UNIT_POWER[u].health]),
  },
  {
    key: "siege",
    title: "Siege gear — cost & crew",
    group: "War",
    desc: "Offensive engines used to break walls and buildings. Each needs resources to build and a number of crew (drawn from your army) to operate in the field.",
    headers: ["Engine", "Power", "Health", "Gold", "Wood", "Ore", "Crew"],
    rows: (Object.keys(C.SIEGE_GEAR) as (keyof typeof C.SIEGE_GEAR)[]).map((k) => {
      const g = C.SIEGE_GEAR[k];
      return [k, g.power, g.health, g.gold, g.wood, g.ore, g.crew];
    }),
  },
  {
    key: "counters",
    title: "Defensive counters",
    group: "War",
    desc: "Each counter duels the engine it answers — it does not cancel it, it shoots at it until one of them is wreckage. Needs a Foundry of the listed level, gold, and engineers to crew when you defend.",
    headers: ["Counter", "Answers", "Power", "Health", "Gold", "Crew", "Foundry"],
    rows: (Object.keys(C.SIEGE_COUNTERS) as (keyof typeof C.SIEGE_COUNTERS)[]).map((k) => {
      const c = C.SIEGE_COUNTERS[k];
      return [c.name, c.counters, c.power, c.health, c.gold, c.crew, c.foundryLevel];
    }),
  },
  {
    key: "xp",
    title: "Battle experience bands",
    group: "Combat",
    desc: "Experience earned by the attacker depends on how fair the fight was — picking on the much weaker earns nothing, while beating a stronger foe pays well. Defenders always earn something for holding.",
    headers: ["Situation", "XP"],
    rows: [
      ["Per enemy REGULAR killed", `+${C.XP.PER_REGULAR_KILLED}`],
      ["Per civilian driven off", `+${C.XP.PER_CIVILIAN_DISPLACED}`],
      ["Per mercenary killed", `${C.XP.PER_MERC_KILLED} \u2014 they were never anybody\u2019s people`],
      ["Ceiling per battle", `+${C.XP.MAX_PER_BATTLE}`],
      ["Attack refused above", `\u00d7${C.XP.REFUSAL_RATIO} score ratio`],
      ["Defender (always)", `+${C.XP.DEFENDER_GAIN}`],
    ],
  },
  {
    key: "loot",
    title: "Loot",
    group: "Combat",
    desc: "What a successful raid carries home. You take a fraction of the loser's exposed resources, boosted against big targets and floored against small ones so bullying the weak pays little.",
    headers: ["Setting", "Value"],
    rows: [
      ["Raid, won", `${Math.round(C.LOOT.RAID_WIN.min * 100)}\u2013${Math.round(C.LOOT.RAID_WIN.max * 100)}% of exposed GOODS`],
      ["Castle, won", `${Math.round(C.LOOT.CASTLE_WIN.min * 100)}\u2013${Math.round(C.LOOT.CASTLE_WIN.max * 100)}% of unvaulted GOLD`],
      ["Either, yielded", `${Math.round(C.LOOT.RAID_YIELD.min * 100)}\u2013${Math.round(C.LOOT.RAID_YIELD.max * 100)}%`],
      ["Big-target bonus (≥150%)", `×${C.LOOT.BIG_TARGET_BONUS}`],
      ["Small-target penalty (≤50%)", `×${C.LOOT.SMALL_TARGET_PENALTY}`],
    ],
  },
  {
    key: "hall",
    title: "Clan Hall — cap & shelter",
    group: "Clans",
    desc: "The Clan Hall's level sets how many members a clan may hold and how much of a member's tax penalty the clan absorbs — bigger halls mean bigger, better-sheltered clans.",
    headers: ["Hall level", "Member cap", "Tax penalty felt"],
    rows: C.HALL.map((h) => [h.level, h.memberCap, `${Math.round(h.taxPenaltyFelt * 100)}%`]),
  },
  {
    key: "war",
    title: "Clan war",
    group: "Clans",
    desc: "Rules for a declared clan war: both sides hit harder, victory needs a lead in net regular kills, the loser pays tribute, and a truce follows so wars don't loop forever.",
    headers: ["Setting", "Value"],
    rows: [
      ["Damage bonus (both ways)", `+${Math.round(C.WAR.DAMAGE_BONUS * 100)}%`],
      ["Net kills to win", C.WAR.NET_REGULAR_KILLS_TO_WIN],
      ["Tribute rate", `${Math.round(C.WAR.TRIBUTE_RATE * 100)}%`],
      ["Truce", `${C.WAR.TRUCE_HOURS}h`],
    ],
  },
  {
    key: "races",
    title: "Race modifiers",
    group: "Races",
    wide: true,
    desc: "Each race multiplies certain production and combat stats (1.00 is neutral). A number above 1 is a strength, below 1 a weakness — pick a race whose bonuses match how you like to play.",
    headers: ["Race", "Food", "Wood", "Stone", "Ore", "Footman", "Archer", "Cavalry", "Siege", "Walls", "Spy", "Scout"],
    rows: (Object.keys(C.RACES) as (keyof typeof C.RACES)[]).map((r) => {
      const m = C.RACES[r];
      return [
        C.RACE_NAMES[r],
        m.production.food, m.production.wood, m.production.stone, m.production.ore,
        m.units.footman, m.units.archer, m.units.cavalry,
        m.siege, m.walls, m.spy, m.scout,
      ];
    }),
  },
];

/** Group order for rendering within a category. */
export const GROUP_ORDER = [
  "Growth",
  "Economy",
  "Market",
  "Mercenaries",
  "Research",
  "Units",
  "War",
  "Combat",
  "Siege",
  "Covert",
  "Action turns",
  "Victory",
  "Ranking",
  "Clans",
  "Races",
  "Time & pacing",
];

// ── Category slicing helpers (used by both pages) ────────────────────────────

export const curvesInCategory = (cat: string): CurveMeta[] => CURVES.filter((c) => categoryOf(c.group) === cat);
export const scalarsInCategory = (cat: string): ScalarMeta[] => SCALARS.filter((s) => categoryOf(s.group) === cat);
export const tablesInCategory = (cat: string): RefTable[] => REF_TABLES.filter((t) => categoryOf(t.group) === cat);

/** Groups present in a category, in GROUP_ORDER. */
export const groupsInCategory = (cat: string): string[] => GROUP_ORDER.filter((g) => categoryOf(g) === cat);

export const fmtNum = (n: number) => n.toLocaleString("en-US");
