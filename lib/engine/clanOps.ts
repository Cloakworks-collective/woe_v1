// Clan operations (spec/clans.md): ledgered storage with the 3× rule,
// churn rules (forfeit, 48h cooldown, 2 departures/era), buildings, wars.

import {
  BUILD_COSTS,
  CHURN,
  CLAN_REPAIR_COST_FACTOR,
  FOUNDING_MEMBERS,
  HALL,
  LEADERSHIP,
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

export type ClanRole = "leader" | "vice" | "officer" | "member";

/** Rank as a number for outranks comparisons: leader 3 > vice 2 > officer 1 > member 0. */
export function clanRank(clan: Clan, playerId: string): number {
  if (clan.leaderId === playerId) return 3;
  if (clan.viceLeaderId === playerId) return 2;
  if (clan.officerIds.includes(playerId)) return 1;
  return 0;
}

export function clanRoleOf(clan: Clan, playerId: string): ClanRole {
  return (["member", "officer", "vice", "leader"] as const)[clanRank(clan, playerId)];
}

// ── Leadership appointments (leader only) ────────────────────────────────────

/**
 * Appoint a member to a role (or demote to plain member). Leader only. Honours
 * the LEADERSHIP caps (one Vice, three Officers). The leader's own seat is moved
 * only via transferLeadership.
 */
export function setMemberRole(
  clanIn: Clan,
  actorId: string,
  targetId: string,
  role: "vice" | "officer" | "member",
): Clan {
  const clan = structuredClone(clanIn);
  if (clan.leaderId !== actorId) throw new EngineError("rank", "Only the Leader may appoint roles");
  if (targetId === clan.leaderId) throw new EngineError("rank", "Pass the mantle to change the Leader");
  if (!clan.members.includes(targetId)) throw new EngineError("member", "Not a member of this clan");
  // Strip any current seat first, then seat as requested.
  clan.officerIds = clan.officerIds.filter((o) => o !== targetId);
  if (clan.viceLeaderId === targetId) clan.viceLeaderId = undefined;
  if (role === "vice") {
    if (clan.viceLeaderId) throw new EngineError("cap", "There is already a Vice — demote them first");
    clan.viceLeaderId = targetId;
  } else if (role === "officer") {
    if (clan.officerIds.length >= LEADERSHIP.OFFICERS) {
      throw new EngineError("cap", `A clan may name only ${LEADERSHIP.OFFICERS} Officers`);
    }
    clan.officerIds.push(targetId);
  }
  return clan;
}

/** Hand the leadership to another member; the former leader steps down to a
 *  plain member (the new leader may re-appoint them). Leader only. */
export function transferLeadership(clanIn: Clan, actorId: string, targetId: string): Clan {
  const clan = structuredClone(clanIn);
  if (clan.leaderId !== actorId) throw new EngineError("rank", "Only the Leader may pass the mantle");
  if (targetId === actorId) throw new EngineError("target", "You already hold the mantle");
  if (!clan.members.includes(targetId)) throw new EngineError("member", "Not a member of this clan");
  clan.officerIds = clan.officerIds.filter((o) => o !== targetId);
  if (clan.viceLeaderId === targetId) clan.viceLeaderId = undefined;
  clan.leaderId = targetId;
  return clan;
}

// ── Repair (leadership only; paid from the pool) ─────────────────────────────

/** Gold + each (wood/stone/ore) to mend a bombarded work back to full. Zero when
 *  whole or unbuilt. UI and engine share this so the quoted price is the paid one. */
export function clanRepairCost(clan: Clan, which: "storage" | "hall" | "wonder"): { gold: number; each: number } {
  const integ = clan.buildings.integrity[which];
  const level =
    which === "storage" ? clan.buildings.storageLevel : which === "hall" ? clan.buildings.hallLevel : clan.buildings.wonderLevel;
  if (integ >= 1 || level <= 0) return { gold: 0, each: 0 };
  const base = which === "storage" ? BUILD_COSTS.storage(level) : which === "hall" ? BUILD_COSTS.hall[level]! : BUILD_COSTS.wonder[level]!;
  const dmg = 1 - integ;
  return {
    gold: Math.ceil(base.gold * dmg * CLAN_REPAIR_COST_FACTOR),
    each: Math.ceil(base.each * dmg * CLAN_REPAIR_COST_FACTOR),
  };
}

export function repairClanBuilding(clanIn: Clan, actorId: string, which: "storage" | "hall" | "wonder"): Clan {
  const clan = structuredClone(clanIn);
  if (!isLeadership(clan, actorId)) throw new EngineError("rank", "Only leadership may order repairs");
  if (clan.buildings.integrity[which] >= 1) throw new EngineError("repair", "That structure stands whole");
  const level =
    which === "storage" ? clan.buildings.storageLevel : which === "hall" ? clan.buildings.hallLevel : clan.buildings.wonderLevel;
  if (level <= 0) throw new EngineError("repair", "Nothing built to mend");
  const cost = clanRepairCost(clan, which);
  if (clan.storage.gold < cost.gold) throw new EngineError("gold", "The pool lacks gold to mend it");
  for (const r of ["wood", "stone", "ore"] as const) {
    if (clan.storage[r] < cost.each) throw new EngineError(r, `The pool lacks ${r} to mend it`);
  }
  clan.storage.gold -= cost.gold;
  clan.storage.wood -= cost.each;
  clan.storage.stone -= cost.each;
  clan.storage.ore -= cost.each;
  clan.buildings.integrity[which] = 1;
  return clan;
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
  // Walking through the gate settles every question at it.
  clan.joinRequests = (clan.joinRequests ?? []).filter((r) => r.playerId !== player.id);
  clan.invites = (clan.invites ?? []).filter((i) => i.playerId !== player.id);
  clan.refused = (clan.refused ?? []).filter((id) => id !== player.id);
  return { player, clan };
}

// ── Petitions & invitations ─────────────────────────────────────────────────
//
// A banner is not walked into: a player petitions, and the Leader or Vice
// answers. Officers may kick, but they may not admit. A refused petitioner is
// turned away for good — though leadership may still invite them later, which
// is the deliberate escape hatch for a change of heart.

/** Only the Leader and Vice may admit, refuse, or invite. */
export function canAdmit(clan: Clan, playerId: string): boolean {
  return clan.leaderId === playerId || clan.viceLeaderId === playerId;
}

export function hasRequested(clan: Clan, playerId: string): boolean {
  return (clan.joinRequests ?? []).some((r) => r.playerId === playerId);
}

export function isRefused(clan: Clan, playerId: string): boolean {
  return (clan.refused ?? []).includes(playerId);
}

export function invitedTo(clan: Clan, playerId: string): boolean {
  return (clan.invites ?? []).some((i) => i.playerId === playerId);
}

/** Why this player can't petition this banner right now, or null if they may. */
export function canRequestJoin(player: Player, clan: Clan, currentTick: number): string | null {
  if (isRefused(clan, player.id)) return "This banner has turned you away — you cannot petition it again.";
  if (hasRequested(clan, player.id)) return "Your petition already awaits their answer.";
  return canJoin(player, clan, currentTick);
}

export function requestToJoin(playerIn: Player, clanIn: Clan, currentTick: number): Clan {
  const err = canRequestJoin(playerIn, clanIn, currentTick);
  if (err) throw new EngineError("request", err);
  const clan = structuredClone(clanIn);
  (clan.joinRequests ??= []).push({ playerId: playerIn.id, atTick: currentTick });
  return clan;
}

/** Withdraw your own petition — not a refusal, so you may petition again. */
export function withdrawJoinRequest(clanIn: Clan, playerId: string): Clan {
  const clan = structuredClone(clanIn);
  if (!hasRequested(clan, playerId)) throw new EngineError("request", "You have no petition before this banner");
  clan.joinRequests = (clan.joinRequests ?? []).filter((r) => r.playerId !== playerId);
  return clan;
}

/** Leader or Vice admits a petitioner. */
export function acceptJoinRequest(
  playerIn: Player,
  clanIn: Clan,
  actorId: string,
  currentTick: number,
): { player: Player; clan: Clan } {
  if (!canAdmit(clanIn, actorId)) throw new EngineError("rank", "Only the Leader or Vice-Leader may admit members");
  if (!hasRequested(clanIn, playerIn.id)) throw new EngineError("request", "No such petition");
  return joinClan(playerIn, clanIn, currentTick);
}

/** Leader or Vice refuses a petitioner — for good. */
export function denyJoinRequest(clanIn: Clan, actorId: string, targetId: string): Clan {
  if (!canAdmit(clanIn, actorId)) throw new EngineError("rank", "Only the Leader or Vice-Leader may refuse petitions");
  if (!hasRequested(clanIn, targetId)) throw new EngineError("request", "No such petition");
  const clan = structuredClone(clanIn);
  clan.joinRequests = (clan.joinRequests ?? []).filter((r) => r.playerId !== targetId);
  (clan.refused ??= []).push(targetId);
  return clan;
}

/** Leader or Vice invites a player to walk in. Works even on the refused. */
export function invitePlayer(clanIn: Clan, actorId: string, target: Player, currentTick: number): Clan {
  if (!canAdmit(clanIn, actorId)) throw new EngineError("rank", "Only the Leader or Vice-Leader may invite");
  if (target.clanId) throw new EngineError("target", "They already march under a banner");
  if (invitedTo(clanIn, target.id)) throw new EngineError("invite", "They already hold your invitation");
  if (clanIn.members.length >= memberCap(clanIn)) throw new EngineError("cap", "Your Hall is full");
  const clan = structuredClone(clanIn);
  // An invitation is leadership changing its mind — it lifts an earlier refusal
  // and answers any petition of theirs still standing.
  clan.refused = (clan.refused ?? []).filter((id) => id !== target.id);
  clan.joinRequests = (clan.joinRequests ?? []).filter((r) => r.playerId !== target.id);
  (clan.invites ??= []).push({ playerId: target.id, byId: actorId, atTick: currentTick });
  return clan;
}

export function acceptInvite(playerIn: Player, clanIn: Clan, currentTick: number): { player: Player; clan: Clan } {
  if (!invitedTo(clanIn, playerIn.id)) throw new EngineError("invite", "You hold no invitation from this banner");
  return joinClan(playerIn, clanIn, currentTick);
}

export function declineInvite(clanIn: Clan, playerId: string): Clan {
  const clan = structuredClone(clanIn);
  clan.invites = (clan.invites ?? []).filter((i) => i.playerId !== playerId);
  return clan;
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

/** The four resources a clan work is paid in — no food. */
const WORK_COSTS = ["gold", "wood", "stone", "ore"] as const;
type WorkResource = (typeof WORK_COSTS)[number];

const held = (p: Player, r: WorkResource): number => (r === "gold" ? p.gold : p.resources[r]);

function spend(p: Player, r: WorkResource, n: number): void {
  if (r === "gold") p.gold -= n;
  else p.resources[r] -= n;
}

/** How a raise would be paid: the pool first, the builder's own purse for the
 *  rest. Exported so the UI can quote the exact split before the button is
 *  pressed — and `short` names anything neither can cover. */
export function clanBuildFunding(
  clan: Clan,
  builder: Player,
  cost: { gold: number; each: number },
): {
  pool: Record<WorkResource, number>;
  own: Record<WorkResource, number>;
  short: Record<WorkResource, number>;
  affordable: boolean;
} {
  const pool = {} as Record<WorkResource, number>;
  const own = {} as Record<WorkResource, number>;
  const short = {} as Record<WorkResource, number>;
  for (const r of WORK_COSTS) {
    const need = r === "gold" ? cost.gold : cost.each;
    pool[r] = Math.min(clan.storage[r], need);
    const rest = need - pool[r];
    own[r] = Math.min(held(builder, r), rest);
    short[r] = rest - own[r];
  }
  return { pool, own, short, affordable: WORK_COSTS.every((r) => short[r] <= 0) };
}

export function buildClanBuilding(
  clanIn: Clan,
  builderIn: Player,
  which: "storage" | "hall" | "wonder",
): { player: Player; clan: Clan } {
  const clan = structuredClone(clanIn);
  const builder = structuredClone(builderIn);
  if (!isLeadership(clan, builder.id)) {
    throw new EngineError("rank", "Only the five leadership positions may build");
  }
  // Same rule as a player's own works: mend a cracked one before raising it.
  const built =
    which === "storage" ? clan.buildings.storageLevel : which === "hall" ? clan.buildings.hallLevel : clan.buildings.wonderLevel;
  if (built > 0 && clan.buildings.integrity[which] < 1) {
    throw new EngineError("damaged", "Repair it to full before raising it higher");
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
  // The pool pays as far as it reaches; the builder makes up the rest out of
  // their own stores. Priced in full BEFORE anything is deducted, so a shortfall
  // in the last resource can't leave the first ones already spent.
  const funding = clanBuildFunding(clan, builder, cost);
  if (!funding.affordable) {
    const r = WORK_COSTS.find((k) => funding.short[k] > 0)!;
    throw new EngineError(r, `The pool and your own ${r} together fall short`);
  }
  for (const r of WORK_COSTS) {
    clan.storage[r] -= funding.pool[r];
    spend(builder, r, funding.own[r]);
  }

  if (which === "storage") clan.buildings.storageLevel += 1;
  else if (which === "hall") clan.buildings.hallLevel += 1;
  else clan.buildings.wonderLevel += 1;
  return { player: builder, clan };
}

// ── War ─────────────────────────────────────────────────────────────────────

export function declareWar(clanIn: Clan, targetId: string, currentTick: number): Clan {
  const clan = structuredClone(clanIn);
  if (clan.wars.some((w) => w.clanId === targetId)) throw new EngineError("war", "Already at war");
  if ((clan.truceWithUntilTick[targetId] ?? 0) > currentTick) {
    throw new EngineError("truce", "The truce still holds — you cannot re-declare yet");
  }
  clan.wars.push({ clanId: targetId, regularKills: 0, regularLosses: 0, lastBloodTick: currentTick });
  clan.friendly = clan.friendly.filter((f) => f !== targetId);
  return clan;
}

/**
 * A war nobody is fighting should not sit on the books forever. If no blow has
 * landed between the two clans for WAR.STALE_HOURS, the war lapses.
 *
 * Whoever is ahead on net regular kills takes the win — they did, after all,
 * win the fighting that happened — and the loser serves the usual truce and
 * frozen clocks. But a lapsed war pays **no tribute and no experience**: those
 * spoils belong to a decisive +200 victory, and handing them out for a war that
 * went quiet would make "declare, land one kill, disappear" a farming strategy.
 *
 * With no data to judge on — no kills either way, or a dead-even tally — it
 * simply ends. No winner, no loser, nothing on either clan's record.
 */
export function lapseStaleWar(
  aIn: Clan,
  bIn: Clan,
  currentTick: number,
): { a: Clan; b: Clan; lapsed: boolean; winner?: string } {
  const a = structuredClone(aIn);
  const b = structuredClone(bIn);
  const wa = a.wars.find((w) => w.clanId === b.id);
  if (!wa) return { a, b, lapsed: false };

  const wb = b.wars.find((w) => w.clanId === a.id);
  // Either side's record of the last blow keeps the war alive.
  const lastBlood = Math.max(wa.lastBloodTick ?? 0, wb?.lastBloodTick ?? 0);
  if (currentTick - lastBlood < WAR.STALE_HOURS * TICKS_PER_HOUR) return { a, b, lapsed: false };

  a.wars = a.wars.filter((w) => w.clanId !== b.id);
  b.wars = b.wars.filter((w) => w.clanId !== a.id);

  const net = wa.regularKills - wa.regularLosses;
  if (net === 0) return { a, b, lapsed: true }; // nothing to judge — it just ends

  const [winner, loser] = net > 0 ? [a, b] : [b, a];
  winner.warRecord.wins += 1;
  loser.warRecord.losses += 1;
  const truceEnd = currentTick + WAR.TRUCE_HOURS * TICKS_PER_HOUR;
  a.truceWithUntilTick[b.id] = truceEnd;
  b.truceWithUntilTick[a.id] = truceEnd;
  loser.clockFrozenUntilTick = truceEnd;
  return { a, b, lapsed: true, winner: winner.id };
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
  // Blood keeps the war alive — the 72h stale clock restarts from here.
  w1.lastBloodTick = currentTick;
  w2.lastBloodTick = currentTick;

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
