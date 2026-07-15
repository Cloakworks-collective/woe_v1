// Clans — leadership, buildings, wars, churn (spec/clans.md). All tunable.

export const LEADERSHIP = { LEADERS: 1, VICE_LEADERS: 1, OFFICERS: 3 };

// Clan Storage (levels 1–10)
export const STORAGE_CAP_PER_LEVEL = 250000; // per resource type
export const WITHDRAW_MULTIPLE = 3; // withdrawable = 3× lifetime deposits − withdrawn

// Clan Hall (levels 1–4): member cap + tax-penalty reduction
export const HALL = [
  { level: 1, memberCap: 5, taxPenaltyFelt: 1.0 },
  { level: 2, memberCap: 10, taxPenaltyFelt: 0.83 },
  { level: 3, memberCap: 15, taxPenaltyFelt: 0.66 },
  { level: 4, memberCap: 20, taxPenaltyFelt: 0.5 },
];

// Clan Wonder (levels 1–3): −10%/level merc, troop, siege costs
export const WONDER_DISCOUNT_PER_LEVEL = 0.1;
export const WONDER_REQUIRES_STORAGE = { 1: 4, 2: 7, 3: 10 } as const;

/** Build costs per level (gold, each = wood/stone/ore). */
export const BUILD_COSTS = {
  storage: (level: number) => ({ gold: 100000 * level, each: 50000 * level }),
  hall: [
    null,
    { gold: 50000, each: 0 }, // L1 founding fee
    { gold: 500000, each: 250000 },
    { gold: 1500000, each: 750000 },
    { gold: 3000000, each: 1500000 },
  ],
  wonder: [
    null,
    { gold: 1000000, each: 500000 },
    { gold: 2500000, each: 1250000 },
    { gold: 5000000, each: 2500000 },
  ],
};

export const FOUNDING_MEMBERS = 5;

// War
export const WAR = {
  DAMAGE_BONUS: 1.0, // +100% battle damage both ways
  NET_REGULAR_KILLS_TO_WIN: 200,
  XP_TRANSFER: 0.05, // losers −5% army XP, winners +5% (cap 100)
  TRIBUTE_RATE: 0.2, // 20% of production per turn…
  TRIBUTE_TURNS: 144, // …for one day…
  TRIBUTE_CAP_GOLD_EQ: 1000000, // …or until 1M gold-equivalent (resources @ 1g)
  TRUCE_HOURS: 48, // loser can't be re-declared on; victory clocks frozen
};

// Membership churn
export const CHURN = {
  REJOIN_COOLDOWN_HOURS: 48, // after leaving or being kicked
  MAX_DEPARTURES_PER_ERA: 2, // leaves + kicks both count
};
