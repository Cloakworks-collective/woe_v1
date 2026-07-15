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

/** rpCost(level) = 2,000 × 5^(level−1). */
export const RP_COST_BASE = 2000;
export const RP_COST_FACTOR = 5;

export function rpCost(level: number): number {
  return RP_COST_BASE * RP_COST_FACTOR ** (level - 1);
}

/** Field level N requires Collegium level ≥ 2N − 1. */
export function collegiumRequired(fieldLevel: number): number {
  return 2 * fieldLevel - 1;
}
