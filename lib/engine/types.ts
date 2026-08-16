// Core game state types (spec/architecture.md). The engine is pure:
// (state, command | tick) → (state, events). No side effects, no I/O.
// All time windows are measured in ticks (1 tick = 10 minutes, 144/day).

import type { Race } from "../constants/races";
import type { BuildingId, CounterType } from "../constants/buildings";
import type { ResearchField } from "../constants/research";
import { EFFECT_PER_LEVEL, EXPERIENCE, MAX_FIELD_LEVEL, RESEARCH_EFFECT_PER_LEVEL, shelterAtLevel } from "../constants";

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
/** Every arm you can hire, in the order the troops page offers them. Exported
 *  so a UI listing prices per arm cannot fall out of step with the type. */
export const MERC_ARMS: MercArm[] = ["footman", "archer", "cavalry", "engineer", "spy", "scout"];
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
  /**
   * The battle line's veterancy, in EXPERIENCE POINTS — a running ledger with
   * no ceiling, not a 0–100 pool. Credited for the men you kill, debited for the
   * men you lose or discharge. `veterancyBonus()` turns it into the multiplier.
   *
   * Points, not percent: 100,000 is +2%, 5,000,000 is +100%, and there is
   * nothing stopping an empire going past that. See the EXPERIENCE block in
   * battleBalance.ts for why the old proportional pool had to go.
   */
  experiencePoints: number;
  /**
   * The ENGINEERS' veterancy, on the same points ledger as the battle line —
   * credited for the crews you kill, debited for the crews you lose, no ceiling.
   * One stat covers both the engines they push forward and the ones they man on
   * the wall; `veterancyBonus()` turns it into the multiplier.
   */
  siegeExperiencePoints: number;
  spyExperience: number;
  scoutExperience: number;
  /** Standing order: ride out at the besieger, or hold the wall? Cavalry are
   *  wasted behind stone and murderous in the open, so this is a real choice
   *  and not merely a toggle. */
  sortieEnabled?: boolean;
  /**
   * Standing order for your ENGINES: spend the barrage on their battery, or on
   * the wall? See SIEGE_STANCE. Defaults to "general" when unset.
   */
  siegeStance?: "general" | "counter";
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

/**
 * One row of a report, kept STRUCTURED rather than glued into a sentence.
 *
 * A survey of the coffers is nine numbers, and as prose it arrives as a
 * 200-character run of parenthesised asides that nobody reads twice. The same
 * nine numbers in a table are read at a glance and compared between two
 * rivals — which is the entire reason you paid the turns.
 *
 * `detail` survives alongside this as the one-line summary (the tiding in your
 * chronicle, and the fallback for the ops whose result genuinely IS a
 * sentence: "Fires set — burned 4,000 wood").
 */
export interface CovertFact {
  label: string;
  value: string;
  /** The qualifier that matters — "13,870,450 unvaulted", "150,845 exposed". */
  note?: string;
}

/**
 * One covert operation, as it happened — the filed report.
 *
 * `detail` is the same sentence the attacker was shown at the time, kept
 * verbatim rather than recomputed: a scout report is a snapshot of what was
 * true when the rangers looked, and re-deriving it later would quietly replace
 * three-day-old intelligence with today's truth, which is the one thing an
 * intelligence log must never do. `facts` is the same snapshot, in columns.
 */
export interface CovertRecord {
  id: string;
  /** The tick it ran on — ages the entry and drives the 5-day window. */
  tick: number;
  arm: "spy" | "scout";
  opId: string;
  opName: string;
  targetId: string;
  targetName: string;
  sent: number;
  intercepted: number;
  /** Were you named? Only ever true for spies; scouts work in the open. */
  exposed: boolean;
  detail: string;
  /** The report proper, when the operation returned figures rather than a
   *  sentence. Rendered as a table on the intelligence desk. */
  facts?: CovertFact[];
  turnsSpent: number;
  resourcesDestroyed?: number;
  gearDestroyed?: number;
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
  /**
   * Housing was bombarded and the ruler has not been back since.
   *
   * While this is set, the day's settler samples are capped by the beds you
   * BUILT rather than the beds still standing, so a barrage that lands at three
   * in the morning costs you nothing until you are awake to answer it. Cleared
   * the moment presence is stamped — any page load, any command — and from then
   * on the damage counts in full.
   *
   * The point is that nobody should have to set an alarm to defend a number.
   * Set by the engine (bombard), cleared by the server (session/pipeline), so
   * the engine stays free of the wall clock.
   */
  roofDamageUnseen?: boolean;
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
  /** Turn the CURRENT absence began. Distinct from vacationTicksUsed, which is
   *  the era's cumulative budget: this measures THIS trip, and it is what the
   *  return shield is gated on (see vacationAwayTicks). Cleared on return. */
  vacationStartedAtTick?: number;
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

  /**
   * Every covert operation you have run, newest first, kept for
   * COVERT_LOG_DAYS.
   *
   * Intelligence was WRITE-ONLY before this: a scout report arrived as a toast
   * on the page that launched it and was gone the moment you navigated away.
   * You could pay the spy turns to learn a rival's exact muster and then have
   * no way to look at it again — the arm whose entire product is information
   * was the one arm that recorded none. Spy work had the same hole: whether an
   * op landed, what it destroyed, and whether you were named are all things
   * you need days later, when deciding whether to go back.
   *
   * On the PLAYER rather than the world: these are your reports, nobody else
   * may read them, and they die with the empire at the era reset like
   * everything else here.
   */
  covertLog?: CovertRecord[];

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
  shieldUntilTick: number; // newcomer shield, or the hour granted on returning
  // from a long vacation (see returnFromVacation); attacking drops it early
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
  /**
   * ALLIED banners, mutual by construction — an id appears here only if it
   * appears on the other clan's list too (see acceptAlliance). Declaring war
   * tears it up on both sides, and so does striking an ally's member.
   */
  friendly: string[];
  /** Alliance offers awaiting THIS clan's leadership. One per suitor. */
  allianceOffers?: { fromClanId: string; byId: string; atTick: number }[];
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

/**
 * What one side BROUGHT — the muster roll, recorded before a blow was struck.
 *
 * A report that lists only the dead cannot be read: 853 fallen is a rout or a
 * scratch depending on whether five thousand marched or nine hundred, and the
 * reader has no way to tell which. Snapshotted rather than derived from the
 * survivors, because the survivors are what is left AFTER, which is the one
 * thing the losses already tell you.
 *
 * `gear` and `counters` are the CREWED counts — engines nobody is manning are
 * lumber and were never in the battle.
 */
export interface BattleForces {
  footmen: TroopCounts;
  archers: TroopCounts;
  cavalry: TroopCounts;
  /** Hired blades, by arm — the screen in front of each rank above. */
  mercFootmen: TroopCounts;
  mercArchers: TroopCounts;
  mercCavalry: TroopCounts;
  engineers: number;
  gear: Partial<Record<SiegeGearType, number>>;
  counters: Partial<Record<CounterType, number>>;
  wallLevel: number;
  wallIntegrity: number;
  stamina: number;
  /** The veterancy multiplier as a fraction — 0.6 is +60%. */
  veterancy: number;
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
  /**
   * The share of the health each side BROUGHT that it gave up — and the entire
   * basis of the verdict: whoever lost the smaller share carried the field, a
   * tie going to the defender. Surfaced so a report can show its working rather
   * than announcing a winner and leaving the reader to take it on faith.
   */
  healthLostShare?: { attacker: number; defender: number };
  /** Who marched, on both sides, before a blow was struck. See BattleForces. */
  forces?: { attacker: BattleForces; defender: BattleForces };
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
  /**
   * Stripped off the dead of BOTH sides by whoever held the field. Separate
   * from `loot` on purpose — it comes off bodies rather than out of
   * storehouses, and revenge earns it despite carrying no loot at all.
   */
  salvage?: { gold: number; ore: number };
  loot: { gold: number; resources: Record<Resource, number> };
  staminaLoss: { attacker: number; defender: number };
  experienceChange: { attacker: number; defender: number };
  siegeExperienceChange?: { attacker: number; defender: number };
  /** MEDICINE: men the defender's surgeons pulled off the field alive —
   *  REGULARS as well as hired, since the field hospital stopped being a
   *  sellsword-only perk. Named for what it counts, which is why it is no
   *  longer `mercsRecovered`. */
  woundedRecovered?: number;
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
  | { type: "spyReport"; op: string; targetName: string; caught: boolean; detail: string; reportId?: string; opId?: string }
  | { type: "spiesCaught"; attackerName: string; executed: number; op: string }
  | { type: "sabotaged"; detail: string } // anonymous — victim sees damage, not the hand
  | { type: "scoutReport"; targetName: string; detail: string; reportId?: string; opId?: string }
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

/**
 * What a ledger of experience points is worth, as an additive bonus to BOTH
 * power and health. Continuous and uncapped: 100,000 → +2%, 5,000,000 → +100%,
 * 10,000,000 → +200%.
 *
 * The one place points become a multiplier. Everything else — the ranking score,
 * the advisor, the scout report — reads THIS rather than the raw tally, so a
 * change to the conversion moves the whole game together.
 */
export function veterancyBonus(points: number): number {
  return Math.max(0, points) / EXPERIENCE.POINTS_FOR_DOUBLE;
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
  // Empires saved under the old 0–100 pool carried `experience`. Points are a
  // different quantity on a different scale, so an old 73 must NOT be read as
  // 73 points — it is dropped and the ledger opens at nil. A deliberate reset:
  // there is no honest conversion between "73% bonus" and a lifetime tally.
  delete (a as { experience?: number }).experience;
  a.experiencePoints ??= 0;
  // Same reset as the battle line: an old 0–100 siege pool is a different
  // quantity from a points ledger, and there is no honest conversion.
  delete (a as { siegeExperience?: number }).siegeExperience;
  a.siegeExperiencePoints ??= 0;
  a.spyExperience ??= 0;
  a.scoutExperience ??= 0;
  p.spyTurnsAvailable ??= 0;
  p.onVacation ??= false;
  p.vacationTicksUsed ??= 0;
  foldRetiredResearch(p);
  roundStocks(p);
  return p;
}

/**
 * Every stock is a WHOLE number (see the ROUNDING note in tick.ts).
 *
 * The Steward's vault duty used to move `capacity − banked` into store, and the
 * shelter curve is fractional at nearly every level, so a Charter holder's vault
 * quietly accumulated a fraction of a sack. Harmless arithmetically, visible in
 * the UI — the treasury ledger compares the vault against floor(capacity) and so
 * reported "incl. 0 spilled" on a store that had never been touched.
 *
 * Floored, never rounded: the same direction the tick rounds every credit, so
 * healing the dust can never mint a unit.
 */
function roundStocks(p: Player): void {
  for (const r of ["food", "wood", "stone", "ore"] as const) {
    if (p.resources && !Number.isInteger(p.resources[r])) p.resources[r] = Math.floor(p.resources[r]);
    if (p.bankedResources && !Number.isInteger(p.bankedResources[r])) {
      p.bankedResources[r] = Math.floor(p.bankedResources[r]);
    }
  }
  if (!Number.isInteger(p.gold)) p.gold = Math.floor(p.gold);
  if (!Number.isInteger(p.bankedGold)) p.bankedGold = Math.floor(p.bankedGold);
}

/**
 * Fold Siege Accuracy back into Siegecraft.
 *
 * The two were merged into one field, so every save written before that has
 * levels — and possibly banked points — filed under an id that no longer
 * exists. Left alone the levels would simply vanish, which costs the player
 * both the effect they paid for AND ranking score (score counts research levels;
 * see rankingScore).
 *
 * Levels are SUMMED, capped at the field maximum, rather than max()'d: research
 * price is global and progressive, so a player with Siegecraft 3 and Accuracy 4
 * paid for seven levels of something and should keep seven. Banked points move
 * across for the same reason. A ruler who had both above half will lose the
 * overflow past the cap — unavoidable when two ladders become one, and the
 * generous rounding is deliberate.
 *
 * Idempotent: the retired key is deleted, so a second pass finds nothing.
 */
function foldRetiredResearch(p: Player): void {
  const r = p.research;
  if (!r) return;
  const RETIRED = "siege_accuracy" as ResearchField;
  const lv = r.levels as Record<string, number | undefined>;
  const bk = r.banked as Record<string, number | undefined>;

  if (lv[RETIRED] != null) {
    lv.siegecraft = Math.min(MAX_FIELD_LEVEL, (lv.siegecraft ?? 0) + (lv[RETIRED] ?? 0));
    delete lv[RETIRED];
  }
  if (bk[RETIRED] != null) {
    bk.siegecraft = (bk.siegecraft ?? 0) + (bk[RETIRED] ?? 0);
    delete bk[RETIRED];
  }
  // Someone studying the retired field is moved onto the one that replaced it,
  // rather than left pointing at nothing and quietly banking into a void.
  if (r.activeField === RETIRED) r.activeField = "siegecraft";
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

/**
 * THE WHOLE PURSE — loose plus vaulted.
 *
 * Everything an empire OWNS, as opposed to everything a raider could take
 * (`unbankedGold` / `unstored`, which are the exposed halves). Purchases spend
 * from here: the vault is a shelter from theft, not a separate currency.
 *
 * Before these existed, `pay` read the loose piles alone, so banked stock was
 * invisible to every build, muster and repair — you had to withdraw by hand
 * first. That was quietly fatal for a Royal Charter holder, whose Steward
 * re-vaults every loose sack each tick: they would withdraw, the Steward would
 * put it straight back, and a granary with ten million in it could not buy a
 * single Hearthstead.
 */
export function purseGold(p: Player): number {
  return p.gold + (p.bankedGold ?? 0);
}

export function purseRes(p: Player, r: Resource): number {
  return p.resources[r] + bankedRes(p)[r];
}

/**
 * Take `amount` of a resource from the purse, LOOSE FIRST.
 *
 * Loose first because loose is what a raid takes: spending it first leaves the
 * empire's remaining wealth sheltered, which is the choice a player would make
 * every time. Returns false and changes nothing when the purse is short.
 */
export function spendRes(p: Player, r: Resource, amount: number): boolean {
  if (amount <= 0) return true;
  if (purseRes(p, r) < amount) return false;
  const fromLoose = Math.min(p.resources[r], amount);
  p.resources[r] -= fromLoose;
  const rest = amount - fromLoose;
  if (rest > 0) {
    const banked = { ...bankedRes(p) };
    banked[r] -= rest;
    p.bankedResources = banked;
  }
  return true;
}

/** As `spendRes`, for coin: the Counting House is the vault. */
export function spendGold(p: Player, amount: number): boolean {
  if (amount <= 0) return true;
  if (purseGold(p) < amount) return false;
  const fromLoose = Math.min(p.gold, amount);
  p.gold -= fromLoose;
  const rest = amount - fromLoose;
  if (rest > 0) p.bankedGold -= rest;
  return true;
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
