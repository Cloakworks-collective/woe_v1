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
  // The trainers and Engine Yard a real empire would need to own this army — they gate
  // BUYING, not fighting, but the siege duel reads the Engine Yard for gear tiers.
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

// ── Scenario fill ───────────────────────────────────────────────────────────
//
// The calculators start blank, which is honest but slow: before you can learn
// anything you have to invent two armies. These build a plausible one at a
// chosen weight so you can press Fight in two clicks and start asking "what if"
// instead of "what numbers".
//
// Everything is randomised within a band, so pressing the same button twice
// gives a different — but comparably strong — matchup. Siege is matched
// deliberately: two sides with wildly different engine parks produce a battle
// decided before it starts, which teaches nothing.

export type ArmyWeight = "weak" | "medium" | "strong";

export const ARMY_WEIGHTS: { id: ArmyWeight; label: string; hint: string; troops: number }[] = [
  { id: "weak", label: "Weak", hint: "~100 troops — a young empire", troops: 100 },
  { id: "medium", label: "Medium", hint: "~500 troops — mid-age", troops: 500 },
  { id: "strong", label: "Strong", hint: "1,000+ troops — late age", troops: 1000 },
];

const RACES_ALL: Race[] = ["human", "elf", "orc", "troll", "dwarf", "gnoll"];

/** n ± spread%, never below zero. */
const jitter = (n: number, spread: number, rand: () => number) =>
  Math.max(0, Math.round(n * (1 - spread + rand() * spread * 2)));

const pick = <T,>(xs: readonly T[], rand: () => number): T => xs[Math.floor(rand() * xs.length)]!;

/** Split a headcount across light/medium/heavy — heavier armies skew later. */
function tiers(total: number, weight: ArmyWeight, rand: () => number): [number, number, number] {
  const mix =
    weight === "strong"
      ? [0.3, 0.45, 0.25]
      : weight === "medium"
        ? [0.55, 0.35, 0.1]
        : [0.85, 0.15, 0];
  const l = Math.round(total * mix[0]! * (0.85 + rand() * 0.3));
  const m = Math.round(total * mix[1]! * (0.85 + rand() * 0.3));
  const h = Math.max(0, total - l - m);
  return [l, m, h];
}

/**
 * A plausible empire at the given weight. `defender` gets walls and defensive
 * engines; the attacker gets the offensive train — otherwise every generated
 * matchup is a field battle and the siege half of the game never appears.
 */
export function randomArmy(
  weight: ArmyWeight,
  opts: { defender?: boolean; rand?: () => number; name?: string } = {},
): SandboxArmy {
  const rand = opts.rand ?? Math.random;
  const base = ARMY_WEIGHTS.find((w) => w.id === weight)!.troops;
  // ONE roll for the headcount. The arm split then divides that total rather
  // than jittering each arm separately: three independent ±25% rolls compound,
  // and two "Strong" armies came out nearly 2:1 — a fight decided before it
  // started, which is exactly what a scenario generator must not produce.
  const total = jitter(base, 0.2, rand);
  const archN = Math.round(total * (0.2 + rand() * 0.12));
  const cavN = Math.round(total * (0.14 + rand() * 0.1));
  const footN = Math.max(0, total - archN - cavN);

  const foot = tiers(footN, weight, rand);
  const arch = tiers(archN, weight, rand);
  const cav = tiers(cavN, weight, rand);

  const engineers = jitter(total * 0.08, 0.4, rand);
  const scale = weight === "strong" ? 1 : weight === "medium" ? 0.5 : 0.15;
  const engines = (n: number) => jitter(n * scale, 0.5, rand);

  const research: SandboxArmy["research"] = {};
  const maxLvl = weight === "strong" ? 4 : weight === "medium" ? 2 : 1;
  for (const f of ["art_of_war", "shieldcraft", "siegecraft", "siege_accuracy"] as const) {
    research[f] = Math.round(rand() * maxLvl);
  }

  return {
    ...EMPTY_ARMY,
    name: opts.name ?? (opts.defender ? "Defender" : "Attacker"),
    race: pick(RACES_ALL, rand),
    footmen: foot,
    archers: arch,
    cavalry: cav,
    // A little hired steel, sometimes.
    mercFootmen: rand() < 0.4 ? [jitter(total * 0.08, 0.6, rand), 0, 0] : [0, 0, 0],
    engineers,
    stamina: 70 + Math.round(rand() * 30),
    experience: Math.round(rand() * (weight === "strong" ? 70 : weight === "medium" ? 40 : 15)),
    siegeExperience: Math.round(rand() * (weight === "strong" ? 60 : 30)),
    research,
    peasants: jitter(total * 6, 0.3, rand),
    gold: jitter(total * 400, 0.5, rand),
    resources: jitter(total * 300, 0.5, rand),
    ...(opts.defender
      ? {
          wallLevel: weight === "strong" ? 6 + Math.floor(rand() * 5) : weight === "medium" ? 3 + Math.floor(rand() * 4) : Math.floor(rand() * 3),
          wallIntegrity: 0.6 + rand() * 0.4,
          sortie: rand() < 0.35,
          counters: {
            billhooks: engines(20),
            forkpoles: engines(14),
            fire_pots: engines(10),
            boiling_oil: engines(10),
            hoardings: engines(8),
            counter_engine: engines(12),
          },
        }
      : {
          gear: {
            ropes: engines(20),
            ladders: engines(14),
            siege_towers: engines(5),
            rams: engines(8),
            ballistae: engines(8),
            trebuchets: engines(14),
          },
        }),
  };
}
