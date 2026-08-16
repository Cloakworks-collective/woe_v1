// The command pipeline (spec/architecture.md): auth happens in the caller;
// here we validate → apply (pure engine) → persist → record events.
// Used identically by API routes (cmd:*) and UI server actions.

import { randomUUID } from "node:crypto";
import {
  EngineError,
  addStandingOrder,
  answerQuestion,
  applyOnboardingRewards,
  payEndowment,
  retakeExam,
  assignWorkers,
  atWar,
  chatLimitProblem,
  clanMuted,
  giftToMember,
  muteClanMember,
  recordChat,
  unmuteClanMember,
  warIsHot,
  worksLevel,
  type ClanWorks,
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
  dismissMercenaries,
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
  areAllied,
  acceptAlliance,
  breakAllianceByTreachery,
  crewGear,
  declareWar,
  declineAlliance,
  endAlliance,
  offerAlliance,
  departClan,
  departOnVacation,
  returnFromVacation,
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
  blackMarketBuy,
  blackMarketSell,
  cancelOrder,
  clanCode,
  recordBattle,
  recordGiftFeat,
  recordSaleFeat,
  recordSpyFeat,
  newEraRecords,
  recordWarKills,
  repairBuilding,
  repairSiege,
  sellSiege,
  setSortie,
  setSiegeStance,
  setRecruitHour,
  repairWalls,
  resolveBattle,
  resolveBombard,
  resolveClanBombard,
  restTroops,
  recordCovert,
  runCovertOp,
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
  TICKS_PER_HOUR,
  VACATION_DAYS_PER_ERA,
  VACATION_REATTACK_COOLDOWN_TICKS,
  VACATION_RETURN_SHIELD_MIN_TICKS,
  VACATION_RETURN_SHIELD_TICKS,
  VACATION_TICKS_PER_ERA,
} from "../constants";
import type { Race } from "../constants/races";
import { EXAM_REWARD } from "@/lib/constants";
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
 * The only commands that still work once the age has been won.
 *
 * An ALLOWLIST, deliberately — a denylist would silently admit every command
 * added afterwards, and the whole point is that a sealed final ladder stays
 * sealed. Nothing here can change the standings:
 *
 *   syncPlayer       page-load housekeeping; §14.2 breaks without it
 *   grantCharter     a payment that lands after the bell is still honoured
 *   chat             let people congratulate the winner
 *   dismissOnboarding / finishTour   dismissing a panel is not a game action
 *
 * Everything else — attacking, building, trading, training, clan politics —
 * is refused until an admin closes the age (`adminCloseAge`, which does not
 * route through here). The world's clock is stopped too: see `runDueTicks`.
 */
const ALLOWED_AFTER_VICTORY: ReadonlySet<string> = new Set([
  "syncPlayer",
  "grantCharter",
  "chat",
  "dismissOnboarding",
  // Reading is still allowed once the age is won — the endowment is worthless
  // by then, but a player who was mid-examination should not hit a wall.
  "examAnswer",
  "examRetake",
  "finishTour",
]);

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
  // The regent is here, so bombarded housing stops being free. See intakeHousing.
  player.roofDamageUnseen = false;

  // The age is over. The final ladder is frozen, and it stays frozen — no
  // attack, trade or build can move it while the realm waits for the age to be
  // sealed. (Reads are untouched; the world is still fully browsable.)
  if (world.meta.winner && !ALLOWED_AFTER_VICTORY.has(name)) {
    return {
      result: {
        ok: false,
        message: `The age has ended — ${world.meta.winner.name} is proclaimed victor. The ladder is sealed until the next era opens.`,
      },
      dirty: true, // the presence stamp above still deserves persisting
    };
  }

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

const CLAN_WORKS: ReadonlySet<string> = new Set(["storage", "hall", "wonder", "beacon"]);
function clanWorksArg(v: unknown): ClanWorks {
  const w = String(v ?? "");
  if (!CLAN_WORKS.has(w)) throw new EngineError("which", "No such clan work");
  return w as ClanWorks;
}

const num = (v: unknown) => Math.floor(Number(v));
const str = (v: unknown) => String(v ?? "");

/**
 * Found a new empire — ONE per account per age.
 *
 * The id is generated by the caller (Next.js has crypto and owns the session),
 * so this stays a plain world mutation that both write models share.
 *
 * The one-per-age rule lives here rather than in the route because this is the
 * only place a founding can happen, and because it must be checked against the
 * same world snapshot it writes to. Under the compare-and-swap model (§14.1)
 * two simultaneous foundings from the same account both read a world without an
 * empire; the loser's commit fails the version check, replays against the
 * winner's world, and hits this line the second time around. Checking in the
 * action instead would let both through.
 */
function createEmpireCmd(world: World, id: string, args: Record<string, unknown>): CommandResult {
  const name = str(args.name).trim().slice(0, 30);
  const race = str(args.race || "human") as Race;
  const accountId = str(args.accountId);
  if (!accountId) throw new EngineError("account", "No account — sign in first.");
  if (name.length < 2) throw new EngineError("name", "Name your empire (2+ letters).");
  if (world.players[id]) throw new EngineError("id", "That empire already exists.");
  const existing = Object.values(world.players).find((p) => p.accountId === accountId);
  if (existing) {
    throw new EngineError("account", `You already rule ${existing.name} this age.`);
  }
  if (Object.values(world.players).some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new EngineError("name", "That name is taken.");
  }
  const p = newEmpire({ id, name, race, joinedAtTick: world.meta.tickNumber });
  p.accountId = accountId;
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
      // Page-load housekeeping that must pass through the single writer: pay out
      // completed Regent's Charges (idempotent) and keep the presence stamp
      // fresh. There is no token to backfill any more — the credential belongs
      // to the account, not the empire.
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
    case "examAnswer": {
      // The index is validated against the server's own position inside
      // answerQuestion — a client that could choose its own question could skip
      // to the last one and claim the endowment for a single lucky guess.
      const next = answerQuestion(player, Number(args.index), Number(args.choice));
      const { player: settled, paid } = payEndowment(next);
      put(settled);
      if (paid) {
        pushInbox(world, player.id, {
          type: "info",
          detail: `🎓 The Collegium seals your examination — ${EXAM_REWARD.gold.toLocaleString("en-US")} gold and ${EXAM_REWARD.resources.toLocaleString("en-US")} of every resource are endowed to your treasury.`,
        });
        return { ok: true, message: "The Collegium endows your treasury." };
      }
      return;
    }
    case "examRetake":
      put(retakeExam(player));
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
      // `count` lets the UI offer batch buttons (housing is built 1/5/10 at a
      // time). Each level is still paid at its own price — see build().
      const count = args.count === undefined ? 1 : Math.max(1, Math.min(50, num(args.count)));
      const r = build(player, args.id as never, count);
      put(r.player);
      for (const e of r.events) pushInbox(world, player.id, e);
      if (count > 1) {
        const built = r.events.length;
        return {
          ok: true,
          message:
            built === count
              ? `${built} raised.`
              : `${built} of ${count} raised — the treasury ran dry.`,
        };
      }
      return;
    }
    case "setRecruitHour": {
      const r = setRecruitHour(player, num(args.offset), tick);
      put(r.player);
      for (const e of r.events) pushInbox(world, player.id, e);
      return { ok: true, message: r.events[0]?.type === "info" ? "Your dawn is moved." : undefined };
    }
    case "repairWalls":
      return put(repairWalls(player).player), undefined;
    case "repairBuilding":
      return put(repairBuilding(player, args.id as never).player), undefined;
    case "setResearch":
      return put(setResearch(player, args.field as never).player), undefined;
    case "rest":
      // `points` is new; the bare "rest" of the old flat +20 button still
      // arrives from saved links and scripts, and means "one point".
      return put(restTroops(player, num(args.points ?? 1)).player), undefined;
    // "surrender" is the pre-rename wire name — kept so existing CLI scripts
    // and realm-token clients don't break. `flag` likewise aliases `away`.
    case "vacation":
    case "surrender":
      return doVacation(world, player, Boolean(args.away ?? args.flag));
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
    // No refund — see dismissMercenaries. Frees the Muster Hall bed, nothing else.
    case "dismissMercs":
      return (
        put(
          dismissMercenaries(player, args.type as never, args.tier as never, num(args.count))
            .player,
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

    // ── The Steward (Royal Charter premium; spec/clans.md) ──────────
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

    // ── The engine yard ───────────────────────────────────────────────
    // A long bombardment is a running expense: engines wear down, fire weaker
    // as they do, and must be mended between volleys or sold when the treasury
    // runs dry.
    case "repairSiege":
      return put(repairSiege(player, args.type as never).player), undefined;
    case "sellSiege":
      return put(sellSiege(player, args.type as never, num(args.count)).player), undefined;
    case "setSortie":
      return put(setSortie(player, str(args.enabled) === "true").player), undefined;
    case "setSiegeStance":
      return put(setSiegeStance(player, str(args.stance) === "counter" ? "counter" : "general").player), undefined;

    // ── War ───────────────────────────────────────────────────────────
    case "attack":
      return doAttack(world, player, str(args.targetId), args.mode as AttackMode, args);

    // ── Espionage ─────────────────────────────────────────────────────
    // ── The shadow war ────────────────────────────────────────────────
    // One entry point for both arms. Scouts gather and counter; spies destroy
    // and steal. Both spend from the same scarce pool of spy turns.
    case "covert": {
      const target = world.players[str(args.targetId)];
      if (!target) throw new EngineError("target", "No such empire");
      // Your own house and your own banner are both off limits. The attack
      // validator has always refused these; the shadow war never did, so a
      // player could scout themselves or read a clanmate's ledger.
      if (target.id === player.id)
        throw new EngineError("target", "You cannot spy on your own empire");
      if (player.clanId && player.clanId === target.clanId)
        throw new EngineError("clan", "They march under your own banner");
      if (tick - world.meta.eraStartedAtTick < ERA_PEACE_TICKS)
        throw new EngineError("peace", "The era peace holds.");
      if (target.shieldUntilTick > tick)
        throw new EngineError("shield", "That empire is under a shield.");
      // Vacation stops the shadow war too, not merely the army. A ruler who has
      // stepped out of the age cannot answer a scout or hunt a spy — there is
      // nobody home to catch anyone — so leaving covert work open would make an
      // absence a standing invitation to be read and robbed at no risk. It also
      // keeps one sentence true everywhere: while you are away, NOTHING lands.
      if (target.onVacation)
        throw new EngineError("vacation", "They are away from the world and cannot be touched.");

      // Clan war doubles what sabotage achieves (COVERT_WAR_MULTIPLIER).
      const targetClan = target.clanId ? world.clans[target.clanId] : undefined;
      // Formally at war is not enough — the target's Beacon may still be
      // sounding, in which case their people take peacetime damage.
      const covertWar = warIsHot(clan, targetClan, tick);
      const r = runCovertOp(player, target, str(args.op), num(args.agents), tick, Math.random, covertWar);
      // Remember the order so the consoles can open on it next time.
      if (r.op.arm === "scout") {
        r.attacker.lastScoutOp = r.op.id;
        r.attacker.lastScoutAgents = num(args.agents);
      } else {
        r.attacker.lastSpyOp = r.op.id;
        r.attacker.lastSpyAgents = num(args.agents);
      }
      // File the report BEFORE `put`, so what is persisted carries it. The
      // detail is stored verbatim: a scout report is a snapshot of what was
      // true when the rangers looked, and it must never silently refresh.
      const reportId = randomUUID();
      recordCovert(
        r.attacker,
        {
          id: reportId,
          tick,
          arm: r.op.arm,
          opId: r.op.id,
          opName: r.op.name,
          targetId: target.id,
          targetName: target.name,
          sent: r.sent,
          intercepted: r.intercepted,
          exposed: r.exposed,
          detail: r.detail,
          facts: r.facts,
          turnsSpent: r.turnsSpent,
          resourcesDestroyed: r.resourcesDestroyed,
          gearDestroyed: r.gearDestroyed,
        },
        tick,
      );
      put(r.attacker);
      // Counter-ops act on your OWN realm, so the "defender" is you.
      if (r.defender.id !== player.id) world.players[target.id] = r.defender;

      if (!r.exposed && ((r.resourcesDestroyed ?? 0) > 0 || (r.gearDestroyed ?? 0) > 0)) {
        const records = world.eraRecords ?? (world.eraRecords = newEraRecords());
        recordSpyFeat(records, player.id, player.name, clanCode(clan?.name), {
          resourcesDestroyed: r.resourcesDestroyed,
          gearDestroyed: r.gearDestroyed,
        });
      }
      // The right EVENT for the arm. Both used to arrive as "spyReport", which
      // is why the scoutReport line in eventLine never fired — and why a scout
      // report was coloured and worded as though shadows had gone over a wall.
      // Both carry the report id, so the tiding is a one-line summary with a
      // link rather than a wall of figures nobody reads in a feed.
      pushInbox(
        world,
        player.id,
        r.op.arm === "scout"
          ? { type: "scoutReport", targetName: target.name, detail: r.detail, reportId, opId: r.op.id }
          : {
              type: "spyReport",
              op: r.op.name,
              targetName: target.name,
              caught: r.exposed,
              detail: r.detail,
              reportId,
              opId: r.op.id,
            },
      );
      if (r.exposed) {
        // Being caught names you — that is the whole risk of going over a wall.
        pushInbox(world, target.id, {
          type: "spiesCaught",
          attackerName: player.name,
          executed: r.intercepted,
          op: r.op.name,
        });
      } else if (r.victimDetail) {
        pushInbox(world, target.id, { type: "sabotaged", detail: r.victimDetail });
      }
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
      return {
        ok: true,
        message: r.lost
          ? `The caravan turns for home — ${r.returned.toLocaleString("en-US")} recovered, ${r.lost.toLocaleString("en-US")} lost on the road.`
          : "The caravan turns for home.",
      };
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
            goldNet: f.netGold, // already a whole number
          });
        }
      }
      return;
    }

    // ── The Black Market (the fence) ──────────────────────────────────
    // Settled against the SYSTEM, not a player: instant, unlimited, and
    // deliberately the worst price on both sides. No caravan, no travel,
    // no counterparty to race.
    case "blackMarketSell": {
      const resource = args.resource as Resource;
      const r = blackMarketSell(player, resource, num(args.amount));
      put(r.player);
      return {
        ok: true,
        message: `The fence takes ${num(args.amount).toLocaleString("en-US")} ${resource} for ${r.gold.toLocaleString("en-US")} gold.`,
      };
    }
    case "blackMarketBuy": {
      const resource = args.resource as Resource;
      const r = blackMarketBuy(player, resource, num(args.amount));
      put(r.player);
      return {
        ok: true,
        message: `${num(args.amount).toLocaleString("en-US")} ${resource} delivered for ${r.cost.toLocaleString("en-US")} gold.`,
      };
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
      player.everJoinedClan = true; // founding counts — see ARMY_FLOORS
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
      // Validate rather than cast: an unrecognised `which` used to fall through
      // to the Wonder branch and quietly build the wrong thing.
      const r = buildClanBuilding(clan, player, clanWorksArg(args.which));
      put(r.player);
      world.clans[clan.id] = r.clan;
      return;
    }
    case "clanRepair": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      world.clans[clan.id] = repairClanBuilding(clan, player.id, clanWorksArg(args.which));
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
    case "clanGift": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const to = world.players[str(args.toId)];
      if (!to) throw new EngineError("target", "No such empire");
      const what = str(args.what) as Resource | "gold";
      const r = giftToMember(player, to, clan, what, num(args.amount));
      put(r.sender);
      world.players[to.id] = r.recipient;
      // Aid is ledgered now (both directions, same book as the vault), so the
      // clan comes back changed and has to be written or the cap never bites.
      world.clans[clan.id] = r.clan;
      pushInbox(world, to.id, {
        type: "clanEvent",
        detail: `${player.name} sends you ${r.sent.toLocaleString("en-US")} ${what} in aid.`,
      });
      return {
        ok: true,
        message: `${r.sent.toLocaleString("en-US")} ${what} sent — ${r.taxed.toLocaleString("en-US")} lost to the levy.`,
      };
    }
    case "clanMute": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      if (!isLeadership(clan, player.id)) {
        throw new EngineError("rank", "Only leadership may silence a member");
      }
      const who = str(args.playerId);
      if (who === player.id) throw new EngineError("target", "Silence someone other than yourself");
      if (isLeadership(clan, who)) throw new EngineError("rank", "Leadership cannot be silenced");
      const days = num(args.days);
      world.clans[clan.id] = days > 0 ? muteClanMember(clan, who, days, tick) : unmuteClanMember(clan, who);
      const name = world.players[who]?.name ?? "They";
      return {
        ok: true,
        message: days > 0 ? `${name} is silenced in the hall for ${days} day${days === 1 ? "" : "s"}.` : `${name} may speak again.`,
      };
    }
    case "clanDeclareWar": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      if (clan.leaderId !== player.id && clan.viceLeaderId !== player.id)
        throw new EngineError("rank", "Only the Leader or Vice may declare war");
      const target = world.clans[str(args.clanId)];
      if (!target) throw new EngineError("clan", "No such clan");
      // Both banners record the war, from the same instant — the Beacon grace
      // is measured from it and either side may be the one attacked.
      const declared = declareWar(clan, target, tick);
      world.clans[clan.id] = declared.clan;
      world.clans[target.id] = declared.target;
      for (const m of [...clan.members, ...target.members]) {
        pushInbox(world, m, { type: "clanEvent", detail: `${clan.name} declares war on ${target.name}!` });
      }
      pushChronicle(world, "war", `⚔ ${clan.name} declares WAR upon ${target.name}!`);
      return;
    }
    // ── Alliances ─────────────────────────────────────────────────────
    // Nothing here PREVENTS an attack on an ally. The pact is a promise, and
    // what gives a promise weight is that breaking it is public — see the
    // treachery path in doAttack.
    case "clanAllyOffer": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const target = world.clans[str(args.clanId)];
      if (!target) throw new EngineError("clan", "No such clan");
      const r = offerAlliance(clan, target, player.id, tick);
      world.clans[clan.id] = r.clan;
      world.clans[target.id] = r.target;
      // offerAlliance folds straight into an accept when they had already
      // offered us — so report what actually happened, not what was asked.
      const sealed = areAllied(r.clan, r.target);
      for (const m of target.members) {
        pushInbox(world, m, {
          type: "clanEvent",
          detail: sealed
            ? `🤝 ${clan.name} accepts your alliance — the banners stand together.`
            : `🤝 ${clan.name} offers your clan an alliance. Your leadership may answer it.`,
        });
      }
      if (sealed) {
        for (const m of clan.members) {
          pushInbox(world, m, {
            type: "clanEvent",
            detail: `🤝 Your clan is now allied with ${target.name}.`,
          });
        }
        pushChronicle(world, "clan", `🤝 ${clan.name} and ${target.name} are allied.`);
      }
      return {
        ok: true,
        message: sealed
          ? `Alliance sealed with ${target.name}.`
          : `Alliance offered to ${target.name}.`,
      };
    }
    case "clanAllyAccept": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const target = world.clans[str(args.clanId)];
      if (!target) throw new EngineError("clan", "No such clan");
      const r = acceptAlliance(clan, target, player.id);
      world.clans[clan.id] = r.clan;
      world.clans[target.id] = r.target;
      for (const m of [...clan.members, ...target.members]) {
        pushInbox(world, m, {
          type: "clanEvent",
          detail: `🤝 ${clan.name} and ${target.name} are now allied.`,
        });
      }
      pushChronicle(world, "clan", `🤝 ${clan.name} and ${target.name} are allied.`);
      return { ok: true, message: `Allied with ${target.name}.` };
    }
    case "clanAllyDecline": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const fromId = str(args.clanId);
      world.clans[clan.id] = declineAlliance(clan, fromId, player.id);
      const from = world.clans[fromId];
      if (from) {
        for (const m of from.members) {
          pushInbox(world, m, {
            type: "clanEvent",
            detail: `${clan.name} declines your offer of alliance.`,
          });
        }
      }
      return { ok: true, message: `Offer from ${from?.name ?? "that clan"} declined.` };
    }
    case "clanAllyEnd": {
      if (!clan) throw new EngineError("clan", "You have no clan");
      const target = world.clans[str(args.clanId)];
      if (!target) throw new EngineError("clan", "No such clan");
      const r = endAlliance(clan, target, player.id);
      world.clans[clan.id] = r.clan;
      world.clans[target.id] = r.target;
      for (const m of [...clan.members, ...target.members]) {
        pushInbox(world, m, {
          type: "clanEvent",
          detail: `🤝 The alliance between ${clan.name} and ${target.name} is ended.`,
        });
      }
      pushChronicle(world, "clan", `🤝 ${clan.name} and ${target.name} go their separate ways — the alliance is ended.`);
      return { ok: true, message: `Alliance with ${target.name} ended.` };
    }

    case "clanBombard":
      return doClanBombard(world, player, str(args.clanId), str(args.which));

    // ── Forum ─────────────────────────────────────────────────────────
    case "chat": {
      const body = str(args.body).trim().slice(0, 800);
      if (!body) throw new EngineError("body", "Say something");
      let channel = str(args.channel);
      const isLetter = channel.startsWith("dm:");
      if (channel === "clan") {
        if (!clan) throw new EngineError("clan", "You have no clan");
        // Silenced members keep reading; they just cannot add to it.
        if (clanMuted(clan, player.id, tick)) {
          throw new EngineError("muted", "Your leadership has silenced you in the hall. You can still read it.");
        }
        channel = `clan:${clan.id}`;
      } else if (isLetter) {
        const other = channel.slice(3);
        if (!world.players[other]) throw new EngineError("dm", "No such empire");
        channel = dmChannel(player.id, other);
      } else {
        channel = "era";
      }
      // Letters are exempt: a private thread with one other ruler is not a room
      // anyone can be shouted out of.
      if (!isLetter) {
        const now = Date.now();
        const tooSoon = chatLimitProblem(player, now);
        if (tooSoon) throw new EngineError("rate", tooSoon);
        recordChat(player, now);
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
  // TWO different questions, deliberately kept apart:
  //   clanWar  — are we formally at war? decides what is ALLOWED (validateAttack)
  //   warHot   — has the defender's Beacon grace run out? decides how HARD the
  //              blow lands (double damage, 100% loot). See warIsHot.
  const clanWar = atWar(aClan, dClan);
  const warHot = warIsHot(aClan, dClan, tick);

  // TREACHERY. An alliance never blocks a blow — a pact you physically cannot
  // break is not a promise, it is a cage. What it does is make the blow cost
  // something no battle report can undo: the pact is torn up on both sides and
  // the name goes into the world chronicle, where it stays for the age.
  //
  // The player must say so first. `breakAlliance` comes from the confirmation
  // the console puts in front of them (AllyStrikeDialog); without it the strike
  // is refused with the warning rather than committed by accident.
  const allied = areAllied(aClan, dClan);
  if (allied && String(args.breakAlliance ?? "") !== "1") {
    throw new EngineError(
      "ally",
      `${dClan!.name} is your ALLY. Striking them breaks the alliance and the treachery is written into the world chronicle. Confirm to proceed.`,
    );
  }

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
    vacationReattackCooldownTicks: VACATION_REATTACK_COOLDOWN_TICKS,
  });
  if (err) throw new EngineError("attack", err);

  const battleId = randomUUID();
  const opts = { rng: Math.random, warBonus: warHot, battleId, tick };
  const outcome =
    mode === "bombard"
      ? resolveBombard(attacker, defender, opts)
      : resolveBattle(attacker, defender, mode, opts);

  const a = outcome.attacker;
  const d = outcome.defender;

  // The attack itself: 10 action turns; attacking drops your own newcomer
  // shield. (You can't attack while onVacation, so there's no flag to lift.)
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

  // The pact dies with the blow. Done AFTER the battle resolves, not before, so
  // a strike that was refused for any other reason leaves the alliance intact —
  // treachery is what LANDED, not what was attempted.
  if (allied && aClan && dClan) {
    const torn = breakAllianceByTreachery(aClan, dClan);
    world.clans[aClan.id] = torn.a;
    world.clans[dClan.id] = torn.b;
    for (const m of [...aClan.members, ...dClan.members]) {
      pushInbox(world, m, {
        type: "clanEvent",
        detail: `🗡 TREACHERY — ${a.name} of ${aClan.name} strikes ${d.name} of ${dClan.name}. The alliance is broken.`,
      });
    }
    // The whole world reads this one. An alliance is only worth signing if
    // breaking it is remembered.
    pushChronicle(
      world,
      "war",
      `🗡 TREACHERY — ${a.name} of ${aClan.name} strikes their ally ${d.name} of ${dClan.name}. The alliance between ${aClan.name} and ${dClan.name} is broken.`,
    );
  }

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
        if (p) p.army.experiencePoints = Math.max(0, p.army.experiencePoints * 0.95);
      }
      for (const id of r.ours.members) {
        const p = world.players[id];
        if (p) p.army.experiencePoints = p.army.experiencePoints * 1.05;
      }
    }
  }

  return { ok: true, battleId, message: `Battle resolved: ${outcome.report.victor}` };
}

/**
 * Depart on, or return from, Vacation (spec/combat.md). This is the *standing*
 * withdrawal from the age — not a battlefield yield, which the engine decides
 * for you mid-fight (see `resolveBattle`). Vacation makes you untouchable by
 * everything — attacks, revenge, rangers and spies alike (the covert half is
 * enforced in the `covert` case above) — halves tax, cuts production by four
 * fifths and research by seven tenths, and spends an era-limited budget of
 * days. You can't depart while
 * a revenge hangs over you — it queues instead, taking effect once every such
 * window closes. Returning starts a re-attack cooldown so vacation can't be used
 * as a siege-dodge, and — for an absence of at least six hours — buys an hour of
 * shield so coming home is not itself a punishment.
 */
function doVacation(world: World, player: Player, away: boolean): CommandResult {
  const tick = world.meta.tickNumber;
  const p = player;

  if (!away) {
    const wasAway = p.onVacation;
    if (!wasAway) {
      p.vacationQueued = false;
      world.players[p.id] = p;
      return { ok: true, message: "Departure called off." };
    }
    const { shieldedUntilTick } = returnFromVacation(p, tick);
    world.players[p.id] = p;
    return {
      ok: true,
      message: shieldedUntilTick
        ? `You are back in the world under a ${VACATION_RETURN_SHIELD_TICKS / TICKS_PER_HOUR}-hour shield — bank your gold and muster while it holds. No fresh attacks of your own for ${VACATION_REATTACK_COOLDOWN_TICKS / TICKS_PER_HOUR} hours (revenge excepted).`
        : `You are back in the world — and you were away under ${VACATION_RETURN_SHIELD_MIN_TICKS / TICKS_PER_HOUR} hours, so there is NO shield. You are a target from this moment. No fresh attacks of your own for ${VACATION_REATTACK_COOLDOWN_TICKS / TICKS_PER_HOUR} hours (revenge excepted).`,
    };
  }

  if (p.onVacation) return { ok: true, message: "You are already away." };
  if ((p.vacationTicksUsed ?? 0) >= VACATION_TICKS_PER_ERA) {
    throw new EngineError(
      "vacation",
      `You have spent your ${VACATION_DAYS_PER_ERA} days of vacation for this age — there is no hiding now.`,
    );
  }
  if (revengePendingOn(world, p.id, tick)) {
    p.vacationQueued = true;
    world.players[p.id] = p;
    return {
      ok: true,
      message:
        "A revenge still hangs over you — your vacation is queued. You depart once every revenge window against you has closed.",
    };
  }
  departOnVacation(p, tick);
  world.players[p.id] = p;
  return {
    ok: true,
    message:
      "You have gone on vacation — nothing reaches you now: no attack, no revenge, no ranger, no spy. Half tax, a fifth of your production, a third of your research. Settlers keep arriving as long as you have beds for them.",
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
  if (which !== "storage" && which !== "hall" && which !== "wonder" && which !== "beacon") {
    throw new EngineError("target", "Choose a clan building to bombard");
  }
  const target = which as ClanBuilding;
  if (attacker.onVacation) throw new EngineError("vacation", "You are on vacation — come back to the world first");
  if (attacker.starving) throw new EngineError("starving", "Starving armies will not march");
  if (tick - world.meta.eraStartedAtTick < ERA_PEACE_TICKS) {
    throw new EngineError("peace", "The era peace holds — no attacks in the first 5 days");
  }
  if (attacker.turnsAvailable < 10) throw new EngineError("turns", "A bombardment costs 10 action turns");

  const buildingLevel = worksLevel(tClan, target);
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
  a.onVacation = false;
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
