// The sandbox: build a throwaway Player from plain numbers.
//
// Both calculators (/tools/battle, /tools/ranking) run the REAL engine — the
// same resolveBattle and the same rankingScore the world uses — because a
// calculator that models the game approximately is worse than none at all.
// Everything here is pure and nothing touches the world.

import { RESEARCH_FIELDS, type ResearchField } from "../constants/research";
import type { BuildingId } from "../constants/buildings";
import type { Race } from "../constants/races";
import { newEmpire } from "./newEmpire";
import type { CounterType } from "../constants/buildings";
import type { Player, SiegeGearType, Tier, TroopType } from "./types";

export interface SandboxArmy {
  name: string;
  race: Race;
  /** [light, medium, heavy] per arm. */
  footmen: [number, number, number];
  archers: [number, number, number];
  cavalry: [number, number, number];
  mercFootmen: [number, number, number];
  mercArchers: [number, number, number];
  mercCavalry: [number, number, number];
  engineers: number;
  mercEngineers: number;
  spies: number;
  scouts: number;
  stamina: number;
  experience: number;
  siegeExperience: number;
  wallLevel: number;
  wallIntegrity: number;
  /** Offensive gear and defensive counters, by type. */
  gear: Partial<Record<SiegeGearType, number>>;
  counters: Partial<Record<CounterType, number>>;
  research: Partial<Record<ResearchField, number>>;
  sortie: boolean;
  /** Civilians — they matter for ranking, and for what a raid can displace. */
  peasants: number;
  gold: number;
  resources: number;
}

const TIERS: Tier[] = ["light", "medium", "heavy"];

export const EMPTY_ARMY: SandboxArmy = {
  name: "Attacker",
  race: "human",
  footmen: [0, 0, 0],
  archers: [0, 0, 0],
  cavalry: [0, 0, 0],
  mercFootmen: [0, 0, 0],
  mercArchers: [0, 0, 0],
  mercCavalry: [0, 0, 0],
  engineers: 0,
  mercEngineers: 0,
  spies: 0,
  scouts: 0,
  stamina: 100,
  experience: 0,
  siegeExperience: 0,
  wallLevel: 0,
  wallIntegrity: 1,
  gear: {},
  counters: {},
  research: {},
  sortie: false,
  peasants: 0,
  gold: 0,
  resources: 0,
};

const counts = (t: [number, number, number]) => ({ light: t[0], medium: t[1], heavy: t[2] });

/**
 * Turn a sandbox description into a real Player the engine will accept.
 *
 * Buildings are back-derived from the army rather than asked for: a calculator
 * that made you satisfy Muster Hall capacity and trainer levels before it would
 * simulate a fight would be a chore, not a tool. The numbers that actually
 * decide a battle — power, health, walls, stamina, XP, research — are all set
 * directly.
 */
export function buildSandboxPlayer(a: SandboxArmy, id: string): Player {
  const p = newEmpire({ id, name: a.name || id, race: a.race });

  p.army.footmen = counts(a.footmen);
  p.army.archers = counts(a.archers);
  p.army.cavalry = counts(a.cavalry);
  p.army.mercenaries.footmen = counts(a.mercFootmen);
  p.army.mercenaries.archers = counts(a.mercArchers);
  p.army.mercenaries.cavalry = counts(a.mercCavalry);
  p.army.siegeEngineers = Math.max(0, a.engineers);
  p.army.mercenaries.engineers = Math.max(0, a.mercEngineers);
  p.army.spies = Math.max(0, a.spies);
  p.army.scouts = Math.max(0, a.scouts);
  p.army.stamina = Math.max(0, Math.min(100, a.stamina));
  p.army.experience = Math.max(0, Math.min(100, a.experience));
  p.army.siegeExperience = Math.max(0, Math.min(100, a.siegeExperience));
  p.army.sortieEnabled = a.sortie;

  for (const [t, n] of Object.entries(a.gear)) {
    p.army.siegeGear[t as SiegeGearType] = Math.max(0, n ?? 0);
  }
  for (const [t, n] of Object.entries(a.counters)) {
    p.army.siegeCounters[t as CounterType] = Math.max(0, n ?? 0);
  }

  p.buildings.walls = Math.max(0, Math.min(10, a.wallLevel));
  p.wallIntegrity = Math.max(0, Math.min(1, a.wallIntegrity));

  for (const f of RESEARCH_FIELDS) {
    const lvl = a.research[f.id];
    if (lvl) p.research.levels[f.id] = Math.max(0, Math.min(5, lvl));
  }

  p.idlePeasants = Math.max(0, a.peasants);
  p.gold = Math.max(0, a.gold);
  p.resources = { food: a.resources, wood: a.resources, stone: a.resources, ore: a.resources };

  // Housing and barracks sized to fit, so nothing the engine reads looks absurd.
  p.buildings.hearthstead = Math.ceil((p.idlePeasants + 1) / 10);
  p.buildings.muster_hall = 9999;
  // The trainers/Foundry a real empire would need to own this army — they gate
  // BUYING, not fighting, but the siege duel reads the Foundry for gear tiers.
  p.buildings.war_foundry = 10;
  p.buildings.forge = 3;
  for (const b of ["drill_yard", "fletchers_range", "knights_stables"] as BuildingId[]) {
    p.buildings[b] = 3;
  }
  return p;
}

/** Total headcount of one arm across tiers — for the summary line. */
export const armTotal = (t: [number, number, number]) => t[0] + t[1] + t[2];

export const TIER_LABELS = TIERS;
export const ARMS: TroopType[] = ["footman", "archer", "cavalry"];
