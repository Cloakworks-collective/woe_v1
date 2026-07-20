// Race modifiers — ported from Simon Taylor's 2006 balance workbook (races2.xls,
// "Proposed" sheet), with deliberate divergences:
//  - resource penalties clamped at ~0.4–0.5× (his dwarf wood 0.3× / elf ore 0.4×
//    assume a liquid market we can't guarantee at launch)
//  - no starting-buildings perk; humans get flat +25% production instead
//  - gnolls keep spy/scout 1.2 (his spy race was humans; ours coexist — humans
//    spymaster at 1.25, gnolls counter-intel via scout)
//  - his "Health" bonus is folded into global `defence` (±5%)
//  - his "Defences" bonus maps to `walls` (home fortification, applied to the
//    wall bonus in combat), NOT global defence
// Values are NOT sum-zero; balance is judged by equal-cost army power, as in
// the original workbook.

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

export const RACE_NAMES: Record<Race, string> = {
  human: "Humans",
  elf: "Elves",
  orc: "Orcs",
  troll: "Trolls",
  dwarf: "Dwarves",
  gnoll: "Gnolls",
};
