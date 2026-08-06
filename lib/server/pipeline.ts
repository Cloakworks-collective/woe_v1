// The command pipeline (spec/architecture.md): auth happens in the caller;
// here we validate → apply (pure engine) → persist → record events.
// Used identically by API routes (cmd:*) and UI server actions.

import { randomUUID } from "node:crypto";
import {
  EngineError,
  addStandingOrder,
  applyOnboardingRewards,
  assignWorkers,
  atWar,
  bankGold,
  bankResource,
  build,
  dismissOnboarding as dismissOnboardingGrant,
  newEmpire,
  dequeueBuild,
  dequeueResearch,
  queueBuild,
  queueResearch,
  removeStandingOrder,
  buildClanBuilding,
  hireMercenaries,
  buySiegeGear,
  buySiegeCounter,
  acceptInvite,
  acceptJoinRequest,
  canJoin,
  canRequestJoin,
  clanBuildingLabel,
  clanRank,
  declineInvite,
  denyJoinRequest,
  invitePlayer,
  requestToJoin,
  withdrawJoinRequest,
  crewGear,
  declareWar,
  departClan,
  isLeadership,
  repairClanBuilding,
  setMemberRole,
  transferLeadership,
  depositToClan,
  dischargeTroops,
  trainTroops,
  military,
  newClan,
  postOrder,
  buyFromMarket,
  cancelOrder,
  clanCode,
  recordBattle,
  recordGiftFeat,
  recordSaleFeat,
  recordSpyFeat,
  newEraRecords,
  recordWarKills,
  repairBuilding,
  repairWalls,
  resolveBattle,
  resolveBombard,
  resolveClanBombard,
  restTroops,
  runScoutRecon,
  runSpyMission,
  setResearch,
  setTax,
  type OrderAction,
  type OrderCondition,
  trainScouts,
  trainSiegeEngineers,
  trainSpies,
  validateAttack,
  withdrawFromClan,
  wonderDiscount,
  type AttackMode,
  type ClanBuilding,
  type Player,
  type Resource,
  type UnitLosses,
} from "../engine";
import {
  FOUNDING_MEMBERS,
  SURRENDER_DAYS_PER_ERA,
  SURRENDER_REATTACK_COOLDOWN_TICKS,
  SURRENDER_TICKS_PER_ERA,
} from "../constants";
import type { Race } from "../constants/races";
import { dmChannel, pushBattle, pushChronicle, pushInbox, pushMessage, type World } from "./store";
import {
  ERA_PEACE_TICKS,
  REVENGE_WINDOW_TICKS,
  commitWithRetry,
  revengePendingOn,
  runDueTicks,
  updateCrown,
} from "./world";
import { forwardCommand, worldServiceEnabled } from "./worldClient";

export interface CommandResult {
  ok: boolean;
  message?: string;
  battleId?: string;
}

function regularKills(l: UnitLosses): number {
  return l.footmen + l.archers + l.cavalry + l.engineers;
}

/**
 * Apply one command to an in-memory world (no persistence — the caller commits).
 * Returns the command's result plus whether the world changed. This is the
 * shared heart of both write models:
 *   - in-process store (§14.1): wrapped in `commitWithRetry` by `runCommand`.
 *   - single-writer service (§14.2): called directly on the service's world,
 *     serialized by its queue (see `worldService/main.ts`).
 * `createEmpire` is special — it has no existing player, so it's handled before
 * the player lookup.
 */
export function applyOneCommand(
  world: World,
  playerId: string,
  name: string,
  args: Record<string, unknown>,
): { result: CommandResult; dirty: boolean } {
  runDueTicks(world); // the world moves before every command

  if (name === "createEmpire") {
    try {
      const result = createEmpireCmd(world, playerId, args);
      updateCrown(world); // a founding shifts the ladder — recompute the crown
      return { result, dirty: true };
    } catch (e) {
      if (e instanceof EngineError) return { result: { ok: false, message: e.message }, dirty: true };
      throw e;
    }
  }

  const player = world.players[playerId];
  if (!player) return { result: { ok: false, message: "No such empire." }, dirty: false };
  if (player.banned) {
    return { result: { ok: false, message: "This empire has been banished by the crown." }, dirty: false };
  }
  player.lastSeenAtMs = Date.now(); // presence for the ladder's Online column

  try {
    const result = dispatch(world, player, name, args);
    // §14.3: every command can reorder the ladder top — credit the crown-holder
    // by exact elapsed ms right now, not at the next 10-minute tick boundary.
    updateCrown(world);
    return { result: result ?? { ok: true }, dirty: true };
  } catch (e) {
    // A user-level rejection still persists the ticks that ran this pass.
    if (e instanceof EngineError) return { result: { ok: false, message: e.message }, dirty: true };
    throw e; // unexpected — bubble out (neither a conflict nor a user error)
  }
}

/**
 * Execute one command for one player. Catches EngineError into {ok:false}.
 *
 * Two write models, chosen by env:
 *   - `WORLD_SERVICE_URL` set → forward the command to the single-writer world
 *     service (§14.2), which serializes it against every other mutation.
 *   - otherwise → apply locally under optimistic concurrency (§14.1):
 *     `commitWithRetry` reloads + replays on a lost compare-and-swap.
 */
export async function runCommand(
  playerId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<CommandResult> {
  if (worldServiceEnabled()) return forwardCommand(playerId, name, args);
  return commitWithRetry<CommandResult>((world) => applyOneCommand(world, playerId, name, args));
}

const num = (v: unknown) => Math.floor(Number(v));
const str = (v: unknown) => String(v ?? "");

/**
 * Found a new empire (name uniqueness checked against the live world). The id
 * and realm token are generated by the caller (Next.js has crypto + owns the
 * session), so this stays a plain world mutation that both write models share.
 */
function createEmpireCmd(world: World, id: string, args: Record<string, unknown>): CommandResult {
  const name = str(args.name).trim().slice(0, 30);
  const race = str(args.race || "human") as Race;
  if (name.length < 2) throw new EngineError("name", "Name your empire (2+ letters).");
  if (world.players[id]) throw new EngineError("id", "That empire already exists.");
  if (Object.values(world.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new EngineError("name", "That name is taken.");
  }
  const p = newEmpire({ id, name, race, joinedAtTick: world.meta.tickNumber });
  const token = str(args.token);
  if (token) p.apiToken = token;
  world.players[id] = p;
  return { ok: true, message: "Empire founded." };
}

function dispatch(
  world: World,
  player: Player,
  name: string,
  args: Record<string, unknown>,
): CommandResult | void {
  const tick = world.meta.tickNumber;
  const clan = player.clanId ? world.clans[player.clanId] : undefined;
  const put = (p: Player) => (world.players[p.id] = p);

  switch (name) {
    // ── Account / session mutations (routed through the writer in §14.2) ──
    case "syncPlayer": {
      // Page-load housekeeping that must pass through the single writer: backfill
      // a realm token (generated by the caller), pay out completed Regent's
      // Charges (idempotent), and keep the presence stamp fresh.
      const token = str(args.token);
      if (token && !player.apiToken) player.apiToken = token;
      applyOnboardingRewards(player);
      return; // lastSeenAtMs already stamped by applyOneCommand
    }
    case "grantCharter": {
      if (!player.premium) {
        player.premium = true;
        pushInbox(world, player.id, {
          type: "info",
          detail: "👑 The Royal Charter is sealed — the Steward enters your service.",
        });
      }
      return { ok: true, message: "The Royal Charter is sealed." };
    }
    case "dismissOnboarding":
      return dismissOnboardingGrant(player), undefined;
    case "finishTour":
      player.onboarding = { claimed: [], ...player.onboarding, toured: true };
      return;

    // ── Economy & management ──────────────────────────────────────────
    case "setTax":
      return put(setTax(player, Number(args.rate)).player), undefined;
    case "assignWorkers":
      return put(assignWorkers(player, args.role as never, num(args.count)).player), undefined;
    case "recallWorkers":
      return put(assignWorkers(player, args.role as never, -num(args.count)).player), undefined;
    case "trainSpies":
      return put(trainSpies(player, num(args.count)).player), undefined;
    case "trainScouts":
      return put(trainScouts(player, num(args.count)).player), undefined;
    case "trainEngineers":
      return put(trainSiegeEngineers(player, num(args.count)).player), undefined;
    case "trainTroops":
      return (
        put(trainTroops(player, args.type as never, args.tier as never, num(args.count)).player),
        undefined
      );
    case "dischargeTroops":
      return (
        put(dischargeTroops(player, args.type as never, args.tier as never, num(args.count)).player),
        undefined
      );
    case "build": {
      const r = build(player, args.id as never);
      put(r.player);
      for (const e of r.events) pushInbox(world, player.id, e);
      return;
    }
    case "repairWalls":
      return put(repairWalls(player).player), undefined;
    case "repairBuilding":
      return put(repairBuilding(player, args.id as never).player), undefined;
    case "setResearch":
      return put(setResearch(player, args.field as never).player), undefined;
    case "rest":
      return put(restTroops(player).player), undefined;
    case "surrender":
      return doSurrender(world, player, Boolean(args.flag));
    case "bank":
      return put(bankGold(player, num(args.amount)).player), undefined;
    case "bankRes": {
      const what = str(args.what);
      if (!["food", "wood", "stone", "ore"].includes(what))
        throw new EngineError("what", "Unknown resource");
      return put(bankResource(player, what as never, num(args.amount)).player), undefined;
    }
    case "buyMercs":
      return (
        put(
          hireMercenaries(
            player,
            args.type as never,
            args.tier as never,
            num(args.count),
            wonderDiscount(clan),
          ).player,
        ),
        undefined
      );
    case "buySiegeGear":
      return (
        put(buySiegeGear(player, args.type as never, num(args.count), wonderDiscount(clan)).player),
        undefined
      );
    case "buySiegeCounter":
      return (
        put(buySiegeCounter(player, args.type as never, num(args.count), wonderDiscount(clan)).player),
        undefined
      );

    // ── The Steward (Royal Charter premium; spec/premium.md) ──────────
    case "queueBuild":
      return put(queueBuild(player, args.id as never).player), undefined;
    case "queueBuildCancel":
      return put(dequeueBuild(player, num(args.index)).player), undefined;
    case "queueResearch":
      return put(queueResearch(player, args.field as never).player), undefined;
    case "queueResearchCancel":
      return put(dequeueResearch(player, num(args.index)).player), undefined;
    case "orderAdd": {
      const when = parseCondition(args);
      const then = parseAction(args);
      return put(addStandingOrder(player, randomUUID(), when, then).player), undefined;
    }
    case "orderRemove":
      return put(removeStandingOrder(player, str(args.orderId)).player), undefined;

    // ── War ───────────────────────────────────────────────────────────
    case "attack":
      return doAttack(world, player, str(args.targetId), args.mode as AttackMode, args);

    // ── Espionage ─────────────────────────────────────────────────────
    case "spy": {
      const target = world.players[str(args.targetId)];
      if (!target) throw new EngineError("target", "No such empire");
      // Proposal (implemented): spy missions are blocked vs protected players.
      if (tick - world.meta.eraStartedAtTick < ERA_PEACE_TICKS)
        throw new EngineError("peace", "The era peace holds.");
      if (target.shieldUntilTick > tick)
        throw new EngineError("shield", "That empire is under the newcomer shield.");
      const r = runSpyMission(player, target, str(args.op), num(args.spies), tick, Math.random);
      put(r.attacker);
      world.players[target.id] = r.defender;
      if (!r.caught && ((r.resourcesDestroyed ?? 0) > 0 || (r.gearDestroyed ?? 0) > 0)) {
        const records = world.eraRecords ?? (world.eraRecords = newEraRecords());
        recordSpyFeat(records, player.id, player.name, clanCode(clan?.name), {
          resourcesDestroyed: r.resourcesDestroyed,
          gearDestroyed: r.gearDestroyed,
        });
      }
      pushInbox(world, player.id, {
        type: "spyReport",
        op: str(args.op),
        targetName: target.name,
        caught: r.caught,
        detail: r.detail,
      });
      if (r.caught) {
        pushInbox(world, target.id, {
          type: "spiesCaught",
          attackerName: player.name,
          executed: num(args.spies),
          op: str(args.op),
        });
      } else if (r.victimDetail) {
        pushInbox(world, target.id, { type: "sabotaged", detail: r.victimDetail });
      }
      return { ok: true, message: r.detail };
    }
    case "scout": {
      const target = world.players[str(args.targetId)];
      if (!target) throw new EngineError("target", "No such empire");
      const r = runScoutRecon(player, target, Math.random);
      put(r.attacker);
      pushInbox(world, player.id, { type: "scoutReport", targetName: target.name, detail: r.detail });
      return { ok: true, message: r.detail };
    }

    // ── The Grand Bazaar ──────────────────────────────────────────────
    case "marketPost": {
      const r = postOrder(
        player,
        world.orders,
        args.resource as Resource,
        num(args.amount),
        Math.floor(Number(args.price)), // ask prices are whole gold (2–50)
        randomUUID(),
        tick,
      );
      put(r.seller);
      world.orders.push(r.order);
      return;
    }
    case "marketCancel": {
      const r = cancelOrder(player, world.orders, str(args.orderId));
      put(r.seller);
      world.orders = r.orders;
      return;
    }
    case "marketBuy": {
      const r = buyFromMarket(player, world.orders, args.resource as Resource, num(args.amount), tick);
      put(r.buyer);
      world.orders = r.orders;
      // Pay sellers their net (the 5% fee is burned) — anonymously.
      const saleRecords = world.eraRecords ?? (world.eraRecords = newEraRecords());
      for (const f of r.fills) {
        const seller = world.players[f.sellerId];
        if (seller) {
          seller.gold += f.netGold;
          const sellerClan = seller.clanId ? world.clans[seller.clanId] : undefined;
          recordSaleFeat(saleRecords, seller.id, seller.name, clanCode(sellerClan?.name), f.netGold);
          pushInbox(world, seller.id, {
            type: "marketSale",
            resource: args.resource as Resource,
            amount: f.amount,
            goldNet: Math.round(f.netGold),
          });
        }
      }
      return;
    }

    // ── Clans ─────────────────────────────────────────────────────────
    case "clanCreate": {
      if (player.clanId) throw new EngineError("clan", "You already march under a banner");
      const nameStr = str(args.name).trim().slice(0, 40);
      if (nameStr.length < 3) throw new EngineError("name", "A clan needs a proper name");
      if (Object.values(world.clans).some((c) => c.name.toLowerCase() === nameStr.toLowerCase()))
        throw new EngineError("name", "That banner already flies");
      // Founding fee = Hall L1 (50k gold). Spec wants 5 founders together;
      // enforced when real invitations exist — solo founding allowed for now.
      if (player.gold < 50000) throw new EngineError("gold", "Founding costs 50,000 gold");
      player.gold -= 50000;
      const c = newClan(randomUUID(), nameStr, player);
      player.clanId = c.id;
      world.clans[c.id] = c;
      put(player);
      return { ok: true, message: `${nameStr} is founded (${FOUNDING_MEMBERS} founders required at launch).` };
    }
    case "clanRequestJoin": {
      const c = world.clans[str(args.clanId)];
      if (!c) throw new EngineError("clan", "No such clan");
      const err = canRequestJoin(player, c, tick);
      if (err) throw new EngineError("request", err);
      world.clans[c.id] = requestToJoin(player, c, tick);
      // Only those who can answer it need to hear about it.
      for (const id of [c.leaderId, c.viceLeaderId]) {
        if (id) pushInbox(world, id, { type: "clanEvent", detail: `${player.name} petitions to join ${c.name}.` });
      }
      return { ok: true, message: `Your petition has been sent to ${c.name}.` };
    }
    case "clanWithdrawRequest": {
      const c = world.clans[str(args.clanId)];
      if (!c) throw new EngineError("clan", "No such clan");
      world.clans[c.id] = withdrawJoinRequest(c, player.id);
      return { ok: true, message: "Your petition has been withdrawn." };
    }
    case "clanAnswerRequest": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const targetId = str(args.targetId);
      const target = world.players[targetId];
      if (!target) throw new EngineError("target", "No such empire");
      if (str(args.accept) === "1") {
        const r = acceptJoinRequest(target, clan, player.id, tick);
        put(r.player);
        world.clans[clan.id] = r.clan;
        for (const m of r.clan.members) {
          pushInbox(world, m, { type: "clanEvent", detail: `${target.name} has joined ${clan.name}.` });
        }
        return { ok: true, message: `${target.name} now marches under your banner.` };
      }
      world.clans[clan.id] = denyJoinRequest(clan, player.id, targetId);
      pushInbox(world, targetId, {
        type: "clanEvent",
        detail: `${clan.name} has refused your petition — you may not ask them again.`,
      });
      return { ok: true, message: `${target.name}'s petition is refused.` };
    }
    case "clanInvite": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const target = world.players[str(args.targetId)];
      if (!target) throw new EngineError("target", "No such empire");
      world.clans[clan.id] = invitePlayer(clan, player.id, target, tick);
      pushInbox(world, target.id, {
        type: "clanEvent",
        detail: `${clan.name} invites you to march under their banner.`,
      });
      return { ok: true, message: `${target.name} has been invited.` };
    }
    case "clanAcceptInvite": {
      const c = world.clans[str(args.clanId)];
      if (!c) throw new EngineError("clan", "No such clan");
      const err = canJoin(player, c, tick);
      if (err) throw new EngineError("join", err);
      const r = acceptInvite(player, c, tick);
      put(r.player);
      world.clans[c.id] = r.clan;
      for (const m of r.clan.members) {
        if (m !== player.id) {
          pushInbox(world, m, { type: "clanEvent", detail: `${player.name} has joined ${c.name}.` });
        }
      }
      return { ok: true, message: `You now march under ${c.name}.` };
    }
    case "clanDeclineInvite": {
      const c = world.clans[str(args.clanId)];
      if (!c) throw new EngineError("clan", "No such clan");
      world.clans[c.id] = declineInvite(c, player.id);
      return { ok: true, message: "Invitation declined." };
    }
    case "clanLeave": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const r = departClan(player, clan, tick);
      put(r.player);
      world.clans[clan.id] = r.clan;
      return;
    }
    case "clanDeposit": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const r = depositToClan(player, clan, args.what as never, num(args.amount));
      put(r.player);
      world.clans[clan.id] = r.clan;
      // Largesse toward the clan vault counts toward "the Generous"/"the Bountiful".
      const giftRecords = world.eraRecords ?? (world.eraRecords = newEraRecords());
      recordGiftFeat(giftRecords, player.id, player.name, clanCode(clan.name), str(args.what), num(args.amount));
      return;
    }
    case "clanWithdraw": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const r = withdrawFromClan(player, clan, args.what as never, num(args.amount));
      put(r.player);
      world.clans[clan.id] = r.clan;
      return;
    }
    case "clanBuild": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      // The pool pays first; whatever it can't cover comes out of the builder's
      // own treasury, so their player record changes too.
      const r = buildClanBuilding(clan, player, args.which as never);
      put(r.player);
      world.clans[clan.id] = r.clan;
      return;
    }
    case "clanRepair": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      world.clans[clan.id] = repairClanBuilding(clan, player.id, args.which as never);
      return;
    }
    case "clanSetRole": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const role = str(args.role);
      if (role !== "vice" && role !== "officer" && role !== "member") {
        throw new EngineError("role", "Unknown role");
      }
      const target = world.players[str(args.targetId)];
      const updated = setMemberRole(clan, player.id, str(args.targetId), role);
      world.clans[clan.id] = updated;
      if (target) {
        const titled = role === "member" ? "returned to the ranks" : `named ${role === "vice" ? "Vice-Leader" : "an Officer"}`;
        pushInbox(world, target.id, { type: "clanEvent", detail: `${clan.name}: you have been ${titled}.` });
      }
      return { ok: true, message: "Roster updated." };
    }
    case "clanTransferLead": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const target = world.players[str(args.targetId)];
      world.clans[clan.id] = transferLeadership(clan, player.id, str(args.targetId));
      for (const m of clan.members) {
        pushInbox(world, m, {
          type: "clanEvent",
          detail: `${target?.name ?? "A new leader"} now leads ${clan.name}.`,
        });
      }
      return { ok: true, message: `You have passed the mantle to ${target?.name ?? "them"}.` };
    }
    case "clanKick": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const targetId = str(args.targetId);
      if (targetId === player.id) throw new EngineError("target", "To depart yourself, use Leave the clan");
      if (!isLeadership(clan, player.id)) throw new EngineError("rank", "Only leadership may remove members");
      const target = world.players[targetId];
      if (!target || target.clanId !== clan.id) throw new EngineError("member", "Not a member of your clan");
      if (clanRank(clan, player.id) <= clanRank(clan, targetId)) {
        throw new EngineError("rank", "You can only remove members ranked below you");
      }
      const r = departClan(target, clan, tick);
      put(r.player);
      world.clans[clan.id] = r.clan;
      pushInbox(world, target.id, { type: "clanEvent", detail: `You have been removed from ${clan.name}.` });
      return { ok: true, message: `${target.name} has been removed from the clan.` };
    }
    case "clanDeclareWar": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      if (clan.leaderId !== player.id && clan.viceLeaderId !== player.id)
        throw new EngineError("rank", "Only the Leader or Vice may declare war");
      const target = world.clans[str(args.clanId)];
      if (!target) throw new EngineError("clan", "No such clan");
      world.clans[clan.id] = declareWar(clan, target.id, tick);
      for (const m of [...clan.members, ...target.members]) {
        pushInbox(world, m, { type: "clanEvent", detail: `${clan.name} declares war on ${target.name}!` });
      }
      pushChronicle(world, "war", `⚔ ${clan.name} declares WAR upon ${target.name}!`);
      return;
    }
    case "clanBombard":
      return doClanBombard(world, player, str(args.clanId), str(args.which));

    // ── Forum ─────────────────────────────────────────────────────────
    case "chat": {
      const body = str(args.body).trim().slice(0, 800);
      if (!body) throw new EngineError("body", "Say something");
      let channel = str(args.channel);
      if (channel === "clan") {
        if (!clan) throw new EngineError("clan", "You have no clan");
        channel = `clan:${clan.id}`;
      } else if (channel.startsWith("dm:")) {
        const other = channel.slice(3);
        if (!world.players[other]) throw new EngineError("dm", "No such empire");
        channel = dmChannel(player.id, other);
      } else {
        channel = "era";
      }
      pushMessage(world, {
        id: randomUUID(),
        channel,
        authorId: player.id,
        authorName: player.name,
        body,
        tick,
      });
      return;
    }

    default:
      throw new EngineError("command", `Unknown command: ${name}`);
  }
}

// ── Standing-order form parsing (validated in the engine) ──────────────────

function parseCondition(args: Record<string, unknown>): OrderCondition {
  switch (str(args.whenKind)) {
    case "building":
      return { kind: "building", building: args.whenBuilding as never, level: num(args.whenLevel) };
    case "research":
      return { kind: "research", field: args.whenField as never, level: num(args.whenLevel) };
    case "gold":
      return { kind: "gold", amount: num(args.whenAmount) };
    case "resource":
      return { kind: "resource", resource: args.whenResource as never, amount: num(args.whenAmount) };
    default:
      throw new EngineError("condition", "Choose a condition");
  }
}

function parseAction(args: Record<string, unknown>): OrderAction {
  const count = num(args.thenCount);
  switch (str(args.thenKind)) {
    case "trainSpies":
    case "trainScouts":
    case "trainEngineers":
      return { kind: str(args.thenKind) as never, count, remaining: count };
    case "trainTroops":
      return {
        kind: "trainTroops",
        type: args.thenType as never,
        tier: args.thenTier as never,
        count,
        remaining: count,
      };
    case "build":
      return { kind: "build", building: args.thenBuilding as never };
    case "setTax": {
      // API sends thenRate (0–1); the UI form sends thenRatePct (0–100).
      const rate =
        args.thenRate !== undefined ? Number(args.thenRate) : Number(args.thenRatePct) / 100;
      return { kind: "setTax", rate };
    }
    default:
      throw new EngineError("action", "Choose an action");
  }
}

// ── Attack orchestration ────────────────────────────────────────────────────

function doAttack(
  world: World,
  attacker: Player,
  targetId: string,
  mode: AttackMode,
  args: Record<string, unknown>,
): CommandResult {
  const tick = world.meta.tickNumber;
  const defender = world.players[targetId];
  if (!defender) throw new EngineError("target", "No such empire");

  const aClan = attacker.clanId ? world.clans[attacker.clanId] : undefined;
  const dClan = defender.clanId ? world.clans[defender.clanId] : undefined;
  const clanWar = atWar(aClan, dClan);

  // Clan-bombardment revenge (spec/clans.md): our clan was bombarded by the
  // defender's clan, this player was a member at that moment, and the 18h
  // window is still open. Any such member may deliver the one strike.
  const rev = aClan?.pendingRevenge;
  const clanRevengeAuthorized =
    mode === "revenge" &&
    !!rev &&
    !!dClan &&
    rev.againstClanId === dClan.id &&
    rev.memberSnapshot.includes(attacker.id) &&
    tick <= rev.expiresAtTick;

  const err = validateAttack(attacker, defender, mode, {
    currentTick: tick,
    eraStartedAtTick: world.meta.eraStartedAtTick,
    eraPeaceTicks: ERA_PEACE_TICKS,
    revengeWindowTicks: REVENGE_WINDOW_TICKS,
    clanWar,
    clanRevengeAuthorized,
    surrenderReattackCooldownTicks: SURRENDER_REATTACK_COOLDOWN_TICKS,
  });
  if (err) throw new EngineError("attack", err);

  const battleId = randomUUID();
  const opts = { rng: Math.random, warBonus: clanWar, battleId, tick };
  const outcome =
    mode === "bombard"
      ? resolveBombard(attacker, defender, opts)
      : resolveBattle(attacker, defender, mode, opts);

  const a = outcome.attacker;
  const d = outcome.defender;

  // The attack itself: 10 action turns; attacking drops your own newcomer
  // shield. (You can't attack while surrendered, so there's no flag to lift.)
  a.turnsAvailable -= 10;
  a.shieldUntilTick = Math.min(a.shieldUntilTick, tick);

  // Revenge bookkeeping (combat.md): every attack opens the victim's window;
  // attacking someone anew re-arms their right to revenge you.
  d.recentAttackers = [
    ...d.recentAttackers.filter((r) => tick - r.tick <= REVENGE_WINDOW_TICKS),
    { playerId: a.id, tick },
  ];
  d.revengeUsed = d.revengeUsed.filter((id) => id !== a.id);
  if (mode === "revenge") a.revengeUsed = [...a.revengeUsed, d.id];

  // A clan's single bombardment-revenge is spent by whoever delivers it —
  // close the whole clan's window. Mutating aClan in place is enough: the
  // war-kills block below re-clones from it, and it is the live world object.
  if (clanRevengeAuthorized && aClan) aClan.pendingRevenge = undefined;

  world.players[a.id] = a;
  world.players[d.id] = d;
  pushBattle(world, outcome.report);

  // Tally this clash into the age's living War Records (Richest/Bloodiest
  // attacks, Feuds, Wars) — sealed into the history books when the age ends.
  const records = world.eraRecords ?? (world.eraRecords = newEraRecords());
  recordBattle(records, outcome.report, {
    attackerId: a.id,
    attackerClanName: aClan?.name,
    defenderId: d.id,
    defenderClanName: dClan?.name,
  });
  pushInbox(world, a.id, { type: "battleResult", battleId, victor: outcome.report.victor, mode });
  pushInbox(world, d.id, { type: "attacked", byId: a.id, byName: a.name, mode, battleId });

  // A sacked castle is world news worth recording in the Annals.
  if (mode === "siege" && outcome.report.victor === "attacker") {
    const gold = Math.floor(outcome.report.loot.gold);
    pushChronicle(
      world,
      "danger",
      gold > 0
        ? `🏰 ${a.name} storms the castle of ${d.name}, carrying off ${gold.toLocaleString("en-US")} gold.`
        : `🏰 ${a.name} breaches the walls of ${d.name} and sacks the castle.`,
    );
  }

  // Clan war ledger: regular kills decide wars.
  if (clanWar && aClan && dClan && mode !== "bombard") {
    const r = recordWarKills(
      aClan,
      dClan,
      regularKills(outcome.report.defenderLosses),
      regularKills(outcome.report.attackerLosses),
      tick,
    );
    world.clans[aClan.id] = r.ours;
    world.clans[dClan.id] = r.theirs;
    if (r.victory) {
      for (const m of [...r.ours.members, ...r.theirs.members]) {
        pushInbox(world, m, {
          type: "clanEvent",
          detail: `${r.ours.name} wins the war against ${r.theirs.name}! Tribute flows for a day; a 48-hour truce holds.`,
        });
      }
      pushChronicle(world, "war", `🛡 ${r.ours.name} triumphs in war over ${r.theirs.name} — tribute flows and a truce is imposed.`);
      // Experience transfer: 5% from every loser to every winner (capped).
      for (const id of r.theirs.members) {
        const p = world.players[id];
        if (p) p.army.experience = Math.max(0, p.army.experience * 0.95);
      }
      for (const id of r.ours.members) {
        const p = world.players[id];
        if (p) p.army.experience = Math.min(100, p.army.experience * 1.05);
      }
    }
  }

  return { ok: true, battleId, message: `Battle resolved: ${outcome.report.victor}` };
}

/**
 * Raise or lower the white flag (spec/combat.md, economy.md). Surrender makes
 * you untouchable but for revenge, halves tax AND production, and spends an
 * era-limited budget of days. You can't surrender while a revenge hangs over
 * you — it queues instead, rising once every such window closes. Lowering the
 * flag starts a re-attack cooldown so surrender can't be a siege-dodge.
 */
function doSurrender(world: World, player: Player, flag: boolean): CommandResult {
  const tick = world.meta.tickNumber;
  const p = player;

  if (!flag) {
    const wasFlying = p.surrendered;
    p.surrendered = false;
    p.surrenderQueued = false;
    if (wasFlying) p.surrenderLiftedAtTick = tick;
    world.players[p.id] = p;
    return {
      ok: true,
      message: wasFlying
        ? "The white flag is lowered — your host stands ready again (no attacks for a short while)."
        : "Surrender is called off.",
    };
  }

  if (p.surrendered) return { ok: true, message: "You already fly the white flag." };
  if ((p.surrenderTicksUsed ?? 0) >= SURRENDER_TICKS_PER_ERA) {
    throw new EngineError(
      "surrender",
      `You have spent your ${SURRENDER_DAYS_PER_ERA} days of surrender for this age — there is no hiding now.`,
    );
  }
  if (revengePendingOn(world, p.id, tick)) {
    p.surrenderQueued = true;
    world.players[p.id] = p;
    return {
      ok: true,
      message:
        "A revenge still hangs over you — surrender is queued. The white flag rises once every revenge window against you has closed.",
    };
  }
  p.surrendered = true;
  p.surrenderQueued = false;
  world.players[p.id] = p;
  return {
    ok: true,
    message: "The white flag is raised — untouchable but for revenge, at half tax and half production.",
  };
}

/**
 * Clan-building bombardment (spec/clans.md): a war-only artillery strike on an
 * enemy clan's works. Costs 10 turns and crewed trebuchets; grinds the chosen
 * structure toward its 50% floor. The price is a single revenge strike for the
 * whole attacked clan — any member at that moment may deliver it within 18h.
 */
function doClanBombard(
  world: World,
  attacker: Player,
  targetClanId: string,
  which: string,
): CommandResult {
  const tick = world.meta.tickNumber;
  const aClan = attacker.clanId ? world.clans[attacker.clanId] : undefined;
  if (!aClan) throw new EngineError("clan", "You march under no banner");
  const tClan = world.clans[targetClanId];
  if (!tClan) throw new EngineError("clan", "No such clan");
  if (tClan.id === aClan.id) throw new EngineError("clan", "You cannot bombard your own works");
  if (!atWar(aClan, tClan)) throw new EngineError("war", "You are not at war with that clan");
  if (which !== "storage" && which !== "hall" && which !== "wonder") {
    throw new EngineError("target", "Choose a clan building to bombard");
  }
  const target = which as ClanBuilding;
  if (attacker.surrendered) throw new EngineError("surrender", "You have surrendered — lift the white flag first");
  if (attacker.starving) throw new EngineError("starving", "Starving armies will not march");
  if (tick - world.meta.eraStartedAtTick < ERA_PEACE_TICKS) {
    throw new EngineError("peace", "The era peace holds — no attacks in the first 5 days");
  }
  if (attacker.turnsAvailable < 10) throw new EngineError("turns", "A bombardment costs 10 action turns");

  const buildingLevel =
    target === "storage"
      ? tClan.buildings.storageLevel
      : target === "hall"
        ? tClan.buildings.hallLevel
        : tClan.buildings.wonderLevel;
  const label = clanBuildingLabel(target);
  if (buildingLevel <= 0) throw new EngineError("target", `They have raised no ${label} to break`);
  if (tClan.buildings.integrity[target] <= 0.5) {
    throw new EngineError("target", `Their ${label} is already cracked to its floor`);
  }
  if (crewGear(attacker.army.siegeGear, attacker.army.siegeEngineers).trebuchets <= 0) {
    throw new EngineError("gear", "You need crewed trebuchets — trebuchets plus engineers to work them");
  }

  const outcome = resolveClanBombard(attacker, tClan, target, {
    rng: Math.random,
    battleId: randomUUID(),
    tick,
  });

  const a = outcome.attacker;
  a.turnsAvailable -= 10;
  a.surrendered = false;
  a.shieldUntilTick = Math.min(a.shieldUntilTick, tick);

  const damaged = outcome.clan;
  // The price: the whole clan (as it stands now) gets ONE revenge strike.
  damaged.pendingRevenge = {
    againstClanId: aClan.id,
    memberSnapshot: [...damaged.members],
    expiresAtTick: tick + REVENGE_WINDOW_TICKS,
  };

  world.players[a.id] = a;
  world.clans[damaged.id] = damaged;

  const pct = Math.round(outcome.integrityLost * 100);
  for (const m of damaged.members) {
    pushInbox(world, m, {
      type: "clanEvent",
      detail: `${a.name} of ${aClan.name} bombards your ${label} (−${pct}%). Your clan may strike one revenge against them — first to draw blood claims it (18h).`,
    });
  }
  pushChronicle(world, "war", `🎯 ${aClan.name} bombards the ${label} of ${damaged.name} (−${pct}%).`);

  return {
    ok: true,
    message: `Your trebuchets crack the ${damaged.name} ${label} for −${pct}% integrity — expect their revenge.`,
  };
}
