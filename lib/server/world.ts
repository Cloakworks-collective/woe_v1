// World lifecycle: seeding, the 10-minute tick (with catch-up), the daily
// reset, tribute siphons, and the era victory clocks (spec/overview.md).

import {
  CLAN_BUILDING_POINTS,
  ERA_PEACE_DAYS,
  EXPERIENCE,
  HOLD_CLOCKS,
  ARMY_FLOORS,
  WONDER_MAX_LEVEL,
  VACATION_TICKS_PER_ERA,
  TICKS_PER_HOUR,
  TURNS_PER_DAY,
  TURN_MINUTES,
  WAR,
} from "../constants";
import type { Race } from "../constants/races";
import {
  civilians,
  hallPenaltyFactor,
  departOnVacation,
  lapseStaleWar,
  marketPrice,
  military,
  newClan,
  newEmpire,
  normalizeClan,
  normalizePlayer,
  processDailyReset,
  processSteward,
  processTurnTick,
  rankingScore,
  totalPopulation,
  type Clan,
  type Player,
  regularTroops,
  type Resource,
} from "../engine";
import {
  cloneWorld,
  invalidateWorldCache,
  loadWorld,
  pushChronicle,
  pushInbox,
  saveWorld,
  WorldConflictError,
  type ArchivedAge,
  type TickRun,
  type World,
} from "./store";
import { fetchServiceWorld, worldServiceEnabled } from "./worldClient";
import { buildEraTables } from "./eraTables";

export const ERA_PEACE_TICKS = ERA_PEACE_DAYS * TURNS_PER_DAY;
export const REVENGE_WINDOW_TICKS = 18 * TICKS_PER_HOUR;

// ── Presence & public empire numbers (ladder display) ───────────────────────

/** A ruler counts as Online within 15 minutes of their last page/command. */
export const ONLINE_WINDOW_MS = 15 * 60 * 1000;

export function isOnline(p: Player, now = Date.now()): boolean {
  return !!p.lastSeenAtMs && now - p.lastSeenAtMs < ONLINE_WINDOW_MS;
}

/** Does anyone still hold an open revenge against this player? True if some
 *  empire they attacked can still strike back (personal window), or a clan they
 *  bombarded holds a live clan-revenge against their banner. Gates vacation. */
export function revengePendingOn(world: World, playerId: string, tick: number): boolean {
  for (const q of Object.values(world.players)) {
    if (q.id === playerId) continue;
    if (
      q.recentAttackers.some(
        (a) =>
          a.playerId === playerId &&
          tick - a.tick <= REVENGE_WINDOW_TICKS &&
          !q.revengeUsed.includes(playerId),
      )
    ) {
      return true;
    }
  }
  const clanId = world.players[playerId]?.clanId;
  if (clanId) {
    for (const c of Object.values(world.clans)) {
      const r = c.pendingRevenge;
      if (r && r.againstClanId === clanId && tick <= r.expiresAtTick) return true;
    }
  }
  return false;
}

/** Public empire numbers ("ID" on the ladder): stable ordinals derived from
 *  founding order (joinedAtTick, then id) — no stored counter needed. */
export function empireNumbers(world: World): Map<string, number> {
  const ordered = Object.values(world.players).sort(
    (a, b) => a.joinedAtTick - b.joinedAtTick || a.id.localeCompare(b.id),
  );
  return new Map(ordered.map((p, i) => [p.id, i + 1]));
}

// ── Seeding ─────────────────────────────────────────────────────────────────

/** A bot empire at a given target population, safe from starving/scattering. */
function bot(id: string, name: string, race: Race, pop: number): Player {
  const p = newEmpire({ id, name, race, joinedAtTick: 0, isBot: true });
  const civ = Math.round(pop * 0.7);
  const mil = pop - civ;
  const L = Math.max(1, Math.min(10, Math.round(pop / 150)));

  p.buildings = {
    grange: L,
    masons_quarry: L,
    deepvein_mine: L,
    sawyers_mill: L,
    granary: Math.max(1, L - 1),
    timberyard: Math.max(1, L - 1),
    masons_yard: Math.max(1, L - 1),
    ironhold: Math.max(1, L - 1),
    counting_house: Math.max(1, L - 1),
    market_square: Math.max(1, L - 2),
    collegium: Math.max(1, L - 1),
    shadow_guild: Math.max(1, L - 2),
    rangers_lodge: Math.max(1, L - 2),
    hearthstead: Math.ceil(civ / 10) + 4,
    muster_hall: Math.ceil(mil / 10) + 2,
    drill_yard: Math.min(3, Math.ceil(L / 3)),
    fletchers_range: Math.min(3, Math.ceil(L / 4)),
    knights_stables: Math.min(3, Math.ceil(L / 4)),
    forge: Math.min(3, Math.ceil(L / 3)),
    war_foundry: Math.min(10, L),
    walls: Math.min(10, L),
  };

  const slots = 20 * L;
  const farmers = Math.min(slots, Math.ceil(pop * 0.05));
  const each = Math.min(slots, Math.ceil(pop * 0.035));
  const researchers = Math.min(20 * (p.buildings.collegium ?? 0), Math.ceil(pop * 0.02));
  p.workers = {
    farmers,
    quarrymen: each,
    miners: each,
    lumberjacks: each,
    merchants: Math.min(20 * (p.buildings.market_square ?? 0), 3),
    researchers,
  };
  const spies = Math.min(20 * (p.buildings.shadow_guild ?? 0), Math.round(pop * 0.01));
  const scouts = Math.min(20 * (p.buildings.rangers_lodge ?? 0), Math.round(pop * 0.015));
  p.army.spies = spies;
  p.army.scouts = scouts;
  p.idlePeasants = Math.max(0, civ - farmers - each * 3 - p.workers.merchants - researchers - spies - scouts);

  const arch = Math.round(mil * 0.2);
  const cav = Math.round(mil * 0.12);
  const eng = Math.round(mil * 0.05);
  const foot = Math.max(0, mil - arch - cav - eng); // the balance are footmen
  const tiered = (n: number) =>
    L >= 6
      ? { light: Math.round(n * 0.4), medium: Math.round(n * 0.45), heavy: Math.round(n * 0.15) }
      : L >= 3
        ? { light: Math.round(n * 0.6), medium: Math.round(n * 0.4), heavy: 0 }
        : { light: n, medium: 0, heavy: 0 };
  p.army.footmen = tiered(foot);
  p.army.archers = tiered(arch);
  p.army.cavalry = tiered(cav);
  p.army.siegeEngineers = eng;
  p.army.siegeGear = {
    siege_towers: L >= 7 ? 2 : 0,
    ropes: L >= 1 ? 4 : 0,
    ladders: L >= 3 ? 3 : 0,
    rams: L >= 5 ? 2 : 0,
    ballistae: L >= 7 ? 2 : 0,
    trebuchets: L >= 9 ? 2 : 0,
  };
  // Bots seeded straight onto the ledger: level 10 lands at +50%.
  p.army.experiencePoints = Math.min(60, L * 5) * (EXPERIENCE.POINTS_FOR_DOUBLE / 100);

  p.gold = pop * 5;
  p.bankedGold = Math.min(pop * 2, 20000 * (p.buildings.counting_house ?? 0));
  p.resources = { food: pop * 25, wood: pop * 18, stone: pop * 15, ore: pop * 12 };
  if (L >= 3) p.research.levels = { crop_rotation: 1, masonry: 1, art_of_war: L >= 6 ? 2 : 1 };
  return p;
}

export function seedWorld(now = new Date()): World {
  const players: Record<string, Player> = {};
  const add = (p: Player) => (players[p.id] = p);

  add(bot("bot-freeholt", "Freeholt", "human", 260));
  add(bot("bot-sylvangrove", "Sylvangrove", "elf", 380));
  add(bot("bot-bloodfang", "Bloodfang Horde", "orc", 520));
  add(bot("bot-nightpaw", "Nightpaw Dens", "gnoll", 640));
  add(bot("bot-eldervale", "Eldervale", "elf", 900));
  add(bot("bot-grimhold", "Grimhold", "dwarf", 1150));
  add(bot("bot-stonewatch", "Stonewatch", "troll", 1500));
  add(bot("bot-karakdun", "Karak Dûn", "dwarf", 2100));

  // A seeded clan so clan mechanics are testable from day one.
  const clans: Record<string, Clan> = {};
  const ironPact = newClan("clan-ironpact", "The Iron Pact", players["bot-grimhold"]);
  ironPact.members.push("bot-karakdun");
  for (const id of ["bot-grimhold", "bot-karakdun"]) {
    players[id].clanId = ironPact.id;
    players[id].everJoinedClan = true; // bars the solo crown, same as any player
  }
  ironPact.buildings.storageLevel = 2;
  ironPact.storage = { gold: 220000, food: 40000, wood: 90000, stone: 90000, ore: 90000 };
  clans[ironPact.id] = ironPact;

  return {
    meta: {
      // The world begins five days in: the era peace has just lifted.
      tickNumber: ERA_PEACE_TICKS,
      eraNumber: 1,
      eraName: "The First Dawn",
      eraStartedAtTick: 0,
      lastTickAt: now.toISOString(),
      overlordClocksMs: {},
      overlordAccruing: null,
      clanClocksMs: {},
      clanAccruing: null,
    },
    players,
    clans,
    orders: [
      // Opening asks so the Bazaar isn't a ghost town. Prices are whole gold
      // per unit, bounded to the MARKET_PRICE_MIN..MAX band (2–50); food is the
      // cheapest staple, ore the dearest war-metal.
      { id: "seed-1", sellerId: "bot-eldervale", resource: "wood", remaining: 4000, pricePerUnit: 8, createdTick: 700 },
      { id: "seed-2", sellerId: "bot-stonewatch", resource: "stone", remaining: 3000, pricePerUnit: 12, createdTick: 705 },
      { id: "seed-3", sellerId: "bot-karakdun", resource: "ore", remaining: 2500, pricePerUnit: 20, createdTick: 710 },
      { id: "seed-4", sellerId: "bot-nightpaw", resource: "food", remaining: 5000, pricePerUnit: 5, createdTick: 715 },
    ],
    battles: [],
    priceHistory: { food: [], wood: [], stone: [], ore: [] },
    chronicle: [
      {
        tick: ERA_PEACE_TICKS,
        at: now.toISOString(),
        tone: "crown",
        text: "🌅 A new age dawns. The five days of peace lift — let the race for the crown begin.",
      },
    ],
    messages: [
      {
        id: "seed-m1",
        channel: "era",
        authorId: "bot-eldervale",
        authorName: "Eldervale",
        body: "The era peace has lifted. May your walls hold and your granaries overflow.",
        tick: ERA_PEACE_TICKS,
      },
    ],
    inbox: {},
  };
}

export async function getWorld(opts: { forceReload?: boolean } = {}): Promise<World> {
  // §14.2: when the single-writer service owns the world, read from it. All
  // writes go through it too (runCommand forwards), so this is read-only.
  if (worldServiceEnabled()) {
    const world = await fetchServiceWorld(opts);
    for (const p of Object.values(world.players)) normalizePlayer(p);
    for (const c of Object.values(world.clans)) normalizeClan(c);
    normalizeMeta(world.meta);
    return world;
  }

  let world = await loadWorld(opts);
  if (!world) {
    world = seedWorld();
    try {
      await saveWorld(world);
    } catch (e) {
      if (!(e instanceof WorldConflictError)) throw e;
      // Another instance seeded the world first — adopt theirs.
      world = (await loadWorld({ forceReload: true }))!;
    }
  }
  // Bring legacy saves into the current shape (typed mercenaries; no warrior
  // pool; §14.3 ms hold clocks). Idempotent, so it's safe to run on every load.
  for (const p of Object.values(world.players)) normalizePlayer(p);
  for (const c of Object.values(world.clans)) normalizeClan(c);
  normalizeMeta(world.meta);
  return world;
}

/** Full-jitter backoff (the AWS formulation): sleep a uniform random slice of an
 *  exponentially growing ceiling. Retrying with no delay is the mistake — every
 *  loser of a race wakes at the same instant and collides again, so contention
 *  never resolves, it re-synchronises. The randomness is what pulls the herd
 *  apart; the exponent just keeps a busy moment from spinning. Five attempts
 *  cost under 400ms of waiting even in the worst case. */
const RETRY_BASE_MS = 25;
const RETRY_CAP_MS = 400;

export function retryDelayMs(attempt: number, rand: () => number = Math.random): number {
  const ceiling = Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** (attempt - 1));
  return Math.floor(rand() * ceiling);
}

const defaultSleep = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

/**
 * The single safe way to mutate-and-persist the world under optimistic
 * concurrency (spec/architecture.md §14.1). Loads the world, takes a **private
 * copy**, runs `apply` on it (which mutates it and returns a result plus
 * whether it changed anything), then saves. If the save loses a
 * compare-and-swap race, it backs off, reloads a fresh world and **replays**
 * `apply` against it, up to `maxAttempts`. A read-only pass (`dirty: false`)
 * skips the save entirely — no write, no race.
 *
 * THE COPY IS LOAD-BEARING. `getWorld` returns the shared cached object, and
 * under Fluid Compute concurrent requests share one Node instance — so without
 * it, two commands mutate the same world. The first would serialize the
 * second's half-applied changes into its own write; the second would then lose
 * the CAS, reload a world already containing its effects, and apply its command
 * a second time. Isolating the draft is what makes replay safe rather than
 * cumulative.
 *
 * `apply` must be replay-safe: it may run more than once, each time on a fresh
 * world, so it should derive everything from the world it's handed (no reliance
 * on a prior attempt's mutations). RNG is fine — a replayed command simply
 * resolves fresh against current state, since the losing attempt never
 * persisted. `load`/`save`/`clone`/`sleep` are injectable for tests.
 */
export async function commitWithRetry<T>(
  apply: (world: World) => { result: T; dirty: boolean },
  opts: {
    maxAttempts?: number;
    load?: (forceReload: boolean) => Promise<World>;
    save?: (world: World) => Promise<void>;
    clone?: (world: World) => World;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<T> {
  const max = opts.maxAttempts ?? 5;
  const load = opts.load ?? ((forceReload: boolean) => getWorld({ forceReload }));
  const save = opts.save ?? saveWorld;
  const clone = opts.clone ?? cloneWorld;
  const sleep = opts.sleep ?? defaultSleep;
  let lastConflict: unknown;
  for (let attempt = 0; attempt < max; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs(attempt));
    const world = clone(await load(attempt > 0));
    const { result, dirty } = apply(world);
    if (!dirty) return result; // pure read — nothing to persist, nothing to race
    try {
      await save(world);
      return result;
    } catch (e) {
      if (!(e instanceof WorldConflictError)) throw e;
      lastConflict = e;
      invalidateWorldCache(); // force the next attempt to re-fetch + re-version
    }
  }
  throw lastConflict ?? new WorldConflictError("world commit exhausted its retries");
}

/**
 * The world with its clock current — for any route that only READS.
 *
 * The trap this replaces was `getWorld()` followed by a bare `runDueTicks(world)`:
 * that ticks every player on the SHARED cached object and then throws the result
 * away unpersisted. It never corrupted anything (the store's `lastTickAt` is
 * untouched, so the work is simply recomputed — the same structural idempotence
 * the heartbeat relies on), but it burned the work on every read and mutated the
 * object other in-flight requests are reading from.
 *
 * So: ask what is owed first. A tick lands once per 10 minutes, so nearly every
 * read owes nothing and returns immediately. When something IS owed it goes
 * through `commitWithRetry` like any other write — the ticks are persisted once,
 * by whoever noticed first, instead of recomputed by every reader.
 */
export async function getCurrentWorld(): Promise<World> {
  // §14.2: the service owns the clock; a read just fetches it.
  if (worldServiceEnabled()) return getWorld();
  const world = await getWorld();
  if (ticksDue(world) <= 0) return world;
  return commitWithRetry((w) => {
    const processed = runDueTicks(w);
    return { result: w, dirty: processed > 0 };
  });
}

// ── The tick ────────────────────────────────────────────────────────────────

export function runOneTick(world: World, nowMs = Date.now()): void {
  world.meta.tickNumber += 1;
  const tick = world.meta.tickNumber;

  for (const p of Object.values(world.players)) {
    const clan = p.clanId ? world.clans[p.clanId] : undefined;
    const before = { gold: p.gold, ...p.resources };
    const { player: next, events } = processTurnTick(p, {
      currentTick: tick,
      hallPenaltyFactor: hallPenaltyFactor(clan),
    });
    world.players[p.id] = next;
    for (const e of events) pushInbox(world, p.id, e);

    // War tribute: 20% of this tick's gains siphon to the victor's storage.
    if (clan?.tribute && clan.tribute.endsAtTick > tick) {
      const winner = world.clans[clan.tribute.toClanId];
      if (winner && clan.tribute.collectedGoldEq < WAR.TRIBUTE_CAP_GOLD_EQ) {
        const take = (kind: "gold" | Resource, gained: number) => {
          const cut = Math.max(0, Math.floor(gained * WAR.TRIBUTE_RATE));
          if (cut === 0) return;
          if (kind === "gold") next.gold -= cut;
          else next.resources[kind] -= cut;
          winner.storage[kind] += cut;
          clan.tribute!.collectedGoldEq += cut; // resources valued 1:1 for the cap
        };
        take("gold", next.gold - before.gold);
        for (const r of ["food", "wood", "stone", "ore"] as Resource[]) {
          take(r, next.resources[r] - before[r]);
        }
      }
    }

    // The Steward (premium): build/research queues + standing orders.
    if (next.premium) {
      const s = processSteward(world.players[p.id]);
      world.players[p.id] = s.player;
      for (const e of s.events) pushInbox(world, p.id, e);
    }
  }

  // Queued vacations: depart once every revenge window has closed (and the era
  // budget still has room). Done after the main pass so this tick's revenge
  // windows are settled.
  for (const p of Object.values(world.players)) {
    if (!p.vacationQueued || p.onVacation) continue;
    if ((p.vacationTicksUsed ?? 0) >= VACATION_TICKS_PER_ERA) {
      p.vacationQueued = false;
      pushInbox(world, p.id, {
        type: "info",
        detail: "Your queued vacation is void — your vacation days for this age are spent.",
      });
    } else if (!revengePendingOn(world, p.id, tick)) {
      // Stamped HERE, not when the queue was joined — the absence starts when
      // you actually leave, and the return shield is measured from it.
      departOnVacation(p, tick);
      pushInbox(world, p.id, {
        type: "info",
        detail: "The last revenge window against you has closed — you depart on vacation.",
      });
    }
  }

  // Wars nobody is fighting lapse (checked hourly — the clock is 72h, so this
  // is plenty fine-grained and keeps it off the per-tick hot path).
  if (tick % TICKS_PER_HOUR === 0) lapseQuietWars(world, tick);

  // Market price history — one sample per hour, ~2 weeks kept.
  if (tick % TICKS_PER_HOUR === 0) {
    world.priceHistory ??= { food: [], wood: [], stone: [], ore: [] };
    for (const r of ["food", "wood", "stone", "ore"] as const) {
      const series = world.priceHistory[r];
      series.push({ t: tick, p: marketPrice(world.orders, r, tick) });
      if (series.length > 336) series.splice(0, series.length - 336);
    }
  }

  // Daily reset — recruitment then scattering.
  // Dawn, on each ruler's OWN clock. A player in Delhi and one in New York
  // should both be able to be awake for their recruitment, so the hour is
  // theirs to set once an era (see setRecruitHour). An empire that has never
  // moved it has no `nextRecruitAtTick` and keeps the old global dawn, which
  // means no migration for anyone already playing.
  for (const p of Object.values(world.players)) {
    const due = p.nextRecruitAtTick;
    const dawn = due === undefined ? tick % TURNS_PER_DAY === 0 : tick >= due;
    if (!dawn) continue;
    const { player: next, events } = processDailyReset(p, tick);
    next.lastRecruitAtTick = tick;
    // Anchored to the schedule, not to `tick`, so a catch-up run cannot drift
    // a ruler's dawn later and later.
    next.nextRecruitAtTick = (due ?? tick) + TURNS_PER_DAY;
    world.players[p.id] = next;
    for (const e of events) pushInbox(world, p.id, e);
  }

  updateCrown(world, nowMs);
}

/**
 * End every war that has gone quiet for WAR.STALE_HOURS. Each pair is judged
 * once: whoever led on net kills takes the record, and a war that never drew
 * blood simply lapses with no winner and no loser.
 */
function lapseQuietWars(world: World, tick: number): void {
  const seen = new Set<string>();
  for (const clan of Object.values(world.clans)) {
    for (const w of [...clan.wars]) {
      const other = world.clans[w.clanId];
      if (!other) continue;
      const pair = [clan.id, other.id].sort().join(":");
      if (seen.has(pair)) continue;
      seen.add(pair);

      const r = lapseStaleWar(clan, other, tick);
      if (!r.lapsed) continue;
      world.clans[clan.id] = r.a;
      world.clans[other.id] = r.b;

      const line = r.winner
        ? `⚔ The war between ${clan.name} and ${other.name} lapses after ${WAR.STALE_HOURS}h of quiet — ${
            world.clans[r.winner]?.name ?? "the leader"
          } held the field and takes the win. No tribute is paid.`
        : `⚔ The war between ${clan.name} and ${other.name} lapses after ${WAR.STALE_HOURS}h of quiet — no blood was drawn, so neither banner claims it.`;
      pushChronicle(world, "war", line);
      for (const m of [...r.a.members, ...r.b.members]) {
        pushInbox(world, m, { type: "clanEvent", detail: line.replace(/^⚔ /, "") });
      }
    }
  }
}

/** Process all wall-clock-due ticks (10 minutes each). Idempotent catch-up. */
/** How much heartbeat history the Crown Chamber keeps. */
const TICK_LOG_MS = 7 * 24 * 60 * 60 * 1000;

/** Append a heartbeat entry and drop anything older than a week. */
function recordTickRun(world: World, entry: TickRun): void {
  const log = world.tickLog ?? [];
  log.push(entry);
  const cutoff = Date.now() - TICK_LOG_MS;
  world.tickLog = log.filter((r) => Date.parse(r.at) >= cutoff);
}

/** How many ticks the wall clock owes this world — the whole basis of the
 *  heartbeat's idempotence, and cheap enough to ask before deciding whether a
 *  request needs to take the write path at all.
 *
 *  A WON AGE OWES NOTHING. Once someone has taken the crown the world stops:
 *  no production, no growth, no clocks. `eraReset` builds a fresh world with a
 *  fresh `lastTickAt`, so nothing accumulates while the age sits sealed and the
 *  next era does not open owing a backlog. */
export function ticksDue(world: World, now = new Date()): number {
  if (world.meta.winner) return 0;
  const last = new Date(world.meta.lastTickAt).getTime();
  return Math.floor((now.getTime() - last) / (TURN_MINUTES * 60 * 1000));
}

export function runDueTicks(world: World, now = new Date()): number {
  if (world.meta.winner) return 0; // the age is over — the world does not move
  const last = new Date(world.meta.lastTickAt).getTime();
  const step = TURN_MINUTES * 60 * 1000;
  const due = ticksDue(world, now);
  // Two weeks of downtime is the most we will replay in one go. Beyond that the
  // excess is DISCARDED, not deferred — lastTickAt jumps to the end of what we
  // actually ran, so the lost time never comes back. It is recorded loudly
  // below rather than swallowed.
  const CATCH_UP_CAP = 2016;
  const capped = Math.min(due, CATCH_UP_CAP);
  if (capped <= 0) return 0; // nothing due — not worth a log line

  // Each caught-up tick is credited at its own scheduled wall-clock time so the
  // §14.3 hold clocks stay monotonic through a catch-up run.
  const startedAt = Date.now();
  try {
    for (let i = 0; i < capped; i++) runOneTick(world, last + (i + 1) * step);
    world.meta.lastTickAt = new Date(last + capped * step).toISOString();
  } catch (e) {
    // Record the failure on the world before rethrowing, so a crashed tick is
    // visible in the Chamber rather than only in a server log nobody reads.
    recordTickRun(world, {
      at: new Date().toISOString(),
      tick: world.meta.tickNumber,
      processed: capped,
      ms: Date.now() - startedAt,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
  recordTickRun(world, {
    at: new Date().toISOString(),
    tick: world.meta.tickNumber,
    processed: capped,
    ms: Date.now() - startedAt,
    ok: true,
    ...(due > CATCH_UP_CAP
      ? { error: `clock ran ${due} ticks behind; ${due - CATCH_UP_CAP} were discarded at the catch-up cap` }
      : {}),
  });
  return capped;
}

// ── Victory clocks (spec/overview.md) ────────────────────────────────────────

export function clanScore(world: World, clan: Clan): number {
  let s = clan.members.reduce(
    (sum, id) => sum + (world.players[id] ? rankingScore(world.players[id]) : 0),
    0,
  );
  const b = clan.buildings;
  s += CLAN_BUILDING_POINTS.storage * b.storageLevel * b.integrity.storage;
  s += CLAN_BUILDING_POINTS.hall * b.hallLevel * b.integrity.hall;
  s += CLAN_BUILDING_POINTS.beacon * (b.beaconLevel ?? 0) * (b.integrity.beacon ?? 1);
  s += CLAN_BUILDING_POINTS.wonder * b.wonderLevel * b.integrity.wonder;
  return Math.round(s);
}

/** Milliseconds a completed cumulative hour is worth, and a tick's worth (for
 *  migrating legacy tick-counted clocks). */
export const MS_PER_HOUR = 3_600_000;
const TICK_MS = TURN_MINUTES * 60 * 1000;

/** A read-only view of a holder's hold time as of `nowMs`: cumulative closed
 *  intervals plus the current open one, and the live streak (the open interval). */
export interface HoldView {
  holderId?: string;
  cumMs: number;
  streakMs: number;
}

function holdView(clocksMs: Record<string, number>, accruing: { id: string; sinceMs: number } | null, nowMs: number): HoldView {
  if (!accruing) return { cumMs: 0, streakMs: 0 };
  const open = Math.max(0, nowMs - accruing.sinceMs);
  return { holderId: accruing.id, cumMs: (clocksMs[accruing.id] ?? 0) + open, streakMs: open };
}

/** The reigning empire's hold as of `nowMs` (default now). */
export function overlordHold(world: World, nowMs = Date.now()): HoldView {
  return holdView(world.meta.overlordClocksMs ?? {}, world.meta.overlordAccruing ?? null, nowMs);
}

/** The reigning clan's hold as of `nowMs` (default now). */
export function clanHold(world: World, nowMs = Date.now()): HoldView {
  return holdView(world.meta.clanClocksMs ?? {}, world.meta.clanAccruing ?? null, nowMs);
}

/**
 * Transition an accrual interval. When the eligible holder changes (a new #1, or
 * the current one dropping below the floor / losing the top), the outgoing
 * holder's open interval is closed — its exact elapsed ms credited to the
 * cumulative map — and a fresh interval opens for the new eligible holder (or
 * none). Returns the new open interval. Unchanged holder → the interval keeps
 * running (its ms are read live by `holdView`).
 */
function advanceAccrual(
  clocksMs: Record<string, number>,
  accruing: { id: string; sinceMs: number } | null,
  eligibleId: string | undefined,
  nowMs: number,
): { id: string; sinceMs: number } | null {
  if ((eligibleId ?? null) === (accruing?.id ?? null)) return accruing;
  if (accruing) clocksMs[accruing.id] = (clocksMs[accruing.id] ?? 0) + Math.max(0, nowMs - accruing.sinceMs);
  return eligibleId ? { id: eligibleId, sinceMs: nowMs } : null;
}

/**
 * §14.3 — event-driven, millisecond-accurate hold clocks. Called after every
 * command *and* every tick (i.e. every state change that can reorder the
 * ladder), not sampled once per 10-minute tick. Credits the crown-holder by
 * exact elapsed ms, so in the endgame the crown can flip many times inside a
 * tick and each holder is credited precisely for the moment they held it.
 */
export function updateCrown(world: World, nowMs = Date.now()): void {
  if (world.meta.winner) return;
  const players = Object.values(world.players);
  if (players.length === 0) return;

  // ── Grand Overlord ──
  const top = players.reduce((a, b) => (rankingScore(b) > rankingScore(a) ? b : a));

  // The crown is public — note it in the Annals whenever it changes hands.
  if (world.meta.crownHolderId !== top.id) {
    const hadPrev = world.meta.crownHolderId !== undefined;
    const prevName = world.meta.crownHolderId ? world.players[world.meta.crownHolderId]?.name : undefined;
    world.meta.crownHolderId = top.id;
    if (hadPrev) {
      pushChronicle(
        world,
        "crown",
        prevName
          ? `👑 The crown passes to ${top.name}, wrested from ${prevName}.`
          : `👑 ${top.name} claims the vacant crown — now #1 in all the realm.`,
      );
    }
  }

  // Only the #1 accrues, and only with a real army standing AND clean hands.
  //
  // NEVER-CLANNED is the load-bearing half. Without it the dominant strategy is
  // to join a clan, take its vault, its Works and its protection all era, leave
  // at the end, and take the solo crown on wealth the clan built. The individual
  // title is for someone who did it alone, so it asks that they *always* were.
  // One day of membership disqualifies for the age — see `everJoinedClan`.
  const soloEligible =
    regularTroops(top) >= ARMY_FLOORS.INDIVIDUAL && !top.everJoinedClan && !top.clanId;
  const overlordEligible = soloEligible ? top.id : undefined;
  // Tell the affected rulers whenever their Grand Overlord clock starts/stops.
  const prevOverlord = world.meta.overlordAccruing?.id;
  if (prevOverlord !== overlordEligible) {
    if (prevOverlord)
      pushInbox(world, prevOverlord, { type: "crownClock", scope: "overlord", gained: false, who: world.players[prevOverlord]?.name ?? "" });
    if (overlordEligible)
      pushInbox(world, overlordEligible, { type: "crownClock", scope: "overlord", gained: true, who: world.players[overlordEligible]?.name ?? "" });
  }
  world.meta.overlordClocksMs ??= {};
  world.meta.overlordAccruing = advanceAccrual(world.meta.overlordClocksMs, world.meta.overlordAccruing ?? null, overlordEligible, nowMs);

  const oh = overlordHold(world, nowMs);
  if (oh.holderId && oh.cumMs >= HOLD_CLOCKS.CUMULATIVE_HOURS * MS_PER_HOUR && oh.streakMs >= HOLD_CLOCKS.STREAK_HOURS * MS_PER_HOUR) {
    world.meta.winner = { kind: "overlord", id: oh.holderId, name: world.players[oh.holderId]?.name ?? "", atTick: world.meta.tickNumber };
    pushChronicle(
      world,
      "crown",
      `🏆 ${world.players[oh.holderId]?.name} is proclaimed GRAND OVERLORD — the age ends, and the next shall bear this name!`,
    );
    return;
  }

  // ── Clan victory ──
  const clans = Object.values(world.clans);
  if (clans.length === 0) return;
  const topClan = clans.reduce((a, b) => (clanScore(world, b) > clanScore(world, a) ? b : a));
  const clanRegulars = topClan.members.reduce(
    (sum, id) => sum + (world.players[id] ? regularTroops(world.players[id]) : 0),
    0,
  );
  const frozen = (topClan.clockFrozenUntilTick ?? 0) > world.meta.tickNumber;
  // A COMPLETED WONDER is the clan's price of entry. The army floor proves the
  // banner can fight; the Wonder proves it can build — and it is the single
  // most expensive thing in the game, gated behind Clan Storage 10, so it
  // cannot be rushed by one rich member in an afternoon. Without it a clan
  // could take the age purely by mustering troops, and the whole clan economy
  // (the pool, the 3× rule, the deep Storage the Wonder needs) would be
  // optional decoration.
  const wonderDone = (topClan.buildings.wonderLevel ?? 0) >= WONDER_MAX_LEVEL;
  const clanEligible =
    clanRegulars >= ARMY_FLOORS.CLAN && wonderDone && !frozen ? topClan.id : undefined;
  // Tell every member of the affected clan when the Clan Victory clock starts/stops.
  const prevClan = world.meta.clanAccruing?.id;
  if (prevClan !== clanEligible) {
    const notify = (clanId: string, gained: boolean) => {
      const c = world.clans[clanId];
      if (!c) return;
      for (const m of c.members) pushInbox(world, m, { type: "crownClock", scope: "clan", gained, who: c.name });
    };
    if (prevClan) notify(prevClan, false);
    if (clanEligible) notify(clanEligible, true);
  }
  world.meta.clanClocksMs ??= {};
  world.meta.clanAccruing = advanceAccrual(world.meta.clanClocksMs, world.meta.clanAccruing ?? null, clanEligible, nowMs);

  const ch = clanHold(world, nowMs);
  if (ch.holderId && ch.cumMs >= HOLD_CLOCKS.CUMULATIVE_HOURS * MS_PER_HOUR && ch.streakMs >= HOLD_CLOCKS.STREAK_HOURS * MS_PER_HOUR) {
    world.meta.winner = { kind: "clan", id: ch.holderId, name: world.clans[ch.holderId]?.name ?? "", atTick: world.meta.tickNumber };
    pushChronicle(
      world,
      "crown",
      `🏆 The clan ${world.clans[ch.holderId]?.name} seizes CLAN VICTORY — the age ends, and the next shall bear their name!`,
    );
  }
}

/** Bring a legacy world's meta into the §14.3 ms shape (tick-counted clocks →
 *  ms; streaks dropped — they re-open on the next `updateCrown`). Idempotent. */
export function normalizeMeta(meta: World["meta"]): void {
  const legacy = meta as unknown as Record<string, unknown>;
  if (!meta.overlordClocksMs) {
    meta.overlordClocksMs = {};
    const old = legacy.overlordClocks as Record<string, number> | undefined;
    if (old) for (const [id, t] of Object.entries(old)) meta.overlordClocksMs[id] = t * TICK_MS;
  }
  if (meta.overlordAccruing === undefined) meta.overlordAccruing = null;
  if (!meta.clanClocksMs) {
    meta.clanClocksMs = {};
    const old = legacy.clanClocks as Record<string, number> | undefined;
    if (old) for (const [id, t] of Object.entries(old)) meta.clanClocksMs[id] = t * TICK_MS;
  }
  if (meta.clanAccruing === undefined) meta.clanAccruing = null;
  delete legacy.overlordClocks;
  delete legacy.overlordStreak;
  delete legacy.clanClocks;
  delete legacy.clanStreak;
}

// ── Era transition (spec/overview.md) ────────────────────────────────────────

/** Close the era: fresh world named for the winner. DMs/accounts are the
 *  store's concern (Supabase keeps them; the dev file store starts clean). */
export function eraReset(world: World): World {
  const winner = world.meta.winner;
  const winnerName = winner?.name ?? "an Unnamed Victor";

  // Seal this age's annals for good — the history books of the realm.
  const finalLadder = Object.values(world.players)
    .map((p) => ({ name: p.name, score: rankingScore(p) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  const sealed: ArchivedAge = {
    eraNumber: world.meta.eraNumber,
    eraName: world.meta.eraName,
    winnerName: winner?.name,
    winnerKind: winner?.kind,
    sealedAt: new Date().toISOString(),
    entries: world.chronicle ?? [],
    finalLadder,
    records: world.eraRecords,
    // Freeze the full leaderboard set now — the ladders, Lords & Ladies and
    // civil feats read the live empires, which the reset below wipes away.
    // No clan links: the banners are gone once the age is sealed.
    sealedTables: buildEraTables(world, { link: false }),
  };

  const fresh = seedWorld();
  fresh.meta.eraNumber = world.meta.eraNumber + 1;
  fresh.meta.eraName = `The Era of ${winnerName}`;
  fresh.chronicleArchive = [...(world.chronicleArchive ?? []), sealed];
  pushChronicle(
    fresh,
    "crown",
    `📜 ${fresh.meta.eraName} begins, in the shadow of ${winnerName}'s triumph. The five days of peace hold.`,
  );
  return fresh;
}


// ── Clock health ────────────────────────────────────────────────────────────

export interface TickHealth {
  /** Ticks owed right now. Zero on a healthy clock; anything large means the
   *  heartbeat has been missing and the next player to act pays for all of it. */
  behind: number;
  minutesBehind: number;
  lastTickAt: string;
  tick: number;
  /** Did the most recent run throw? A failed run leaves the clock stalled, and
   *  nothing retries on its own — the next caller simply tries again, which is
   *  safe because the work is derived from timestamps rather than queued. */
  lastRunOk: boolean;
  lastRunError?: string;
  /** True once the backlog exceeds what one catch-up will replay: from here on
   *  every further minute of silence is time permanently lost. */
  losingTime: boolean;
  /** The age has been won and the world is deliberately stopped. Reported so a
   *  sealed era reads as healthy rather than as a heartbeat that has died —
   *  otherwise the dead-man switch pages someone every night until an admin
   *  gets round to closing the age. */
  eraOver: boolean;
}

export function tickHealth(world: World, now = new Date()): TickHealth {
  const last = new Date(world.meta.lastTickAt).getTime();
  const eraOver = !!world.meta.winner;
  // A stopped age owes nothing, so it is not "behind" — see ticksDue.
  const behind = eraOver ? 0 : Math.max(0, Math.floor((now.getTime() - last) / (TURN_MINUTES * 60 * 1000)));
  const runs = world.tickLog ?? [];
  const lastRun = runs[runs.length - 1];
  return {
    behind,
    eraOver,
    minutesBehind: eraOver ? 0 : Math.round(((now.getTime() - last) / 60000) * 10) / 10,
    lastTickAt: world.meta.lastTickAt,
    tick: world.meta.tickNumber,
    lastRunOk: lastRun ? lastRun.ok : true,
    lastRunError: lastRun && !lastRun.ok ? lastRun.error : undefined,
    losingTime: !eraOver && behind > 2016,
  };
}
