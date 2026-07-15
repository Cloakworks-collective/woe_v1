// Clan operations (spec/clans.md): ledgered storage with the 3× rule,
// churn rules (forfeit, 48h cooldown, 2 departures/era), buildings, wars.

import {
  BUILD_COSTS,
  CHURN,
  FOUNDING_MEMBERS,
  HALL,
  STORAGE_CAP_PER_LEVEL,
  TICKS_PER_HOUR,
  WAR,
  WITHDRAW_MULTIPLE,
  WONDER_REQUIRES_STORAGE,
} from "../constants";
import {
  EngineError,
  type Clan,
  type ClanResource,
  type Player,
} from "./types";

const ZERO: Record<ClanResource, number> = { gold: 0, food: 0, wood: 0, stone: 0, ore: 0 };

export function newClan(id: string, name: string, leader: Player): Clan {
  return {
    id,
    name,
    leaderId: leader.id,
    officerIds: [],
    members: [leader.id],
    buildings: {
      storageLevel: 0,
      hallLevel: 1,
      wonderLevel: 0,
      integrity: { storage: 1, hall: 1, wonder: 1 },
    },
    storage: { ...ZERO },
    memberLedger: {},
    wars: [],
    warRecord: { wins: 0, losses: 0 },
    truceWithUntilTick: {},
    friendly: [],
  };
}

export function memberCap(clan: Clan): number {
  return HALL[clan.buildings.hallLevel - 1]?.memberCap ?? FOUNDING_MEMBERS;
}

/** Tax-penalty factor felt by members (1.0 → 0.5 at Hall 4), integrity-scaled. */
export function hallPenaltyFactor(clan: Clan | undefined): number {
  if (!clan) return 1;
  const felt = HALL[clan.buildings.hallLevel - 1]?.taxPenaltyFelt ?? 1;
  // A wrecked hall shelters no one: blend toward 1.0 as integrity drops.
  const i = clan.buildings.integrity.hall;
  return 1 - (1 - felt) * i;
}

/** Cost discount from the Clan Wonder (mercs, troops, siege gear). */
export function wonderDiscount(clan: Clan | undefined): number {
  if (!clan) return 0;
  return 0.1 * clan.buildings.wonderLevel * clan.buildings.integrity.wonder;
}

export function isLeadership(clan: Clan, playerId: string): boolean {
  return (
    clan.leaderId === playerId ||
    clan.viceLeaderId === playerId ||
    clan.officerIds.includes(playerId)
  );
}

function ledger(clan: Clan, playerId: string) {
  if (!clan.memberLedger[playerId]) {
    clan.memberLedger[playerId] = { deposited: { ...ZERO }, withdrawn: { ...ZERO } };
  }
  return clan.memberLedger[playerId];
}

// ── Membership churn ────────────────────────────────────────────────────────

export function canJoin(player: Player, clan: Clan, currentTick: number): string | null {
  if (player.clanId) return "Leave your current clan first.";
  if (player.clanDepartures >= CHURN.MAX_DEPARTURES_PER_ERA) {
    return "Twice departed — no clan will have you until the era turns.";
  }
  if ((player.clanJoinableAtTick ?? 0) > currentTick) {
    return "The 48-hour cooldown after your departure still holds.";
  }
  if (clan.members.length >= memberCap(clan)) return "That clan's Hall is full.";
  return null;
}

export function joinClan(playerIn: Player, clanIn: Clan, currentTick: number): { player: Player; clan: Clan } {
  const err = canJoin(playerIn, clanIn, currentTick);
  if (err) throw new EngineError("join", err);
  const player = structuredClone(playerIn);
  const clan = structuredClone(clanIn);
  player.clanId = clan.id;
  clan.members.push(player.id);
  // Rejoining starts the lifetime-deposit counter at zero (forfeiture is final).
  clan.memberLedger[player.id] = { deposited: { ...ZERO }, withdrawn: { ...ZERO } };
  return { player, clan };
}

/** Leave or be kicked: deposits forfeited, 48h cooldown, counts toward 2/era. */
export function departClan(
  playerIn: Player,
  clanIn: Clan,
  currentTick: number,
): { player: Player; clan: Clan } {
  const player = structuredClone(playerIn);
  const clan = structuredClone(clanIn);
  if (player.clanId !== clan.id) throw new EngineError("clan", "Not a member");
  if (clan.leaderId === player.id && clan.members.length > 1) {
    throw new EngineError("leader", "The leader must pass the mantle before leaving");
  }
  clan.members = clan.members.filter((m) => m !== player.id);
  clan.officerIds = clan.officerIds.filter((m) => m !== player.id);
  if (clan.viceLeaderId === player.id) clan.viceLeaderId = undefined;
  delete clan.memberLedger[player.id]; // forfeited — resources stay in storage
  player.clanId = undefined;
  player.clanDepartures += 1;
  player.clanJoinableAtTick = currentTick + CHURN.REJOIN_COOLDOWN_HOURS * TICKS_PER_HOUR;
  return { player, clan };
}

// ── Storage ─────────────────────────────────────────────────────────────────

export function depositToClan(
  playerIn: Player,
  clanIn: Clan,
  what: ClanResource,
  amount: number,
): { player: Player; clan: Clan } {
  if (!Number.isInteger(amount) || amount <= 0) throw new EngineError("amount", "Invalid amount");
  const player = structuredClone(playerIn);
  const clan = structuredClone(clanIn);
  if (player.clanId !== clan.id) throw new EngineError("clan", "Not a member");
  const cap = STORAGE_CAP_PER_LEVEL * clan.buildings.storageLevel * clan.buildings.integrity.storage;
  if (clan.buildings.storageLevel === 0) throw new EngineError("storage", "The clan has no Storage yet");
  if (clan.storage[what] + amount > cap) throw new EngineError("cap", "Clan Storage is full");
  if (what === "gold") {
    if (player.gold < amount) throw new EngineError("gold", "Not enough gold");
    player.gold -= amount;
  } else {
    if (player.resources[what] < amount) throw new EngineError("resource", `Not enough ${what}`);
    player.resources[what] -= amount;
  }
  clan.storage[what] += amount;
  ledger(clan, player.id).deposited[what] += amount;
  return { player, clan };
}

export function withdrawableNow(clan: Clan, playerId: string, what: ClanResource): number {
  const l = clan.memberLedger[playerId];
  if (!l) return 0;
  return Math.max(0, WITHDRAW_MULTIPLE * l.deposited[what] - l.withdrawn[what]);
}

export function withdrawFromClan(
  playerIn: Player,
  clanIn: Clan,
  what: ClanResource,
  amount: number,
): { player: Player; clan: Clan } {
  if (!Number.isInteger(amount) || amount <= 0) throw new EngineError("amount", "Invalid amount");
  const player = structuredClone(playerIn);
  const clan = structuredClone(clanIn);
  if (player.clanId !== clan.id) throw new EngineError("clan", "Not a member");
  if (clan.storage[what] < amount) throw new EngineError("storage", "The pool runs dry");
  if (withdrawableNow(clan, player.id, what) < amount) {
    throw new EngineError("ledger", "The 3× rule: you may withdraw only triple what you have donated");
  }
  clan.storage[what] -= amount;
  ledger(clan, player.id).withdrawn[what] += amount;
  if (what === "gold") player.gold += amount;
  else player.resources[what] += amount;
  return { player, clan };
}

// ── Clan buildings (leadership only; paid from the pool, bypasses the 3× cap) ─

export function buildClanBuilding(
  clanIn: Clan,
  builderId: string,
  which: "storage" | "hall" | "wonder",
): Clan {
  const clan = structuredClone(clanIn);
  if (!isLeadership(clan, builderId)) {
    throw new EngineError("rank", "Only the five leadership positions may build");
  }
  let cost: { gold: number; each: number };
  if (which === "storage") {
    const next = clan.buildings.storageLevel + 1;
    if (next > 10) throw new EngineError("max", "Storage is at its zenith");
    cost = BUILD_COSTS.storage(next);
  } else if (which === "hall") {
    const next = clan.buildings.hallLevel + 1;
    if (next > 4) throw new EngineError("max", "The Hall is at its zenith");
    cost = BUILD_COSTS.hall[next]!;
  } else {
    const next = clan.buildings.wonderLevel + 1;
    if (next > 3) throw new EngineError("max", "The Wonder is complete");
    const reqStorage = WONDER_REQUIRES_STORAGE[next as 1 | 2 | 3];
    if (clan.buildings.storageLevel < reqStorage) {
      throw new EngineError("req", `Wonder ${next} requires Clan Storage ${reqStorage}`);
    }
    cost = BUILD_COSTS.wonder[next]!;
  }
  if (clan.storage.gold < cost.gold) throw new EngineError("gold", "The pool lacks gold");
  for (const r of ["wood", "stone", "ore"] as const) {
    if (clan.storage[r] < cost.each) throw new EngineError(r, `The pool lacks ${r}`);
  }
  clan.storage.gold -= cost.gold;
  clan.storage.wood -= cost.each;
  clan.storage.stone -= cost.each;
  clan.storage.ore -= cost.each;
  if (which === "storage") clan.buildings.storageLevel += 1;
  else if (which === "hall") clan.buildings.hallLevel += 1;
  else clan.buildings.wonderLevel += 1;
  return clan;
}

// ── War ─────────────────────────────────────────────────────────────────────

export function declareWar(clanIn: Clan, targetId: string, currentTick: number): Clan {
  const clan = structuredClone(clanIn);
  if (clan.wars.some((w) => w.clanId === targetId)) throw new EngineError("war", "Already at war");
  if ((clan.truceWithUntilTick[targetId] ?? 0) > currentTick) {
    throw new EngineError("truce", "The truce still holds — you cannot re-declare yet");
  }
  clan.wars.push({ clanId: targetId, regularKills: 0, regularLosses: 0 });
  clan.friendly = clan.friendly.filter((f) => f !== targetId);
  return clan;
}

export function atWar(a: Clan | undefined, b: Clan | undefined): boolean {
  if (!a || !b) return false;
  return a.wars.some((w) => w.clanId === b.id);
}

/**
 * Record battle kills between warring clans; returns "victory" when the
 * net-kill threshold (+200 regulars) is crossed.
 */
export function recordWarKills(
  oursIn: Clan,
  theirsIn: Clan,
  ourKills: number,
  ourLosses: number,
  currentTick: number,
): { ours: Clan; theirs: Clan; victory: boolean } {
  const ours = structuredClone(oursIn);
  const theirs = structuredClone(theirsIn);
  const w1 = ours.wars.find((w) => w.clanId === theirs.id);
  const w2 = theirs.wars.find((w) => w.clanId === ours.id) ??
    // wars are mutual even if only one side declared
    (theirs.wars.push({ clanId: ours.id, regularKills: 0, regularLosses: 0 }),
    theirs.wars[theirs.wars.length - 1]);
  if (!w1) throw new EngineError("war", "Not at war");
  w1.regularKills += ourKills;
  w1.regularLosses += ourLosses;
  w2.regularKills += ourLosses;
  w2.regularLosses += ourKills;

  if (w1.regularKills - w1.regularLosses >= WAR.NET_REGULAR_KILLS_TO_WIN) {
    // Victory: end the war, set truce + frozen clocks + tribute siphon.
    ours.wars = ours.wars.filter((w) => w.clanId !== theirs.id);
    theirs.wars = theirs.wars.filter((w) => w.clanId !== ours.id);
    ours.warRecord.wins += 1;
    theirs.warRecord.losses += 1;
    const truceEnd = currentTick + WAR.TRUCE_HOURS * TICKS_PER_HOUR;
    ours.truceWithUntilTick[theirs.id] = truceEnd;
    theirs.truceWithUntilTick[ours.id] = truceEnd;
    theirs.clockFrozenUntilTick = truceEnd;
    theirs.tribute = {
      toClanId: ours.id,
      endsAtTick: currentTick + WAR.TRIBUTE_TURNS,
      collectedGoldEq: 0,
    };
    return { ours, theirs, victory: true };
  }
  return { ours, theirs, victory: false };
}
