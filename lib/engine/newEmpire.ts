// Starting conditions for a new empire (spec/architecture.md).

import { ACTION_TURNS, DEFAULT_TAX_RATE, NEWCOMER_SHIELD_HOURS, TICKS_PER_HOUR } from "../constants";
import type { Race } from "../constants/races";
import { emptyMercForce, type Player } from "./types";

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

    idlePeasants: 80,
    workers: {
      farmers: 0,
      quarrymen: 0,
      miners: 0,
      lumberjacks: 0,
      merchants: 0,
      researchers: 0,
    },
    army: {
      footmen: { light: 20, medium: 0, heavy: 0 },
      archers: { light: 0, medium: 0, heavy: 0 },
      cavalry: { light: 0, medium: 0, heavy: 0 },
      siegeEngineers: 0,
      siegeGear: { ropes: 0, ladders: 0, rams: 0, ballistae: 0, trebuchets: 0 },
      spies: 0,
      scouts: 0,
      mercenaries: emptyMercForce(),
      stamina: 100,
      experience: 0,
    },

    gold: 5000,
    bankedGold: 0,
    taxRate: DEFAULT_TAX_RATE,
    resources: { food: 1000, wood: 1000, stone: 1000, ore: 1000 },
    bankedResources: { food: 0, wood: 0, stone: 0, ore: 0 },
    turnsAvailable: ACTION_TURNS.START,
    surrendered: false,
    surrenderTicksUsed: 0,
    starving: false,

    // Every empire founds with level-1 banking: the Counting House vault for
    // gold and one shelter per resource, so day-one raids can't strip a
    // newcomer bare.
    buildings: {
      hearthstead: 15,
      muster_hall: 2,
      counting_house: 1,
      granary: 1,
      timberyard: 1,
      masons_yard: 1,
      ironhold: 1,
    },
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
