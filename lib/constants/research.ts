// Research — The Collegium (spec/empire.md). 16 fields × 5 levels.
// The field LIST (structure + display text + ranked flags) lives here; every
// number lives in balance.ts — THE tuning file.

import { RESEARCH_COST_CURVE } from "./balance";
import { evalCurve } from "./curves";

export type ResearchField =
  | "crop_rotation"
  | "forestry"
  | "masonry"
  | "deep_smelting"
  | "tradecraft"
  | "pathfinding"
  | "art_of_war"
  | "shieldcraft"
  | "siegecraft"
  | "medicine"
  | "free_companies"
  | "statecraft"
  | "granarycraft"
  | "kings_roads"
  | "merchants_charter"
  | "scholarship";

export interface ResearchFieldMeta {
  id: ResearchField;
  name: string;
  desc: string;
  /** Counts toward ranking score? (victory.md — the martial and economic
   *  fields do; the covert and trade ones deliberately do not.) */
  ranked: boolean;
}

export const RESEARCH_FIELDS: ResearchFieldMeta[] = [
  { id: "crop_rotation", name: "Crop Rotation", desc: "Farmer output, up to +100%", ranked: true },
  { id: "forestry", name: "Forestry", desc: "Lumberjack output, up to +100%", ranked: true },
  { id: "masonry", name: "Masonry", desc: "Quarryman output, up to +100%", ranked: true },
  { id: "deep_smelting", name: "Deep Smelting", desc: "Miner output, up to +100%", ranked: true },
  { id: "tradecraft", name: "Tradecraft", desc: "Unlocks spy ops; +20%/lvl mission effect", ranked: false },
  { id: "pathfinding", name: "Pathfinding", desc: "Scout recon & catch chance, +20%/lvl", ranked: false },
  { id: "art_of_war", name: "The Art of War", desc: "Attack multiplier, all troops, up to +100%", ranked: true },
  { id: "shieldcraft", name: "Shieldcraft", desc: "Defence multiplier, all troops, up to +100%", ranked: true },
  // ONE siege field, not two. Siegecraft and Siege Accuracy were split because
  // they act through different halves of the damage model — one adds to the
  // bonus pool, the other moves a delivery gate — but that is an implementation
  // detail, not a decision a player was ever making. Nobody built engines and
  // then chose NOT to aim them: the two were always bought together, so they
  // were two prices for one idea. Merged, Siegecraft does both.
  { id: "siegecraft", name: "Siegecraft", desc: "Siege engine power up to +100%, AND trebuchet accuracy: 30%→60% against walls, 20%→50% against buildings, sharper counter-battery", ranked: true },
  { id: "medicine", name: "Medicine", desc: "Field surgeons: a share of the sellswords who fall defending you are pulled off the field alive, so the screen in front of your regulars lasts longer", ranked: true },
  { id: "free_companies", name: "Free Companies", desc: "Sellsword contracts, up to −50% on the price of hiring", ranked: false },
  { id: "statecraft", name: "Statecraft", desc: "Multiplies your tax income, ×2 at level 5 — the treasury, not the workshops", ranked: true },
  // Deliberately UNRANKED. It publishes nothing about your army and everything
  // about how much you are sitting on — a raider who could read it off the
  // ladder would know exactly who is worth the march.
  { id: "granarycraft", name: "Granarycraft", desc: "Deeper vaults: +5%/lvl protected capacity in all five storehouses, up to +25%", ranked: false },
  // The two trade fields. Unranked: they publish how efficiently you trade and
  // how cheaply you muster, and neither is martial strength.
  { id: "kings_roads", name: "The King's Roads", desc: "Metalled roads: −5%/lvl on troop training cost AND on caravan road time, up to −25% each", ranked: false },
  { id: "merchants_charter", name: "The Merchants' Charter", desc: "Bazaar fee 20% → 0% at mastery, +5%/lvl caravan capacity, and the recall forfeit falls 50% → 25%", ranked: false },
  { id: "scholarship", name: "Scholarship", desc: "+20%/lvl to every scholar, and the penalty for re-pointing them falls 50% → 0%", ranked: false },
];

/**
 * The branches of the tree, and which fields hang from each.
 *
 * Lives HERE, beside RESEARCH_FIELDS, because it used to live in the research
 * page as a hand-written list of ids. Two lists of the same thing in different
 * files drift, and this one did: six fields — Siege Accuracy (since merged into
 * Siegecraft), free_companies, and the four added in the 2026-08 pass — existed
 * in the game, cost points, and could be researched by the Steward, but never
 * appeared on the page a player researches from. They were invisible.
 *
 * `research.test.ts` asserts every field appears in exactly one discipline, so
 * adding a field without placing it now fails the suite instead of vanishing.
 */
export interface ResearchDiscipline {
  key: string;
  name: string;
  blurb: string;
  fields: ResearchField[];
}

export const RESEARCH_DISCIPLINES: ResearchDiscipline[] = [
  {
    key: "economy",
    name: "⚒ Economy",
    blurb: "Feed, enrich, and grow the realm",
    fields: ["crop_rotation", "forestry", "masonry", "deep_smelting", "statecraft", "granarycraft", "scholarship"],
  },
  {
    key: "trade",
    name: "🐎 Trade & Roads",
    blurb: "Move goods further, and levies faster",
    fields: ["merchants_charter", "kings_roads"],
  },
  {
    key: "war",
    name: "⚔ War",
    blurb: "Sharpen the army for battle",
    fields: ["art_of_war", "shieldcraft", "siegecraft", "medicine", "free_companies"],
  },
  {
    key: "shadow",
    name: "🗡 Shadow",
    blurb: "Spies & scouts — power, not prestige",
    fields: ["tradecraft", "pathfinding"],
  },
];

export {
  MAX_FIELD_LEVEL,
  EFFECT_PER_LEVEL,
  RESEARCH_EFFECT_PER_LEVEL,
  RESEARCH_COST_CURVE,
  RESEARCH_SWITCH_LOSS,
} from "./balance";

/** RP to complete your `order`-th research level overall (1-based) —
 *  RESEARCH_COST_CURVE evaluated at x = order, rounded to whole points. */
export function researchOrdinalCost(order: number): number {
  return Math.round(evalCurve(RESEARCH_COST_CURVE, Math.max(1, order)));
}
