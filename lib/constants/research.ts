// Research — The Collegium (spec/research.md). 10 fields × 5 levels.

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
  | "statecraft";

export interface ResearchFieldMeta {
  id: ResearchField;
  name: string;
  desc: string;
  /** Counts toward ranking score? (victory.md — 7 of 10 fields do.) */
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
  { id: "siegecraft", name: "Siegecraft", desc: "Siege weapon damage, up to +100%", ranked: false },
  { id: "statecraft", name: "Statecraft", desc: "Multiplies post-tax producer output, ×2 at level 5", ranked: true },
];

export const MAX_FIELD_LEVEL = 5;

/** Each level = +20% of the field's max effect. */
export const EFFECT_PER_LEVEL = 0.2;

/**
 * Research cost is GLOBAL and progressive (spec/research.md): the price of a
 * level depends on how many levels you've already earned across ALL fields, not
 * on which field it is. Your Nth research level overall costs
 * `RESEARCH_ORDINAL_BASE × RESEARCH_ORDINAL_GROWTH^(N−1)` — so each level makes
 * the next one dearer, and the ORDER you research in is the strategy.
 * (Tunable placeholders.)
 */
export const RESEARCH_ORDINAL_BASE = 2000;
export const RESEARCH_ORDINAL_GROWTH = 1.3;

/** RP to complete your `order`-th research level overall (1-based). */
export function researchOrdinalCost(order: number): number {
  return Math.round(RESEARCH_ORDINAL_BASE * RESEARCH_ORDINAL_GROWTH ** Math.max(0, order - 1));
}

/** Fraction of the current field's banked progress toward its next level that is
 *  LOST when you switch the scholars to a different field — the cost of a
 *  wandering research programme. 0.5 = you keep half (spec/research.md). */
export const RESEARCH_SWITCH_LOSS = 0.5;
