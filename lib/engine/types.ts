// Core game state types (spec/architecture.md). The engine is pure:
// (state, command | tick) → (state, events). No side effects, no I/O.
// All time windows are measured in ticks (1 tick = 10 minutes, 144/day).

import type { Race } from "../constants/races";
import type { BuildingId } from "../constants/buildings";
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

export interface ArmyState {
  footmen: TroopCounts;
  archers: TroopCounts;
  cavalry: TroopCounts;
  siegeEngineers: number;
  siegeGear: Record<SiegeGearType, number>;
  spies: number;
  scouts: number;
  mercenaries: number; // die first; max 25% of regular army
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
  | { kind: "trainWarriors"; count: number; remaining: number }
  | { kind: "trainSpies"; count: number; remaining: number }
  | { kind: "trainScouts"; count: number; remaining: number }
  | { kind: "trainEngineers"; count: number; remaining: number }
  | { kind: "equip"; type: TroopType; tier: Tier; count: number; remaining: number }
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
  warriors: number; // trained but unequipped
  army: ArmyState;

  // Economy
  gold: number;
  bankedGold: number; // ≤ Counting House capacity × integrity; safe from sieges
  taxRate: number; // 0.0–1.0
  resources: Record<Resource, number>;
  turnsAvailable: number; // action turns
  surrendered: boolean;
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
  warriors: number;
  mercenaries: number;
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

/** Civilians: idle + workers + spies + scouts (all pay tax, all eat). */
export function civilians(p: Player): number {
  const workers = Object.values(p.workers).reduce((a, b) => a + b, 0);
  return p.idlePeasants + workers + p.army.spies + p.army.scouts;
}

/** Regular military: warriors + equipped troops + engineers (no mercs). */
export function military(p: Player): number {
  return (
    p.warriors +
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

/** Building integrity 0.5–1.0; absent = full health. Bombard is the only
 *  thing that lowers it; repairs restore it (see combat.md / buildings.md). */
export function buildingIntegrity(p: Player, id: BuildingId): number {
  return p.buildingIntegrity?.[id] ?? 1;
}

export function researchLevel(p: Player, field: ResearchField): number {
  return p.research.levels[field] ?? 0;
}
