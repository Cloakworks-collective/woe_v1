// Shared fixtures for the battle harnesses.
//
// One place to build a fighting empire, so B1, B2 and B4 are comparing the same
// thing and a change to the reference army moves all three together. Built on
// `newEmpire` rather than assembled by hand — a Player invented from scratch
// drifts from the real one the moment a field is added.

import { newEmpire, type Player } from "@/lib/engine";
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
  experience?: number;
  /** All footmen instead of the 50/30/20 split — isolates the archer phase. */
  footmenOnly?: boolean;
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

  p.army.siegeEngineers = engineers;
  p.army.experience = spec.experience ?? 0;

  p.buildings = {
    ...p.buildings,
    muster_hall: Math.ceil(size / 10) + 2,
    walls,
    drill_yard: 3,
    fletchers_range: 3,
    knights_stables: 3,
  };
  p.wallIntegrity = walls > 0 ? 1 : 0;

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
