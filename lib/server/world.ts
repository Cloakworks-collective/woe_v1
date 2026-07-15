// World lifecycle: seeding, the 10-minute tick (with catch-up), the daily
// reset, tribute siphons, and the era victory clocks (spec/victory.md).

import {
  CLAN_BUILDING_POINTS,
  ERA_PEACE_DAYS,
  HOLD_CLOCKS,
  POPULATION_FLOORS,
  TICKS_PER_HOUR,
  TURNS_PER_DAY,
  TURN_MINUTES,
  WAR,
} from "../constants";
import type { Race } from "../constants/races";
import {
  civilians,
  hallPenaltyFactor,
  marketPrice,
  military,
  newClan,
  newEmpire,
  processDailyReset,
  processSteward,
  processTurnTick,
  rankingScore,
  totalPopulation,
  type Clan,
  type Player,
  type Resource,
} from "../engine";
import { loadWorld, pushChronicle, pushInbox, saveWorld, type ArchivedAge, type World } from "./store";

export const ERA_PEACE_TICKS = ERA_PEACE_DAYS * TURNS_PER_DAY;
export const REVENGE_WINDOW_TICKS = 18 * TICKS_PER_HOUR;

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

  const foot = Math.round(mil * 0.55);
  const arch = Math.round(mil * 0.2);
  const cav = Math.round(mil * 0.12);
  const eng = Math.round(mil * 0.05);
  p.warriors = Math.max(0, mil - foot - arch - cav - eng);
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
    ropes: L >= 1 ? 4 : 0,
    ladders: L >= 3 ? 3 : 0,
    rams: L >= 5 ? 2 : 0,
    ballistae: L >= 7 ? 2 : 0,
    trebuchets: L >= 9 ? 2 : 0,
  };
  p.army.experience = Math.min(60, L * 5);

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
  players["bot-grimhold"].clanId = ironPact.id;
  players["bot-karakdun"].clanId = ironPact.id;
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
      overlordClocks: {},
      overlordStreak: null,
      clanClocks: {},
      clanStreak: null,
    },
    players,
    clans,
    orders: [
      // Opening asks so the Bazaar isn't a ghost town. Pricing anchor: a
      // producer makes 20 units/turn untaxed while a civilian pays ≤4 g —
      // so a resource is worth a fraction of a gold piece.
      { id: "seed-1", sellerId: "bot-eldervale", resource: "wood", remaining: 4000, pricePerUnit: 0.05, createdTick: 700 },
      { id: "seed-2", sellerId: "bot-stonewatch", resource: "stone", remaining: 3000, pricePerUnit: 0.06, createdTick: 705 },
      { id: "seed-3", sellerId: "bot-karakdun", resource: "ore", remaining: 2500, pricePerUnit: 0.08, createdTick: 710 },
      { id: "seed-4", sellerId: "bot-nightpaw", resource: "food", remaining: 5000, pricePerUnit: 0.03, createdTick: 715 },
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

export async function getWorld(): Promise<World> {
  let world = await loadWorld();
  if (!world) {
    world = seedWorld();
    await saveWorld(world);
  }
  return world;
}

// ── The tick ────────────────────────────────────────────────────────────────

export function runOneTick(world: World): void {
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

  // Market price history — one sample per hour, ~2 weeks kept.
  if (tick % TICKS_PER_HOUR === 0) {
    world.priceHistory ??= { food: [], wood: [], stone: [], ore: [] };
    for (const r of ["food", "wood", "stone", "ore"] as const) {
      const series = world.priceHistory[r];
      series.push({ t: tick, p: marketPrice(world.orders, r) });
      if (series.length > 336) series.splice(0, series.length - 336);
    }
  }

  // Daily reset — recruitment then scattering.
  if (tick % TURNS_PER_DAY === 0) {
    for (const p of Object.values(world.players)) {
      const { player: next, events } = processDailyReset(p, tick);
      world.players[p.id] = next;
      for (const e of events) pushInbox(world, p.id, e);
    }
  }

  updateVictoryClocks(world);
}

/** Process all wall-clock-due ticks (10 minutes each). Idempotent catch-up. */
export function runDueTicks(world: World, now = new Date()): number {
  const last = new Date(world.meta.lastTickAt).getTime();
  const due = Math.floor((now.getTime() - last) / (TURN_MINUTES * 60 * 1000));
  const capped = Math.min(due, 2016); // two weeks of downtime, max, per request
  for (let i = 0; i < capped; i++) runOneTick(world);
  if (capped > 0) {
    world.meta.lastTickAt = new Date(last + capped * TURN_MINUTES * 60 * 1000).toISOString();
  }
  return capped;
}

// ── Victory clocks (spec/victory.md) ────────────────────────────────────────

export function clanScore(world: World, clan: Clan): number {
  let s = clan.members.reduce(
    (sum, id) => sum + (world.players[id] ? rankingScore(world.players[id]) : 0),
    0,
  );
  const b = clan.buildings;
  s += CLAN_BUILDING_POINTS.storage * b.storageLevel * b.integrity.storage;
  s += CLAN_BUILDING_POINTS.hall * b.hallLevel * b.integrity.hall;
  s += CLAN_BUILDING_POINTS.wonder * b.wonderLevel * b.integrity.wonder;
  return Math.round(s);
}

function updateVictoryClocks(world: World): void {
  if (world.meta.winner) return;
  const tick = world.meta.tickNumber;
  const players = Object.values(world.players);
  if (players.length === 0) return;

  // Grand Overlord.
  const top = players.reduce((a, b) => (rankingScore(b) > rankingScore(a) ? b : a));

  // The crown is public — note it in the Annals whenever it changes hands.
  if (world.meta.crownHolderId !== top.id) {
    const hadPrev = world.meta.crownHolderId !== undefined;
    const prevName = world.meta.crownHolderId
      ? world.players[world.meta.crownHolderId]?.name
      : undefined;
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

  const meetsFloor = totalPopulation(top) >= POPULATION_FLOORS.GRAND_OVERLORD;
  if (meetsFloor) {
    world.meta.overlordClocks[top.id] = (world.meta.overlordClocks[top.id] ?? 0) + 1;
    world.meta.overlordStreak =
      world.meta.overlordStreak?.playerId === top.id
        ? { playerId: top.id, ticks: world.meta.overlordStreak.ticks + 1 }
        : { playerId: top.id, ticks: 1 };
  } else {
    if (world.meta.overlordStreak?.playerId === top.id) world.meta.overlordStreak = null;
  }
  const cum = world.meta.overlordClocks[top.id] ?? 0;
  const streak = world.meta.overlordStreak?.playerId === top.id ? world.meta.overlordStreak.ticks : 0;
  if (
    cum >= HOLD_CLOCKS.CUMULATIVE_HOURS * TICKS_PER_HOUR &&
    streak >= HOLD_CLOCKS.STREAK_HOURS * TICKS_PER_HOUR
  ) {
    world.meta.winner = { kind: "overlord", id: top.id, name: top.name, atTick: tick };
    pushChronicle(
      world,
      "crown",
      `🏆 ${top.name} is proclaimed GRAND OVERLORD — the age ends, and the next shall bear this name!`,
    );
    return;
  }

  // Clan victory.
  const clans = Object.values(world.clans);
  if (clans.length === 0) return;
  const topClan = clans.reduce((a, b) => (clanScore(world, b) > clanScore(world, a) ? b : a));
  const clanPop = topClan.members.reduce(
    (sum, id) => sum + (world.players[id] ? totalPopulation(world.players[id]) : 0),
    0,
  );
  const frozen = (topClan.clockFrozenUntilTick ?? 0) > tick;
  if (clanPop >= POPULATION_FLOORS.CLAN && !frozen) {
    world.meta.clanClocks[topClan.id] = (world.meta.clanClocks[topClan.id] ?? 0) + 1;
    world.meta.clanStreak =
      world.meta.clanStreak?.clanId === topClan.id
        ? { clanId: topClan.id, ticks: world.meta.clanStreak.ticks + 1 }
        : { clanId: topClan.id, ticks: 1 };
    const cCum = world.meta.clanClocks[topClan.id] ?? 0;
    const cStreak = world.meta.clanStreak.ticks;
    if (
      cCum >= HOLD_CLOCKS.CUMULATIVE_HOURS * TICKS_PER_HOUR &&
      cStreak >= HOLD_CLOCKS.STREAK_HOURS * TICKS_PER_HOUR
    ) {
      world.meta.winner = { kind: "clan", id: topClan.id, name: topClan.name, atTick: tick };
      pushChronicle(
        world,
        "crown",
        `🏆 The clan ${topClan.name} seizes CLAN VICTORY — the age ends, and the next shall bear their name!`,
      );
    }
  } else if (world.meta.clanStreak?.clanId === topClan.id) {
    world.meta.clanStreak = null;
  }
}

// ── Era transition (spec/victory.md) ────────────────────────────────────────

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
