// Espionage — spies & scouts (spec/espionage.md). All tunable.

export interface SpyOp {
  level: number; // Tradecraft level required
  id: string;
  name: string;
  desc: string;
}

export const SPY_OPS: SpyOp[] = [
  { level: 1, id: "survey_coffers", name: "Survey the Coffers", desc: "Exact gold + resources, what sits outside storage" },
  { level: 2, id: "map_defences", name: "Map the Defences", desc: "Walls, War Foundry, army composition, stamina" },
  { level: 3, id: "sabotage_engines", name: "Sabotage the Engines", desc: "Destroy siege gear: up to spiesSent / 2 pieces" },
  { level: 4, id: "torch_stores", name: "Torch the Stores", desc: "Burn unstored resources: 1% per spy (cap 25%)" },
  { level: 5, id: "incite_unrest", name: "Incite Unrest", desc: "24h: tax −25%, production −25%, pop growth halted" },
];

export const SABOTAGE_PER_SPY = 0.5; // gear destroyed = spiesSent / 2
export const TORCH_PCT_PER_SPY = 0.01;
export const TORCH_CAP = 0.25;
export const UNREST = { HOURS: 24, TAX_PENALTY: 0.25, PRODUCTION_PENALTY: 0.25 };

/** Mission effect × (1 + 0.1 × Shadow Guild level). */
export const GUILD_EFFECT_PER_LEVEL = 0.1;

/** ±20% luck on mission effect and catch roll (twice battle variance). */
export const SPY_LUCK_SWING = 0.2;

/** catchableOpLevel = ceil(lodgeLevel / 2). */
export function catchableOpLevel(lodgeLevel: number): number {
  return Math.ceil(lodgeLevel / 2);
}

export const CATCH = {
  PER_SPY_PER_LODGE_LEVEL: 0.005, // spiesSent × 0.5% × lodgeLevel
  MAX: 0.9,
  PATHFINDING_PER_LEVEL: 0.2, // × (1 + 0.2 × pathfindingLevel)
};

/** Scout recon: fuzzy army size ±20%; Pathfinding tightens toward exact. */
export const RECON_FUZZ = 0.2;
