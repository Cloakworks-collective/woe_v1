// Core game state types (spec/architecture.md). The engine is pure:
// (state, command | tick) → (state, events). No side effects, no I/O.
// All time windows are measured in ticks (1 tick = 10 minutes, 144/day).

import type { Race } from "../constants/races";
import type { BuildingId, CounterType } from "../constants/buildings";
import type { ResearchField } from "../constants/research";
import { EFFECT_PER_LEVEL, RESEARCH_EFFECT_PER_LEVEL, shelterAtLevel } from "../constants";

export type Resource = "food" | "wood" | "stone" | "ore";
export type Tier = "light" | "medium" | "heavy";
export type TroopType = "footman" | "archer" | "cavalry";
export type AttackMode = "raid" | "siege" | "revenge" | "bombard";
export type SiegeGearType =
  | "ropes"
  | "ladders"
  | "siege_towers"
  | "rams"
  | "ballistae"
  | "trebuchets";
/** The arms that can be hired as well as raised. */
export type MercArm = "footman" | "archer" | "cavalry" | "engineer" | "spy" | "scout";
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

/**
 * Hired blades, raised by type and tier just like regulars — and now covering
 * every arm, engineers and covert agents included. They take the first 70% of
 * damage aimed at their category, earn no veterancy, cost none when they die,
 * and are paid off automatically when the regulars who commanded them fall
 * (MERCENARIES.CAP_RATIO). They need barracks beds like anyone else.
 */
export interface MercForce {
  footmen: TroopCounts;
  archers: TroopCounts;
  cavalry: TroopCounts;
  /** Untiered arms — hired as flat counts. */
  engineers: number;
  spies: number;
  scouts: number;
}

export interface ArmyState {
  footmen: TroopCounts;
  archers: TroopCounts;
  cavalry: TroopCounts;
  siegeEngineers: number;
  siegeGear: Record<SiegeGearType, number>; // offensive; crewed when attacking
  /** Defensive siege engines; crewed by engineers when defending. */
  siegeCounters: Record<CounterType, number>;
  /**
   * Per-TYPE health of your engines, 0–1, persisting between battles. Counter
   * fire wears engines down rather than simply destroying them: a battered
   * trebuchet fires proportionally weaker, and below SIEGE_DESTROYED_BELOW it
   * is wreckage and the count drops. Repairing costs a third of building anew,
   * which is why an artillery siege is a running expense rather than a one-off
   * purchase — and why an online defender who mends between volleys can hold.
   */
  siegeGearIntegrity: Record<SiegeGearType, number>;
  siegeCounterIntegrity: Record<CounterType, number>;
  spies: number;
  scouts: number;
  mercenaries: MercForce;
  stamina: number; // 0–100
  /** Veterancy, 0–100, one stat per corps. Each is earned by doing the work and
   *  lost with the REGULARS who die or are dismissed — hired blades neither
   *  earn it nor cost it. Engineers keep a single stat covering both the
   *  engines they push forward and the ones they man on the wall. */
  experience: number; // the line army
  siegeExperience: number; // engineers, attack and defence alike
  spyExperience: number;
  scoutExperience: number;
  /** Standing order: ride out at the besieger, or hold the wall? Cavalry are
   *  wasted behind stone and murderous in the open, so this is a real choice
   *  and not merely a toggle. */
  sortieEnabled?: boolean;
}

// ── Premium — the Royal Charter (spec/clans.md) ───────────────────────────

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
  /**
   * The ACCOUNT that founded this empire — the person, as opposed to the empire
   * they are running this age.
   *
   * An empire lasts one age and is wiped by `eraReset`; the account outlives
   * every age and lives outside the world entirely (lib/server/accounts.ts).
   * Keeping the link here rather than in a second table means "does this person
   * already rule somewhere?" is a question the world can answer by itself, and
   * that the answer resets for free when the world does.
   *
   * Absent on bots, which nobody signs in as. Server-managed; never part of
   * game rules.
   */
  accountId?: string;
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
  /** Has this empire EVER marched under a banner this age — founded, joined, or
   *  been invited in? Set on the way in and never cleared while the age runs.
   *  Disqualifies the individual victory clock permanently: leaving a clan the
   *  week before the end must not launder its vault into a solo crown. Cleared
   *  only by `eraReset`, along with everything else. */
  everJoinedClan?: boolean;
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
  turnsAvailable: number; // action turns — the army's clock
  /** The covert clock. Accrues at half the action-turn rate and caps far
   *  lower, and BOTH spies and scouts spend from it — so every turn spent
   *  scouting is a turn not spent sabotaging. */
  spyTurnsAvailable: number;
  onVacation: boolean;
  /** Cumulative turns spent on vacation this era; capped at VACATION_TICKS_PER_ERA. */
  vacationTicksUsed: number;
  /** Queued vacation: you depart automatically once every revenge window
   *  against you has closed (you can't leave while owing revenge). */
  vacationQueued?: boolean;
  /** Turn you last returned from vacation — gates the re-attack cooldown. */
  vacationEndedAtTick?: number;
  starving: boolean; // food hit 0 — empire frozen until fed

  // ── Recruitment: a 24-hour average, on the ruler's own clock ─────────────
  /** Running total of what WOULD have arrived at each tick since the last
   *  dawn, each sample already capped by free beds. Settlers are paid out as
   *  the average of these, not as one reading taken at dawn — otherwise the
   *  whole day's intake is decided by whatever you owned in the last minute
   *  before it, and buying Hearthsteads at 23:59 is the dominant strategy. */
  growthSum?: number;
  growthSamples?: number;
  /** Absolute tick of this ruler's next dawn. Absent = the old global dawn
   *  (tick % 144), which is what every pre-existing empire keeps until it
   *  chooses otherwise. */
  nextRecruitAtTick?: number;
  lastRecruitAtTick?: number;
  /** Epoch-ms of your recent posts in public rooms, trimmed to 24h. Kept on the
   *  PLAYER rather than counted from world.messages, because chat history is
   *  pruned (CHAT.CLAN_HISTORY / TOTAL_HISTORY) and a limit that quietly
   *  loosens when a room gets busy is exactly backwards. */
  chatStamps?: number[];

  /** The last covert order you gave, per arm, so the consoles can open on it.
   *  Repeating an operation was three clicks every time — pick the op, type
   *  the count, send — and repeating is the common case: you scout the same
   *  rival again, or send the same twenty spies. Kept per ARM because scouting
   *  and spying are different decisions with different op lists. */
  lastScoutOp?: string;
  lastScoutAgents?: number;
  lastSpyOp?: string;
  lastSpyAgents?: number;

  /** The dawn hour may be moved ONCE an era, so a player in Delhi and one in
   *  New York can both be awake for it. Cleared by eraReset with everything
   *  else. */
  recruitHourChanged?: boolean;

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
  /** Sow Research Doubt: the scholars lose their thread and research crawls.
   *  A scout op (Quell the Doubt) ends it early — which is the reason a
   *  research empire keeps rangers at all. */
  researchDoubtUntilTick?: number;
  /** Research levels copied FROM others this era, capped by
   *  COVERT_EFFECTS.STEAL_RESEARCH_LEVELS_PER_ERA so theft can supplement the
   *  work but never replace it. */
  stolenResearchLevels?: number;

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
  /**
   * The Collegium Examination — sat once per age.
   *
   * Progress lives HERE rather than in the browser for two reasons: a client
   * that holds its own position can jump to the end and claim the endowment,
   * and a client that holds its own answers has already been told them. The
   * page only ever learns the answer to a question the server has recorded a
   * reply to. `paid` is the idempotency latch — the endowment is one payment,
   * however many times the form is resubmitted or the tab reloaded.
   */
  exam?: {
    /** How many questions have been answered — also the current index. */
    answered: number;
    correct: number;
    /** The reply given to each answered question, for the reveal on reload. */
    given: number[];
    /** Sittings so far. A missed paper may be sat again, freely. */
    attempts?: number;
    /** Passed AND paid — the one latch that retires it for the age. */
    paid?: boolean;
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
    /** The Beacon: 0–3. Each level adds 6h to the war grace (CLAN_BEACON). */
    beaconLevel: number;
    integrity: { storage: number; hall: number; wonder: number; beacon: number }; // 0–1
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
    /** When war was declared. Both sides carry the same value, because the
     *  Beacon grace is measured from it and either side may be the one being
     *  attacked. Absent on wars declared before Beacons existed — treated as
     *  long expired, which is the safe reading for an old war. */
    declaredAtTick?: number;
    /** Tick of the last blow struck between these two clans (declaration counts
     *  as the first). A war that goes quiet for WAR.STALE_HOURS lapses. */
    lastBloodTick?: number;
  }[];
  warRecord: { wins: number; losses: number };
  /** Members silenced in the clan hall: playerId → tick the silence lifts.
   *  They keep reading — see CLAN_MUTE_DAYS. */
  chatMutedUntilTick?: Record<string, number>;
  truceWithUntilTick: Record<string, number>; // clanId → truce end (post-defeat)
  clockFrozenUntilTick?: number; // loser's victory clocks frozen 48h
  tribute?: { toClanId: string; endsAtTick: number; collectedGoldEq: number };
  friendly: string[]; // mutual friendly clans
  pendingRevenge?: { againstClanId: string; memberSnapshot: string[]; expiresAtTick: number };
  /** Petitions awaiting the Leader's or Vice's answer. */
  joinRequests?: { playerId: string; atTick: number }[];
  /** Standing invitations from the Leader or Vice — the player may walk in. */
  invites?: { playerId: string; byId: string; atTick: number }[];
  /** Players this banner has turned away. They may never petition it again —
   *  but leadership can still change its mind and invite them. */
  refused?: string[];
}

// ── Battle reports (spec/combat.md) ─────────────────────────────────────────

export interface UnitLosses {
  footmen: number;
  archers: number;
  cavalry: number;
  engineers: number;
  mercenaries: number; // aggregate across merc arm/tier — they fall as one line
  /** Sellswords paid off afterwards because the regulars who commanded them are
   *  dead. Reported separately from battle deaths so the cascade is legible:
   *  kill three regulars, cost them four soldiers. */
  mercenariesDisbanded: number;
}

/** One narrated beat of a battle, tagged so the report can colour it. Replaces
 *  the old flat string log — the whole point of the rework is that a reader can
 *  see WHERE their army died, and regular losses must not be buried in prose. */
export interface BattleLogEntry {
  round: number; // 0 = before the first round (yields, counter callouts)
  phase:
    | "prelude"
    | "counter-duel"
    | "walls"
    | "archers"
    | "cavalry"
    | "footmen"
    | "sortie"
    | "aftermath";
  text: string;
  /** Regulars lost on each side in this beat — the number that matters most. */
  attackerRegulars?: number;
  defenderRegulars?: number;
  tone?: "good" | "bad" | "neutral";
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
  /** The defender laid down arms rather than fight (outmatched, or stamina
   *  below the mercy floor). The attacker takes the stores; the defending
   *  regulars live. Never true for revenge, which offers no such mercy. */
  yielded?: boolean;
  attackerLosses: UnitLosses;
  defenderLosses: UnitLosses;
  /** The headline figure, surfaced on its own because it is the one that
   *  actually decides an era: dead regulars are dead population, they take
   *  veterancy with them, and they drag their sellswords out of service too. */
  regularsKilled: { attacker: number; defender: number };
  /** Civilians driven off by the attack itself — people flee a sacked town.
   *  Separate from, and compounding with, peasant scattering at the daily
   *  reset. Every mode causes it, bombard included: terror needs no swordsman. */
  civiliansDisplaced: number;
  wallIntegrityDamage: number; // fraction of defender's wall destroyed
  /** Buildings cracked open beyond the walls (integrity lost each). */
  buildingDamage?: { building: BuildingId; integrityLost: number }[];
  /** Engines wrecked outright, both ways — the counter duel bites both sides. */
  siegeGearLost: Partial<Record<SiegeGearType, number>>; // attacker's
  siegeCountersLost?: Partial<Record<CounterType, number>>; // defender's
  /** Engine health worn away but repairable, 0–1 per type. The running cost of
   *  a siege campaign, and the reason an online defender can hold out. */
  siegeGearWorn?: Partial<Record<SiegeGearType, number>>;
  siegeCountersWorn?: Partial<Record<CounterType, number>>;
  /** The defender's battery fell silent — 70% wrecked AND outgunned. */
  batterySilenced?: boolean;
  /** The defender rode out at the siege lines rather than hold the wall. */
  sortied?: boolean;
  /** Troops who came over the wall by grapple, ladder and tower — how much of
   *  the wall's edge was bypassed, and by what. */
  escalade?: { grappled: number; laddered: number; towered: number };
  loot: { gold: number; resources: Record<Resource, number> };
  staminaLoss: { attacker: number; defender: number };
  experienceChange: { attacker: number; defender: number };
  siegeExperienceChange?: { attacker: number; defender: number };
  log: BattleLogEntry[];
}

// ── Market (spec/empire.md) ─────────────────────────────────────────────────

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
  /**
   * The Bazaar's cut on THIS caravan, fixed when it was posted.
   *
   * Carried on the order rather than read from the seller at sale time for two
   * reasons. Practically, `buyFromMarket` works off the order book alone and has
   * no seller Player to consult. Design-wise it is the better rule anyway: the
   * terms are struck when the caravan sets out, so finishing The Merchants'
   * Charter does not retroactively re-cut every load already on the road — and
   * a seller cannot be made worse off by anything that happens after posting.
   *
   * Absent on orders posted before the Charter existed — treated as MARKET_FEE.
   */
  feeRate?: number;
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
  return {
    footmen: emptyTroopCounts(),
    archers: emptyTroopCounts(),
    cavalry: emptyTroopCounts(),
    engineers: 0,
    spies: 0,
    scouts: 0,
  };
}

export function emptySiegeCounters(): Record<CounterType, number> {
  return {
    billhooks: 0,
    forkpoles: 0,
    fire_pots: 0,
    boiling_oil: 0,
    hoardings: 0,
    counter_engine: 0,
  };
}

export function emptySiegeGear(): Record<SiegeGearType, number> {
  return { ropes: 0, ladders: 0, siege_towers: 0, rams: 0, ballistae: 0, trebuchets: 0 };
}

/** Engines start whole. Integrity is per TYPE, not per engine — a fleet of
 *  trebuchets wears down together. */
export function fullGearIntegrity(): Record<SiegeGearType, number> {
  return { ropes: 1, ladders: 1, siege_towers: 1, rams: 1, ballistae: 1, trebuchets: 1 };
}

export function fullCounterIntegrity(): Record<CounterType, number> {
  return { billhooks: 1, forkpoles: 1, fire_pots: 1, boiling_oil: 1, hoardings: 1, counter_engine: 1 };
}

/** Hired blades in the battle line — the arms that hold ground. */
export function mercTroops(m: MercForce): number {
  return troopTotal(m.footmen) + troopTotal(m.archers) + troopTotal(m.cavalry);
}

/** Hired blades that need a barracks bed: the line plus the engine crews. */
export function mercMilitary(m: MercForce): number {
  return mercTroops(m) + m.engineers;
}

/** Every sellsword on the payroll, covert agents included — the upkeep bill. */
export function mercTotal(m: MercForce): number {
  return mercMilitary(m) + m.spies + m.scouts;
}

/** Regulars of one merc-able arm — the figure that caps its sellswords. When
 *  these die, the sellswords above the ratio are paid off and leave. */
export function regularsOfArm(p: Player, arm: MercArm): number {
  switch (arm) {
    case "footman":
      return troopTotal(p.army.footmen);
    case "archer":
      return troopTotal(p.army.archers);
    case "cavalry":
      return troopTotal(p.army.cavalry);
    case "engineer":
      return p.army.siegeEngineers;
    case "spy":
      return p.army.spies;
    case "scout":
      return p.army.scouts;
  }
}

/** Sellswords currently serving in one arm. */
export function mercsOfArm(p: Player, arm: MercArm): number {
  const m = p.army.mercenaries;
  switch (arm) {
    case "footman":
      return troopTotal(m.footmen);
    case "archer":
      return troopTotal(m.archers);
    case "cavalry":
      return troopTotal(m.cavalry);
    case "engineer":
      return m.engineers;
    case "spy":
      return m.spies;
    case "scout":
      return m.scouts;
  }
}

/**
 * Fill in anything a Player is missing so the engine can assume a complete
 * shape. The combat rework was shipped with a world wipe, so this no longer
 * migrates legacy saves — it exists to give bots, fixtures and hand-built test
 * players sane defaults without every call site listing them. Idempotent.
 */
export function normalizePlayer(p: Player): Player {
  const a = p.army;
  if (!a.mercenaries) a.mercenaries = emptyMercForce();
  a.mercenaries.engineers ??= 0;
  a.mercenaries.spies ??= 0;
  a.mercenaries.scouts ??= 0;
  if (!a.siegeCounters) a.siegeCounters = emptySiegeCounters();
  if (!a.siegeGear) a.siegeGear = emptySiegeGear();
  if (!a.siegeGearIntegrity) a.siegeGearIntegrity = fullGearIntegrity();
  if (!a.siegeCounterIntegrity) a.siegeCounterIntegrity = fullCounterIntegrity();
  a.experience ??= 0;
  a.siegeExperience ??= 0;
  a.spyExperience ??= 0;
  a.scoutExperience ??= 0;
  p.spyTurnsAvailable ??= 0;
  p.onVacation ??= false;
  p.vacationTicksUsed ??= 0;
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

/**
 * The battle line: regular footmen, archers and cavalry. No mercenaries, no
 * engineers, no specialists.
 *
 * This is the victory floor's measure (ARMY_FLOORS). Mercenaries are excluded
 * because gold should not buy a throne — sellswords are hired in an afternoon
 * and disband the moment the regulars commanding them die. Engineers are
 * excluded because a siege park is a different achievement from an army, and
 * the crown is meant to ask for the one thing that is genuinely expensive to
 * build and genuinely painful to lose.
 */
export function regularTroops(p: Player): number {
  return troopTotal(p.army.footmen) + troopTotal(p.army.archers) + troopTotal(p.army.cavalry);
}

/** Total population = civilians + regular military. Mercenaries never count —
 *  they are not your people, they are on your payroll. */
export function totalPopulation(p: Player): number {
  return civilians(p) + military(p);
}

/** Everyone under arms who makes a farmer feel safe — regulars AND sellswords.
 *  This is the figure the peasant-scattering floor is measured against: a hired
 *  blade on the gate reassures just as well as a levyman. */
export function guardStrength(p: Player): number {
  return military(p) + mercMilitary(p.army.mercenaries);
}

export function level(p: Player, id: BuildingId): number {
  // Saves from before a building existed have no entry — and some very old
  // ones have no `buildings` map at all. Absent means level 0, everywhere.
  return p.buildings?.[id] ?? 0;
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

/** A structure's soundness, 0–1 — like buildingIntegrity, but the Walls keep
 *  theirs on their own field, so this is the one to ask when you mean "is this
 *  thing whole?" for ANY structure. */
export function structureIntegrity(p: Player, id: BuildingId): number {
  return id === "walls" ? p.wallIntegrity : buildingIntegrity(p, id);
}

export function researchLevel(p: Player, field: ResearchField): number {
  return p.research.levels[field] ?? 0;
}

/**
 * What one storehouse actually protects, for THIS empire — the building's curve
 * lifted by Granarycraft. Integrity is NOT applied: some callers want the sound
 * capacity (what a Bank-all would fill) and some want the damaged one, so they
 * multiply by `buildingIntegrity` themselves.
 *
 * Shelter stopped being a pure function of level the moment research could move
 * it, and there are seven call sites that ask this question. This is the one
 * place that knows the answer — an eighth caller reaching for
 * `storageShelterAtLevel` directly would silently ignore the research a player
 * paid for.
 */
export function shelterCapacity(p: Player, building: BuildingId): number {
  const base = shelterAtLevel(building, level(p, building));
  const perLevel = RESEARCH_EFFECT_PER_LEVEL.granarycraft ?? EFFECT_PER_LEVEL;
  return base * (1 + researchLevel(p, "granarycraft") * perLevel);
}

/** Total research levels earned across every field — the ordinal that drives the
 *  global progressive research cost (spec/empire.md). */
export function totalResearchLevels(p: Player): number {
  return Object.values(p.research.levels).reduce((a, b) => a + (b ?? 0), 0);
}
