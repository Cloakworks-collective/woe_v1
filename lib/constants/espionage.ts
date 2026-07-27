// Espionage — spies & scouts (spec/espionage.md). The op LIST (structure +
// display text) lives here; every number lives in balance.ts — THE tuning file.

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

export {
  SABOTAGE_PER_SPY,
  TORCH_PCT_PER_SPY,
  TORCH_CAP,
  UNREST,
  GUILD_EFFECT_PER_LEVEL,
  SPY_LUCK_SWING,
  CATCH,
  RECON_FUZZ,
} from "./balance";

/** catchableOpLevel = ceil(lodgeLevel / 2). */
export function catchableOpLevel(lodgeLevel: number): number {
  return Math.ceil(lodgeLevel / 2);
}
