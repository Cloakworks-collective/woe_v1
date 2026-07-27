// Core game state types (spec/architecture.md). The engine is pure:
// (state, command | tick) → (state, events). No side effects, no I/O.
// All time windows are measured in ticks (1 tick = 10 minutes, 144/day).

import type { Race } from "../constants/races";
import type { BuildingId, CounterType } from "../constants/buildings";
import type { ResearchField } from "../constants/research";

export type Resource = "food" | "wood" | "stone" | "ore";
export type Tier = "light" | "medium" | "heavy";
export type TroopType = "footman" | "archer" | "cavalry";
export type AttackMode = "raid" | "siege" | "revenge" | "bombard";
export type SiegeGearType = "ropes" | "ladders" | "rams" | "ballistae" | "trebuchets";
export type WorkerRole =
  | "farmers"
  | "quarrymen"
  | "miners"
  | "lumberjacks"
  | "merchants"
  | "researchers";

export interface TroopCounts {
  light: number;
  medium: number;
  heavy: number;
}

/** Hired sellswords, now raised by type and tier just like regulars (they need
 *  the same trainer/Forge buildings to hire). They die before your matching
 *  regulars, cost gold upkeep or defect, and count zero toward ranking. */
export interface MercForce {
  footmen: TroopCounts;
  archers: TroopCounts;
  cavalry: TroopCounts;
}

export interface ArmyState {
  footmen: TroopCounts;
  archers: TroopCounts;
  cavalry: TroopCounts;
  siegeEngineers: number;
  siegeGear: Record<SiegeGearType, number>; // offensive; crewed when attacking
  /** Defensive siege engines; crewed by engineers when defending. Absent on
   *  old saves (migrated to zeros in normalizePlayer). */
  siegeCounters: Record<CounterType, number>;
  spies: number;
  scouts: number;
  mercenaries: MercForce; // die first; max 25% of regular army headcount
  stamina: number; // 0–100
  experience: number; // 0–100, global army stat
}

// ── Premium — the Royal Charter (spec/premium.md) ───────────────────────────

/** One research-queue entry = one level of one field. */
export interface ResearchQueueEntry {
  field: ResearchField;
  toLevel: number;
}

export type OrderCondition =
  | { kind: "building"; building: BuildingId; level: number } // level/count reached
  | { kind: "research"; field: ResearchField; level: number }
  | { kind: "gold"; amount: number }
  | { kind: "resource"; resource: Resource; amount: number };

export type OrderAction =
  | { kind: "trainTroops"; type: TroopType; tier: Tier; count: number; remaining: number }
  | { kind: "trainSpies"; count: number; remaining: number }
  | { kind: "trainScouts"; count: number; remaining: number }
  | { kind: "trainEngineers"; count: number; remaining: number }
  | { kind: "build"; building: BuildingId }
  | { kind: "setTax"; rate: number };

/** "Once X, do Y" — evaluated by the Steward every tick until fulfilled. */
export interface StandingOrder {
  id: string;
  when: OrderCondition;
  then: OrderAction;
}

export interface Player {
  id: string;
  name: string;
  race: Race;
  isBot?: boolean;
  /** Realm token — bearer credential for the CLI / cmd:* API. Server-managed;
   *  never part of game rules. */
  apiToken?: string;
  /** Banished by the crown (admin) — all logins and commands rejected.
   *  Server-managed; never part of game rules. */
  banned?: boolean;
  /** Wall-clock ms of the ruler's last page load or command — powers the
   *  ladder's "Online" column. Server-managed; never part of game rules. */
  lastSeenAtMs?: number;
  /** The Royal Charter (premium): unlocks the Steward — queues + standing orders. */
  premium?: boolean;
  buildQueue?: BuildingId[];
  researchQueue?: ResearchQueueEntry[];
  standingOrders?: StandingOrder[];
  clanId?: string;
  clanDepartures: number; // leaves + kicks this era; at 2, no more joining
  clanJoinableAtTick?: number; // 48h (288-tick) cooldown after departure

  // Population
  idlePeasants: number;
  workers: Record<WorkerRole, number>;
  army: ArmyState;

  // Economy
  gold: number;
  bankedGold: number; // ≤ Counting House capacity × integrity; safe from sieges
  taxRate: number; // 0.0–1.0
  resources: Record<Resource, number>; // loose goods — raidable
  /** Vaulted goods, banked into the storage buildings — safe from raids up to
   *  capacity × integrity (a wrecked store spills). Manual for everyone;
   *  Charter holders auto-vault each tick. Absent on old saves = all zeros. */
  bankedResources?: Record<Resource, number>;
  turnsAvailable: number; // action turns
  surrendered: boolean;
  /** Cumulative turns spent surrendered this era; capped at SURRENDER_TICKS_PER_ERA. */
  surrenderTicksUsed: number;
  /** Queued surrender: the flag rises automatically once every revenge window
   *  against you has closed (you can't surrender while owing revenge). */
  surrenderQueued?: boolean;
  /** Turn the white flag last came down — gates the re-attack cooldown. */
  surrenderLiftedAtTick?: number;
  starving: boolean; // food hit 0 — empire frozen until fed

  // Buildings: level for levelled/tiered buildings, count for counted ones
  buildings: Partial<Record<BuildingId, number>>;
  wallIntegrity: number; // 0.0–1.0
  /** Per-building integrity 0.5–1.0 (bombardable). Absent = full health (1).
   *  Damaged storages shelter less, production buildings yield less, and a
   *  cracked Collegium researches slower. Walls are tracked separately above. */
  buildingIntegrity?: Partial<Record<BuildingId, number>>;

  research: {
    activeField?: ResearchField;
    banked: Partial<Record<ResearchField, number>>;
    levels: Partial<Record<ResearchField, number>>;
  };

  // Time windows (ticks)
  joinedAtTick: number;
  shieldUntilTick: number; // newcomer shield; attacking drops it early
  unrestUntilTick?: number; // Incite Unrest: tax/production −25%, growth halted

  // Revenge tracking
  recentAttackers: { playerId: string; tick: number }[];
  revengeUsed: string[]; // player IDs already revenged this window

  // Stats
  battlesWon: number;
  battlesLost: number;

  /** New-regent onboarding (spec: help newcomers get started). Server-managed
   *  UI/reward meta, not a game rule. `claimed` holds charge ids already
   *  rewarded (rewards are idempotent); `dismissed` hides the panel for good
   *  and grants any remaining rewards; welcomed/toured gate the one-time
   *  proclamation and spotlight tour. Absent = a fresh newcomer. */
  onboarding?: {
    claimed: string[];
    dismissed?: boolean;
    welcomed?: boolean;
    toured?: boolean;
  };
}

// ── Clans (spec/clans.md) ───────────────────────────────────────────────────

export type ClanResource = Resource | "gold";

export interface Clan {
  id: string;
  name: string;
  leaderId: string;
  viceLeaderId?: string;
  officerIds: string[]; // max 3
  members: string[]; // capped by Clan Hall level
  buildings: {
    storageLevel: number; // 0–10
    hallLevel: number; // 1–4
    wonderLevel: number; // 0–3
    integrity: { storage: number; hall: number; wonder: number }; // 0–1
  };
  storage: Record<ClanResource, number>;
  /** Lifetime deposits/withdrawals per member — enforces the 3× rule. */
  memberLedger: Record<
    string,
    { deposited: Record<ClanResource, number>; withdrawn: Record<ClanResource, number> }
  >;
  wars: {
    clanId: string;
    regularKills: number; // our kills of their regulars
    regularLosses: number; // theirs of ours; net +200 = victory
  }[];
  warRecord: { wins: number; losses: number };
  truceWithUntilTick: Record<string, number>; // clanId → truce end (post-defeat)
  clockFrozenUntilTick?: number; // loser's victory clocks frozen 48h
  tribute?: { toClanId: string; endsAtTick: number; collectedGoldEq: number };
  friendly: string[]; // mutual friendly clans
  pendingRevenge?: { againstClanId: string; memberSnapshot: string[]; expiresAtTick: number };
}

// ── Battle reports (spec/combat.md) ─────────────────────────────────────────

export interface UnitLosses {
  footmen: number;
  archers: number;
  cavalry: number;
  engineers: number;
  mercenaries: number; // aggregate across merc type/tier — they fall as one line
}

export interface BattleReport {
  id: string;
  tick: number;
  attackerId: string;
  attackerName: string;
  defenderId: string;
  defenderName: string;
  mode: AttackMode;
  rounds: number;
  victor: "attacker" | "defender" | "none"; // bombard has no victor
  attackerLosses: UnitLosses;
  defenderLosses: UnitLosses;
  wallIntegrityDamage: number; // fraction of defender's wall destroyed
  /** Bombard: buildings cracked open beyond the walls (integrity lost each). */
  buildingDamage?: { building: BuildingId; integrityLost: number }[];
  siegeGearLost: Partial<Record<SiegeGearType, number>>; // attacker's
  trebsDestroyedByCounter?: number;
  loot: { gold: number; resources: Record<Resource, number> };
  staminaLoss: { attacker: number; defender: number };
  experienceChange: { attacker: number; defender: number };
  log: string[]; // human-readable round-by-round summary
}

// ── Market (spec/market.md) ─────────────────────────────────────────────────

export interface MarketOrder {
  id: string;
  sellerId: string; // never shown to buyers — the Bazaar is anonymous
  resource: Resource;
  remaining: number;
  pricePerUnit: number; // gold
  createdTick: number;
  /** Tick the caravan reaches the Bazaar; until then it's en route and not
   *  buyable. Legacy orders lack it — treated as already arrived. */
  arrivesAtTick?: number;
}

// ── Events ──────────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: "starvation" }
  | { type: "fed" }
  | { type: "mercsDefected"; count: number }
  | { type: "dailyRecruitment"; arrived: number; turnedAway: number }
  | { type: "scattering"; lost: number }
  | { type: "researchComplete"; field: ResearchField; level: number }
  | { type: "buildComplete"; building: BuildingId; level: number }
  | { type: "attacked"; byId: string; byName: string; mode: AttackMode; battleId: string }
  | { type: "battleResult"; battleId: string; victor: string; mode: AttackMode }
  | { type: "spyReport"; op: string; targetName: string; caught: boolean; detail: string }
  | { type: "spiesCaught"; attackerName: string; executed: number; op: string }
  | { type: "sabotaged"; detail: string } // anonymous — victim sees damage, not the hand
  | { type: "scoutReport"; targetName: string; detail: string }
  | { type: "marketSale"; resource: Resource; amount: number; goldNet: number }
  | { type: "clanEvent"; detail: string }
  /** A victory hold-clock started or stopped for you (Grand Overlord) or your
   *  clan (Clan Victory) — you became / stopped being the eligible #1. */
  | { type: "crownClock"; scope: "overlord" | "clan"; gained: boolean; who: string }
  | { type: "info"; detail: string };

export interface EngineResult {
  player: Player;
  events: GameEvent[];
}

export class EngineError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "EngineError";
  }
}

// ── Population helpers ──────────────────────────────────────────────────────

export function troopTotal(c: TroopCounts): number {
  return c.light + c.medium + c.heavy;
}

export function emptyTroopCounts(): TroopCounts {
  return { light: 0, medium: 0, heavy: 0 };
}

export function emptyMercForce(): MercForce {
  return { footmen: emptyTroopCounts(), archers: emptyTroopCounts(), cavalry: emptyTroopCounts() };
}

export function emptySiegeCounters(): Record<CounterType, number> {
  return { billhooks: 0, forkpoles: 0, boiling_oil: 0, hoardings: 0, counter_engine: 0 };
}

/** Total hired sellswords across every type and tier. */
export function mercTotal(m: MercForce): number {
  return troopTotal(m.footmen) + troopTotal(m.archers) + troopTotal(m.cavalry);
}

/** Bring a possibly-legacy save into the current shape: mercenaries used to be
 *  a flat count and there was a separate `warriors` pool. Legacy mercs become
 *  light-footman sellswords; legacy warriors return to the idle pool (their
 *  gear was never forged). Idempotent — safe on every load. */
export function normalizePlayer(p: Player): Player {
  const legacyWarriors = (p as unknown as { warriors?: number }).warriors;
  if (typeof legacyWarriors === "number") {
    p.idlePeasants += legacyWarriors;
    delete (p as unknown as { warriors?: number }).warriors;
  }
  const m = p.army.mercenaries as unknown;
  if (typeof m === "number") {
    p.army.mercenaries = emptyMercForce();
    p.army.mercenaries.footmen.light = m;
  }
  // Defensive siege engines were added later — old armies have none.
  if (!p.army.siegeCounters) p.army.siegeCounters = emptySiegeCounters();
  return p;
}

/** Civilians: idle + workers + spies + scouts (all pay tax, all eat). */
export function civilians(p: Player): number {
  const workers = Object.values(p.workers).reduce((a, b) => a + b, 0);
  return p.idlePeasants + workers + p.army.spies + p.army.scouts;
}

/** Regular military: equipped troops + engineers (no mercs). */
export function military(p: Player): number {
  return (
    troopTotal(p.army.footmen) +
    troopTotal(p.army.archers) +
    troopTotal(p.army.cavalry) +
    p.army.siegeEngineers
  );
}

/** Total population = civilians + regular military. Mercenaries never count. */
export function totalPopulation(p: Player): number {
  return civilians(p) + military(p);
}

export function level(p: Player, id: BuildingId): number {
  return p.buildings[id] ?? 0;
}

/** Vaulted goods, defaulting to zeros for empires saved before banking. */
export function bankedRes(p: Player): Record<Resource, number> {
  return p.bankedResources ?? { food: 0, wood: 0, stone: 0, ore: 0 };
}

/** Building integrity 0.5–1.0; absent = full health. Bombard is the only
 *  thing that lowers it; repairs restore it (see combat.md / buildings.md). */
export function buildingIntegrity(p: Player, id: BuildingId): number {
  return p.buildingIntegrity?.[id] ?? 1;
}

export function researchLevel(p: Player, field: ResearchField): number {
  return p.research.levels[field] ?? 0;
}

/** Total research levels earned across every field — the ordinal that drives the
 *  global progressive research cost (spec/research.md). */
export function totalResearchLevels(p: Player): number {
  return Object.values(p.research.levels).reduce((a, b) => a + (b ?? 0), 0);
}
