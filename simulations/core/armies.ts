// Shared fixtures for the battle harnesses.
//
// One place to build a fighting empire, so B1, B2 and B4 are comparing the same
// thing and a change to the reference army moves all three together. Built on
// `newEmpire` rather than assembled by hand — a Player invented from scratch
// drifts from the real one the moment a field is added.

import { newEmpire, type Player } from "@/lib/engine";
import { MERCENARIES, SIEGE_GEAR, type SiegeGearKey } from "@/lib/constants";
import type { Race } from "@/lib/constants/races";

export interface ArmySpec {
  race?: Race;
  /** Total regulars, split 50/30/20 across footmen/archers/cavalry. */
  size: number;
  /** 0 = open field. */
  walls?: number;
  /** Light / medium / heavy split. Defaults to all light. */
  tier?: "light" | "medium" | "heavy";
  engineers?: number;
  /**
   * A siege train sized to the army — gear, the Foundry that built it, and
   * enough engineers to crew it.
   *
   * Without this an "attacker" walks up to a castle with bare hands. That is
   * not a castle assault, and measuring it told us walls beyond level 1 were
   * worthless: the wall was never engaged at all, so its LEVEL could not
   * matter, and the harness dutifully reported a flat line. Passing engineers
   * alone is not enough — engineers crew engines, they are not engines.
   *
   * The number is engines per 100 regulars, so the train scales with the army
   * rather than being a fixed lump that is overwhelming at 500 and trivial at
   * 5,000.
   */
  siegePer100?: number;
  experience?: number;
  /** All footmen instead of the 50/30/20 split — isolates the archer phase. */
  footmenOnly?: boolean;
  /**
   * Hire sellswords up to MERCENARIES.CAP_RATIO of the regulars, as a real
   * empire does.
   *
   * Matters far more than it looks. CASUALTY_SPLIT.MERC_SHARE puts 70% of every
   * blow onto the hired blades, so an army WITHOUT them takes every casualty on
   * its regulars — and regulars are what the experience ledger charges you for,
   * what the mercenary cascade keys off, and what the victory floors count. A
   * harness that never hires is measuring a fight nobody has.
   */
  mercs?: boolean;
  /** Goods sitting outside storage — what a raid can actually take. */
  loose?: number;
  gold?: number;
}

/**
 * A fighting empire.
 *
 * Muster Halls are provisioned to fit the army, because they are a real cap and
 * an army that exceeds its beds is not a state the game can reach — measuring
 * it would be measuring a fantasy.
 */
export function army(spec: ArmySpec, id = "x"): Player {
  const { race = "human", size, walls = 0, tier = "light", engineers = 0 } = spec;
  const p = newEmpire({ id, name: id, race });

  const foot = spec.footmenOnly ? size : Math.round(size * 0.5);
  const arch = spec.footmenOnly ? 0 : Math.round(size * 0.3);
  const cav = spec.footmenOnly ? 0 : size - foot - arch;
  p.army.footmen = { light: 0, medium: 0, heavy: 0, [tier]: foot } as typeof p.army.footmen;
  p.army.archers = { light: 0, medium: 0, heavy: 0, [tier]: arch } as typeof p.army.archers;
  p.army.cavalry = { light: 0, medium: 0, heavy: 0, [tier]: cav } as typeof p.army.cavalry;

  if (spec.mercs) {
    const cap = (n: number) => Math.floor(n * MERCENARIES.CAP_RATIO);
    p.army.mercenaries.footmen = { light: 0, medium: 0, heavy: 0, [tier]: cap(foot) } as typeof p.army.mercenaries.footmen;
    p.army.mercenaries.archers = { light: 0, medium: 0, heavy: 0, [tier]: cap(arch) } as typeof p.army.mercenaries.archers;
    p.army.mercenaries.cavalry = { light: 0, medium: 0, heavy: 0, [tier]: cap(cav) } as typeof p.army.mercenaries.cavalry;
  }

  p.army.siegeEngineers = engineers;
  p.army.experiencePoints = spec.experience ?? 0;

  p.buildings = {
    ...p.buildings,
    muster_hall: Math.ceil(size / 10) + 2,
    walls,
    drill_yard: 3,
    fletchers_range: 3,
    knights_stables: 3,
  };
  p.wallIntegrity = walls > 0 ? 1 : 0;

  // The siege train. Weighted toward the wall-breakers, because that is what a
  // besieger actually brings — and the Foundry at 10 so every rung is legal.
  if (spec.siegePer100) {
    const n = (per100: number) => Math.round((size / 100) * per100);
    p.buildings = { ...p.buildings, war_foundry: 10 };
    p.army.siegeGear = {
      ...p.army.siegeGear,
      ropes: n(spec.siegePer100 * 2),
      ladders: n(spec.siegePer100 * 2),
      rams: n(spec.siegePer100 * 1.5),
      ballistae: n(spec.siegePer100),
      trebuchets: n(spec.siegePer100),
      siege_towers: n(spec.siegePer100 * 0.5),
    };
    // Crew for the whole train, since an uncrewed engine is lumber (and scores
    // nothing — see SCORE.SIEGE_REQUIRES_CREW).
    const crewNeeded = Object.entries(p.army.siegeGear).reduce(
      (sum, [k, count]) => sum + count * (SIEGE_GEAR[k as SiegeGearKey]?.crew ?? 0),
      0,
    );
    p.army.siegeEngineers = Math.max(p.army.siegeEngineers, crewNeeded);
  }

  if (spec.loose !== undefined) {
    p.resources = { food: spec.loose, wood: spec.loose, stone: spec.loose, ore: spec.loose };
  }
  if (spec.gold !== undefined) p.gold = spec.gold;

  // Shields exist to protect newcomers, not to confuse a simulation.
  p.shieldUntilTick = 0;
  return p;
}

/** Every regular in the line — the thing a battle actually spends. */
export const regulars = (p: Player): number => {
  const sum = (t: { light: number; medium: number; heavy: number }) => t.light + t.medium + t.heavy;
  return sum(p.army.footmen) + sum(p.army.archers) + sum(p.army.cavalry);
};

export const lootTotal = (loot: { gold: number; resources: Record<string, number> }): number =>
  loot.gold + Object.values(loot.resources).reduce((a, b) => a + b, 0);

export const lossesTotal = (l: { footmen?: number; archers?: number; cavalry?: number }): number =>
  (l.footmen ?? 0) + (l.archers ?? 0) + (l.cavalry ?? 0);
