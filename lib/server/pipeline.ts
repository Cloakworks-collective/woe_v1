// The command pipeline (spec/architecture.md): auth happens in the caller;
// here we validate → apply (pure engine) → persist → record events.
// Used identically by API routes (cmd:*) and UI server actions.

import { randomUUID } from "node:crypto";
import {
  EngineError,
  addStandingOrder,
  assignWorkers,
  atWar,
  bankGold,
  bankResource,
  build,
  dequeueBuild,
  dequeueResearch,
  queueBuild,
  queueResearch,
  removeStandingOrder,
  buildClanBuilding,
  buyMercenaries,
  buySiegeGear,
  canJoin,
  clanBuildingLabel,
  crewGear,
  declareWar,
  departClan,
  depositToClan,
  disbandTroops,
  dischargeWarriors,
  equipTroops,
  joinClan,
  military,
  newClan,
  postOrder,
  buyFromMarket,
  cancelOrder,
  recordBattle,
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
  trainWarriors,
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
import { dmChannel, pushBattle, pushChronicle, pushInbox, saveWorld, type World } from "./store";
import { ERA_PEACE_TICKS, REVENGE_WINDOW_TICKS, getWorld, revengePendingOn, runDueTicks } from "./world";

export interface CommandResult {
  ok: boolean;
  message?: string;
  battleId?: string;
}

function regularKills(l: UnitLosses): number {
  return l.footmen + l.archers + l.cavalry + l.engineers + l.warriors;
}

/** Execute one command for one player. Catches EngineError into {ok:false}. */
export async function runCommand(
  playerId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<CommandResult> {
  const world = await getWorld();
  runDueTicks(world); // the world moves before every command

  const player = world.players[playerId];
  if (!player) return { ok: false, message: "No such empire." };
  if (player.banned) return { ok: false, message: "This empire has been banished by the crown." };
  player.lastSeenAtMs = Date.now(); // presence for the ladder's Online column

  try {
    const result = dispatch(world, player, name, args);
    await saveWorld(world);
    return result ?? { ok: true };
  } catch (e) {
    await saveWorld(world); // ticks that ran still count
    if (e instanceof EngineError) return { ok: false, message: e.message };
    throw e;
  }
}

const num = (v: unknown) => Math.floor(Number(v));
const str = (v: unknown) => String(v ?? "");

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
    // ── Economy & management ──────────────────────────────────────────
    case "setTax":
      return put(setTax(player, Number(args.rate)).player), undefined;
    case "assignWorkers":
      return put(assignWorkers(player, args.role as never, num(args.count)).player), undefined;
    case "recallWorkers":
      return put(assignWorkers(player, args.role as never, -num(args.count)).player), undefined;
    case "trainWarriors":
      return put(trainWarriors(player, num(args.count)).player), undefined;
    case "trainSpies":
      return put(trainSpies(player, num(args.count)).player), undefined;
    case "trainScouts":
      return put(trainScouts(player, num(args.count)).player), undefined;
    case "trainEngineers":
      return put(trainSiegeEngineers(player, num(args.count)).player), undefined;
    case "equipTroops":
      return (
        put(equipTroops(player, args.type as never, args.tier as never, num(args.count)).player),
        undefined
      );
    case "disbandTroops":
      return (
        put(disbandTroops(player, args.type as never, args.tier as never, num(args.count)).player),
        undefined
      );
    case "dischargeWarriors":
      return put(dischargeWarriors(player, num(args.count)).player), undefined;
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
      return put(buyMercenaries(player, num(args.count), wonderDiscount(clan)).player), undefined;
    case "buySiegeGear":
      return (
        put(buySiegeGear(player, args.type as never, num(args.count), wonderDiscount(clan)).player),
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
        Number(args.price),
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
      const r = buyFromMarket(player, world.orders, args.resource as Resource, num(args.amount));
      put(r.buyer);
      world.orders = r.orders;
      // Pay sellers their net (the 5% fee is burned) — anonymously.
      for (const f of r.fills) {
        const seller = world.players[f.sellerId];
        if (seller) {
          seller.gold += f.netGold;
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
    case "clanJoin": {
      const c = world.clans[str(args.clanId)];
      if (!c) throw new EngineError("clan", "No such clan");
      const err = canJoin(player, c, tick);
      if (err) throw new EngineError("join", err);
      const r = joinClan(player, c, tick);
      put(r.player);
      world.clans[c.id] = r.clan;
      return;
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
      world.clans[clan.id] = buildClanBuilding(clan, player.id, args.which as never);
      return;
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
      world.messages.push({
        id: randomUUID(),
        channel,
        authorId: player.id,
        authorName: player.name,
        body,
        tick,
      });
      if (world.messages.length > 2000) world.messages.splice(0, world.messages.length - 2000);
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
    case "trainWarriors":
    case "trainSpies":
    case "trainScouts":
    case "trainEngineers":
      return { kind: str(args.thenKind) as never, count, remaining: count };
    case "equip":
      return {
        kind: "equip",
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
