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
    groups: ["Units", "War", "Combat", "Action turns"],
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
    key: "GROWTH_CURVE",
    label: "Population growth",
    yUnit: "settlers / day",
    xLabel: "total civilian building levels",
    xMin: 0,
    xMax: 130,
    xStep: 5,
    group: "Growth",
    desc: "New settlers who arrive each day, read off the sum of all your civilian building levels. A raw village trickles; a fully-developed realm pours in newcomers. This is the figure BEFORE the wall-damage penalty and BEFORE the housing cap — if you lack beds, the surplus is simply turned away.",
    note: "Engine floors the result at 1 settler/day.",
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
    key: "WALL_BONUS_CURVE",
    label: "Wall defence bonus",
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
  GROWTH_CURVE: C.GROWTH_CURVE,
  BUILDING_COST_CURVE: C.BUILDING_COST_CURVE,
  RESEARCH_COST_CURVE: C.RESEARCH_COST_CURVE,
  WORKER_OUTPUT_CURVE: C.WORKER_OUTPUT_CURVE,
  CARAVAN_DELIVERY_CURVE: C.CARAVAN_DELIVERY_CURVE,
  WALL_BONUS_CURVE: C.WALL_BONUS_CURVE,
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
  { key: "GOLD_PER_CIVILIAN_AT_FULL_TAX", label: "Gold per civilian at 100% tax", unit: "gold / turn", group: "Economy", value: C.GOLD_PER_CIVILIAN_AT_FULL_TAX, min: 0, step: 0.05, desc: "Gold each civilian yields per turn if you tax at the maximum. Your actual take scales with your chosen tax rate — higher tax means more gold now but slower growth and rising unrest." },
  { key: "DEFAULT_TAX_RATE", label: "Default tax rate", unit: "%", group: "Economy", value: C.DEFAULT_TAX_RATE, min: 0, max: 1, step: 0.05, pct: true, desc: "The tax rate a new empire starts on before the ruler adjusts it." },
  { key: "FOOD_UPKEEP_PER_PERSON", label: "Food upkeep", unit: "food / person / turn", group: "Economy", value: C.FOOD_UPKEEP_PER_PERSON, min: 0, step: 0.05, desc: "Food eaten per head each turn — civilians and troops alike. Run out and starvation begins, so farms must keep pace with population." },
  { key: "GOLD_COST_SHARE", label: "Building gold share", unit: "×", group: "Economy", value: C.GOLD_COST_SHARE, min: 0, max: 2, step: 0.05, pct: true, desc: "How much gold a building costs relative to its material cost. At 0.5, gold is half the stone/wood bill — a second currency check on top of raw resources." },
  // Mercenaries
  { key: "MERC_PRICE_GOLD", label: "Mercenary price (light)", unit: "gold", group: "Mercenaries", value: C.MERC_PRICE_GOLD, min: 0, step: 10, desc: "Up-front gold to hire one light mercenary. Mercenaries need no training time or beds — instant strength you rent, at a premium." },
  { key: "MERC_CAP_RATIO", label: "Mercenary cap", unit: "% of regulars", group: "Mercenaries", value: C.MERC_CAP_RATIO, min: 0, max: 1, step: 0.05, pct: true, desc: "Ceiling on hired troops as a share of your own trained regulars — so gold alone can't buy an army; you must raise real soldiers first." },
  { key: "MERC_UPKEEP_GOLD_PER_TURN", label: "Mercenary upkeep", unit: "gold / turn", group: "Mercenaries", value: C.MERC_UPKEEP_GOLD_PER_TURN, min: 0, step: 1, desc: "Ongoing wage per mercenary each turn. Rented muscle bleeds your treasury, so it's best for a short, decisive campaign rather than a standing force." },
  // Market
  { key: "CARAVAN_CAPACITY_PER_MARKET_LEVEL", label: "Caravan capacity / market level", unit: "units", group: "Market", value: C.CARAVAN_CAPACITY_PER_MARKET_LEVEL, min: 0, step: 100, desc: "How many goods one caravan can carry per Market Square level — so a taller market ships bigger loads AND (see the delivery curve) ships them faster." },
  { key: "MARKET_FEE", label: "Market sale fee (burned)", unit: "%", group: "Market", value: C.MARKET_FEE, min: 0, max: 1, step: 0.01, pct: true, desc: "Cut skimmed off every completed sale and removed from the economy — a gold sink that stops endless trading from inflating the realm." },
  { key: "MARKET_PRICE_MIN", label: "Min ask price", unit: "gold / unit", group: "Market", value: C.MARKET_PRICE_MIN, min: 1, step: 1, desc: "Floor on the price you may list goods at, so the market can't be crashed to nothing." },
  { key: "MARKET_PRICE_MAX", label: "Max ask price", unit: "gold / unit", group: "Market", value: C.MARKET_PRICE_MAX, min: 1, step: 1, desc: "Ceiling on the price you may list goods at, capping speculation." },
  // Research
  { key: "MAX_FIELD_LEVEL", label: "Max research level / field", unit: "levels", group: "Research", value: C.MAX_FIELD_LEVEL, min: 1, step: 1, desc: "How high a single research field can be taken before it's maxed." },
  { key: "EFFECT_PER_LEVEL", label: "Research effect / level", unit: "%", group: "Research", value: C.EFFECT_PER_LEVEL, min: 0, max: 1, step: 0.05, pct: true, desc: "The bonus each research level grants in its field (e.g. +production, +combat). Multiplies out across levels, so a maxed field is a major edge." },
  { key: "RESEARCH_SWITCH_LOSS", label: "Research switch loss", unit: "% of progress", group: "Research", value: C.RESEARCH_SWITCH_LOSS, min: 0, max: 1, step: 0.05, pct: true, desc: "Progress forfeited if you abandon a study mid-way to chase another — the cost of indecision." },
  // Combat
  { key: "K_LETHALITY", label: "Lethality k", unit: "÷ (k × defence)", group: "Combat", value: C.K_LETHALITY, min: 0.1, step: 0.1, desc: "The master dial on how deadly battles are. Casualties scale as attack ÷ (k × defence); a bigger k means fewer deaths per round and longer, grindier fights." },
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
  { key: "WALL_DAMAGE_POP_PENALTY", label: "Rubbled-wall growth penalty", unit: "% max", group: "Growth", value: C.WALL_DAMAGE_POP_PENALTY, min: 0, max: 1, step: 0.05, pct: true, desc: "How much daily settler intake is choked when your walls lie in rubble — a sacked city struggles to attract newcomers until it rebuilds." },
  // Action turns
  { key: "ATTACK_COST", label: "Attack cost", unit: "action turns", group: "Action turns", value: C.ACTION_TURNS.ATTACK_COST, min: 0, step: 1, desc: "Action turns spent to launch one attack. Action turns are the rate-limit on aggression — you can't march endlessly." },
  { key: "SPY_MISSION_COST", label: "Spy mission cost", unit: "action turns", group: "Action turns", value: C.ACTION_TURNS.SPY_MISSION_COST, min: 0, step: 1, desc: "Action turns spent to run one espionage mission." },
  { key: "SCOUT_RECON_COST", label: "Scout recon cost", unit: "action turns", group: "Action turns", value: C.ACTION_TURNS.SCOUT_RECON_COST, min: 0, step: 1, desc: "Action turns spent to scout a target's defences before committing." },
  { key: "TURNS_PER_GAME_TURN", label: "Action turns regained / turn", unit: "action turns", group: "Action turns", value: C.ACTION_TURNS.PER_GAME_TURN, min: 0, step: 1, desc: "Action turns you recover each tick — the refill rate that decides how often you can act." },
  { key: "TURNS_CAP", label: "Action turn cap", unit: "action turns", group: "Action turns", value: C.ACTION_TURNS.CAP, min: 1, step: 10, desc: "Maximum action turns you can bank, so stepping away doesn't let them pile up without limit." },
  // Victory
  { key: "CUMULATIVE_HOURS", label: "Crown hold — cumulative", unit: "hours", group: "Victory", value: C.HOLD_CLOCKS.CUMULATIVE_HOURS, min: 1, step: 1, desc: "Total hours at #1 (need not be consecutive) required to win the age as Grand Overlord." },
  { key: "STREAK_HOURS", label: "Crown hold — unbroken streak", unit: "hours", group: "Victory", value: C.HOLD_CLOCKS.STREAK_HOURS, min: 1, step: 1, desc: "Consecutive hours you must hold #1 without being knocked off — the harder half of the crown condition." },
  { key: "FLOOR_OVERLORD", label: "Overlord population floor", unit: "population", group: "Victory", value: C.POPULATION_FLOORS.GRAND_OVERLORD, min: 0, step: 1000, desc: "Minimum population to be eligible for the Grand Overlord crown — a tiny #1 can't sneak a win." },
  { key: "FLOOR_CLAN", label: "Clan population floor", unit: "population", group: "Victory", value: C.POPULATION_FLOORS.CLAN, min: 0, step: 10000, desc: "Minimum combined population for a clan to be eligible for the clan victory." },
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
    rows: (["light", "medium", "heavy"] as const).map((t) => [t, C.TIER_POWER[t], C.TIER_COST_MULT[t]]),
  },
  {
    key: "unitstats",
    title: "Unit base stats (light)",
    group: "Units",
    desc: "Attack and defence of each light unit before race, research, tier and wall modifiers. Footmen anchor the line, archers hit hardest, cavalry balance both, siege engineers exist to crew engines.",
    headers: ["Unit", "Attack", "Defence"],
    rows: (["footman", "archer", "cavalry", "siegeEngineer"] as const).map((u) => [u, C.UNIT_STATS[u].attack, C.UNIT_STATS[u].defence]),
  },
  {
    key: "siege",
    title: "Siege gear — cost & crew",
    group: "War",
    desc: "Offensive engines used to break walls and buildings. Each needs resources to build and a number of crew (drawn from your army) to operate in the field.",
    headers: ["Engine", "Gold", "Wood", "Stone", "Ore", "Crew"],
    rows: (Object.keys(C.SIEGE_GEAR) as (keyof typeof C.SIEGE_GEAR)[]).map((k) => {
      const g = C.SIEGE_GEAR[k];
      return [k, g.gold, g.wood, g.stone, g.ore, g.crew];
    }),
  },
  {
    key: "counters",
    title: "Defensive counters",
    group: "War",
    desc: "Each defensive counter neutralises one kind of attacking engine. It needs a Foundry of the listed level to build, plus gold and crew — the defender's answer to a siege.",
    headers: ["Counter", "Cancels", "Gold", "Crew", "Foundry"],
    rows: (Object.keys(C.SIEGE_COUNTERS) as (keyof typeof C.SIEGE_COUNTERS)[]).map((k) => {
      const c = C.SIEGE_COUNTERS[k];
      return [c.name, c.counters, c.gold, c.crew, c.foundryLevel];
    }),
  },
  {
    key: "xp",
    title: "Battle experience bands",
    group: "Combat",
    desc: "Experience earned by the attacker depends on how fair the fight was — picking on the much weaker earns nothing, while beating a stronger foe pays well. Defenders always earn something for holding.",
    headers: ["Situation", "XP"],
    rows: [
      ["≥75% stronger", "attack refused"],
      ["Bold (20–75% stronger)", `+${C.XP.BOLD.gain}`],
      ["Fair (±20%)", `+${C.XP.FAIR.gain}`],
      ["Weak (20–50% down)", `+${C.XP.WEAK.gain}`],
      ["Bully (>50% down)", C.XP.BULLY_GAIN],
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
      ["Fraction taken", `${Math.round(C.LOOT.FRACTION * 100)}%`],
      ["Big-target bonus (≥150%)", `×${C.LOOT.BIG_TARGET_BONUS}`],
      ["Small-target floor (≤50%)", `×${C.LOOT.SMALL_TARGET_FLOOR}`],
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
