// Race modifiers — sum-zero balanced in ±10/20% steps (spec/architecture.md).
// Humans are the flat-1.0 baseline. Research speed is identical for all races.

export type Race = "human" | "elf" | "orc" | "troll" | "dwarf" | "gnoll";

export interface RaceModifiers {
  production: { food: number; wood: number; stone: number; ore: number };
  attack: number; // global, all troops
  defence: number; // global, all troops
  units: { footman: number; archer: number; cavalry: number }; // per-type atk & def
  siege: number; // siege damage dealt
  spy: number; // mission effectiveness
  scout: number; // recon + catch chance
  mercCost: number; // mercenary price factor
}

export const RACES: Record<Race, RaceModifiers> = {
  human: {
    production: { food: 1.0, wood: 1.0, stone: 1.0, ore: 1.0 },
    attack: 1.0,
    defence: 1.0,
    units: { footman: 1.0, archer: 1.0, cavalry: 1.0 },
    siege: 1.0,
    spy: 1.0,
    scout: 1.0,
    mercCost: 1.0,
  },
  elf: {
    production: { food: 1.0, wood: 1.2, stone: 1.0, ore: 1.0 },
    attack: 1.0,
    defence: 1.0,
    units: { footman: 1.0, archer: 1.2, cavalry: 0.8 },
    siege: 0.8,
    spy: 1.0,
    scout: 1.0,
    mercCost: 1.0,
  },
  orc: {
    production: { food: 1.0, wood: 0.9, stone: 0.9, ore: 1.1 },
    attack: 1.1,
    defence: 1.0,
    units: { footman: 1.0, archer: 1.0, cavalry: 1.2 },
    siege: 0.9,
    spy: 0.9,
    scout: 1.0,
    mercCost: 1.0,
  },
  troll: {
    production: { food: 1.0, wood: 0.9, stone: 1.2, ore: 0.9 },
    attack: 1.0,
    defence: 1.0,
    units: { footman: 1.1, archer: 0.9, cavalry: 0.8 },
    siege: 1.2,
    spy: 1.0,
    scout: 1.0,
    mercCost: 1.0,
  },
  dwarf: {
    production: { food: 0.8, wood: 0.8, stone: 1.0, ore: 1.2 },
    attack: 0.9,
    defence: 1.1,
    units: { footman: 1.1, archer: 1.0, cavalry: 1.0 },
    siege: 1.1,
    spy: 1.0,
    scout: 1.0,
    mercCost: 1.0,
  },
  gnoll: {
    production: { food: 1.1, wood: 0.9, stone: 0.9, ore: 1.0 },
    attack: 1.0,
    defence: 0.9,
    units: { footman: 1.0, archer: 0.9, cavalry: 1.0 },
    siege: 0.8,
    spy: 1.2,
    scout: 1.2,
    mercCost: 0.9,
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
