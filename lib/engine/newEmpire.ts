// Starting conditions for a new empire — every number from START in
// lib/constants/balance.ts (THE tuning file).

import { ACTION_TURNS, DEFAULT_TAX_RATE, NEWCOMER_SHIELD_HOURS, SPY_TURNS, TICKS_PER_HOUR } from "../constants";
import { START } from "../constants/balance";
import type { Race } from "../constants/races";
import { emptyMercForce, emptySiegeCounters, emptySiegeGear, fullCounterIntegrity, fullGearIntegrity, type Player } from "./types";

export function newEmpire(opts: {
  id: string;
  name: string;
  race: Race;
  joinedAtTick?: number;
  isBot?: boolean;
}): Player {
  const joinedAtTick = opts.joinedAtTick ?? 0;
  return {
    id: opts.id,
    name: opts.name,
    race: opts.race,
    isBot: opts.isBot,
    clanDepartures: 0,

    idlePeasants: START.IDLE_PEASANTS,
    workers: {
      farmers: 0,
      quarrymen: 0,
      miners: 0,
      lumberjacks: 0,
      merchants: 0,
      researchers: 0,
    },
    army: {
      footmen: { light: START.LIGHT_FOOTMEN, medium: 0, heavy: 0 },
      archers: { light: 0, medium: 0, heavy: 0 },
      cavalry: { light: 0, medium: 0, heavy: 0 },
      siegeEngineers: 0,
      siegeGear: emptySiegeGear(),
      siegeCounters: emptySiegeCounters(),
      spies: 0,
      scouts: 0,
      siegeGearIntegrity: fullGearIntegrity(),
      siegeCounterIntegrity: fullCounterIntegrity(),
      mercenaries: emptyMercForce(),
      stamina: START.STAMINA,
      experiencePoints: 0,
      siegeExperience: 0,
      spyExperience: 0,
      scoutExperience: 0,
    },

    gold: START.GOLD,
    bankedGold: 0,
    taxRate: DEFAULT_TAX_RATE,
    resources: {
      food: START.RESOURCES_EACH,
      wood: START.RESOURCES_EACH,
      stone: START.RESOURCES_EACH,
      ore: START.RESOURCES_EACH,
    },
    bankedResources: { food: 0, wood: 0, stone: 0, ore: 0 },
    turnsAvailable: ACTION_TURNS.START,
    spyTurnsAvailable: SPY_TURNS.START,
    onVacation: false,
    vacationTicksUsed: 0,
    starving: false,

    // Founding structures (START.BUILDINGS): level-1 banking so day-one raids
    // can't strip a newcomer bare, plus homes and barracks.
    buildings: { ...START.BUILDINGS },
    wallIntegrity: 1,
    buildingIntegrity: {}, // absent entries = full health

    research: { banked: {}, levels: {} },

    joinedAtTick,
    shieldUntilTick: joinedAtTick + NEWCOMER_SHIELD_HOURS * TICKS_PER_HOUR,
    recentAttackers: [],
    revengeUsed: [],

    battlesWon: 0,
    battlesLost: 0,
  };
}
