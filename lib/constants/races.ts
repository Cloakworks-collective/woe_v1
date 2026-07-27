// Races — the type and display names live here; the MODIFIER MATRIX lives in
// balance.ts — THE tuning file — ported from Simon Taylor's 2006 balance
// workbook (races2.xls, "Proposed" sheet), with deliberate divergences:
//  - resource penalties clamped at ~0.4–0.5× (his dwarf wood 0.3× / elf ore 0.4×
//    assume a liquid market we can't guarantee at launch)
//  - no starting-buildings perk; humans get flat +25% production instead
//  - gnolls keep spy/scout 1.2 (his spy race was humans; ours coexist — humans
//    spymaster at 1.25, gnolls counter-intel via scout)
//  - his "Health" bonus is folded into global `defence` (±5%)
//  - his "Defences" bonus maps to `walls` (home fortification only)
// Values are NOT sum-zero; balance is judged by equal-cost army power.

export type Race = "human" | "elf" | "orc" | "troll" | "dwarf" | "gnoll";

export interface RaceModifiers {
  production: { food: number; wood: number; stone: number; ore: number };
  attack: number; // global, all troops
  defence: number; // global, all troops (carries the old "health" ±5%)
  units: { footman: number; archer: number; cavalry: number }; // per-type atk & def
  siege: number; // siege damage dealt
  walls: number; // home wall bonus factor (fortification quality)
  spy: number; // mission effectiveness
  scout: number; // recon + catch chance
  mercCost: number; // mercenary price factor
}

export { RACES } from "./balance";

export const RACE_NAMES: Record<Race, string> = {
  human: "Humans",
  elf: "Elves",
  orc: "Orcs",
  troll: "Trolls",
  dwarf: "Dwarves",
  gnoll: "Gnolls",
};
