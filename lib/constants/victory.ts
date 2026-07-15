// Victory & eras — ranking score, hold clocks (spec/victory.md). All tunable.

export const HOLD_CLOCKS = {
  CUMULATIVE_HOURS: 72, // at #1, never resets
  STREAK_HOURS: 12, // consecutive at #1, resets when knocked off
};

export const POPULATION_FLOORS = {
  GRAND_OVERLORD: 10000, // civilians + regular troops, no mercs
  CLAN: 150000, // total across the clan
};

/** Ranking score weights — the visible empire. */
export const SCORE = {
  PER_CIVILIAN: 10,
  PER_TROOP_BASE: 10, // × tier power (light 1 / medium 1.8 / heavy 3)
  WALLS: (level: number, integrity: number) => level * level * 100 * integrity,
  PER_BUILDING_LEVEL: 200, // levelled buildings, civilian + military
  PER_COUNTED_BUILDING: 50, // hearthsteads, muster halls
  GOLD_DIVISOR: 100,
  // Resources are bulk goods worth ~0.05 g each (economy.md): scoring them
  // at gold value ÷ 100 ⇒ ÷ 2000. (Was ÷ 50 — hoards of ~15M units drowned
  // every other score component in the 60-day sim.)
  RESOURCE_DIVISOR: 2000,
  PER_XP_POINT: 100, // army experience 0–100
  PER_RESEARCH_LEVEL: 1000, // eligible fields only (7 of 10)
};

/** Clan score adds building points × integrity. */
export const CLAN_BUILDING_POINTS = {
  storage: 500, // × level × integrity
  hall: 2000,
  wonder: 10000,
};
