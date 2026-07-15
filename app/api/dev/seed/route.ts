// Dev-only: pour rich, self-consistent data into the current session empire
// plus the shared market, so every page renders "populated" for screenshots.
// Navigate to /api/dev/seed while logged in. Disabled once CRON_SECRET is set
// (i.e. in production, where the dev clock also disappears).

import { NextResponse } from "next/server";
import { currentPlayerId } from "@/lib/server/auth";
import { getWorld } from "@/lib/server/world";
import { saveWorld } from "@/lib/server/store";
import { TICKS_PER_HOUR } from "@/lib/constants";
import type { MarketOrder, Player, Resource } from "@/lib/engine";

export const dynamic = "force-dynamic";

// A gentle random walk with occasional spikes and supply gaps, ending "now".
function priceSeries(base: number, tick: number, n: number) {
  const out: { t: number; p: number | null }[] = [];
  let v = base;
  const start = Math.floor(tick / TICKS_PER_HOUR) - n;
  for (let i = 0; i <= n; i++) {
    const t = (start + i) * TICKS_PER_HOUR;
    // random walk ±8%
    v *= 1 + (Math.random() - 0.5) * 0.16;
    // rare war spike / peace crash
    if (Math.random() < 0.05) v *= 1.6 + Math.random();
    if (Math.random() < 0.05) v *= 0.55;
    v = Math.max(base * 0.35, Math.min(base * 4, v));
    // occasional "no supply" gaps
    const p = Math.random() < 0.06 ? null : Math.round(v * 1000) / 1000;
    out.push({ t, p });
  }
  return out;
}

export async function GET() {
  if (process.env.CRON_SECRET) {
    return NextResponse.json({ error: "disabled in production" }, { status: 403 });
  }
  const id = await currentPlayerId();
  if (!id) return NextResponse.json({ error: "not logged in" }, { status: 401 });

  const world = await getWorld();
  const p = world.players[id] as Player | undefined;
  if (!p) return NextResponse.json({ error: "player not found" }, { status: 404 });

  const tick = world.meta.tickNumber;

  // ── Buildings at a spread of stages (some maxed, some mid, some low) ──────
  p.buildings = {
    // Production
    grange: 8,
    sawyers_mill: 7,
    masons_quarry: 6,
    deepvein_mine: 5,
    // Storage
    granary: 6,
    counting_house: 5,
    timberyard: 5,
    masons_yard: 4,
    ironhold: 4,
    // Knowledge & trade
    collegium: 6,
    market_square: 4,
    shadow_guild: 3,
    rangers_lodge: 3,
    // Counted
    hearthstead: 78, // 780 housing
    muster_hall: 40, // 400 troop slots
    // Military tiers
    forge: 3,
    drill_yard: 3,
    fletchers_range: 2,
    knights_stables: 2,
    // Siege & defence
    war_foundry: 7,
    walls: 6,
  };

  // Some bombard scars so health bars + the Repairs panel have something to show.
  p.wallIntegrity = 0.72;
  p.buildingIntegrity = {
    granary: 0.58,
    deepvein_mine: 0.81,
    market_square: 0.66,
  };

  // ── Workers (all within slots) + a busy Collegium ────────────────────────
  p.idlePeasants = 28;
  p.workers = {
    farmers: 140,
    lumberjacks: 120,
    quarrymen: 100,
    miners: 90,
    researchers: 100,
    merchants: 60,
  };

  // ── Army: every corps across all three tiers, spies/scouts, siege ────────
  p.warriors = 34;
  p.army = {
    footmen: { light: 62, medium: 48, heavy: 21 },
    archers: { light: 40, medium: 26, heavy: 9 },
    cavalry: { light: 22, medium: 14, heavy: 7 },
    siegeEngineers: 25,
    // 25 engineers crew heaviest-first: 3 trebs (15) + 3 ballistae (9) = 24,
    // leaving rams/ladders/ropes partly un-crewed — the "short" meter state.
    siegeGear: { ropes: 8, ladders: 6, rams: 4, ballistae: 3, trebuchets: 3 },
    spies: 40,
    scouts: 40,
    mercenaries: 18,
    stamina: 78,
    experience: 46,
  };

  // ── Research: many fields at varied levels; one field actively studied ────
  p.research = {
    activeField: "art_of_war",
    levels: {
      crop_rotation: 3,
      forestry: 2,
      masonry: 2,
      deep_smelting: 1,
      statecraft: 2,
      art_of_war: 2,
      shieldcraft: 2,
      siegecraft: 1,
      tradecraft: 3,
      pathfinding: 1,
    },
    banked: {
      art_of_war: 6800, // partway to level 3 (needs 10,000)
      shieldcraft: 1400,
      siegecraft: 900,
    },
  };

  // ── Coffers & stores (and clear the starvation freeze) ───────────────────
  p.gold = 184_500;
  p.bankedGold = 96_000;
  p.resources = { food: 118_000, wood: 92_000, stone: 74_000, ore: 61_000 };
  p.starving = false;
  p.taxRate = 0.35;
  p.turnsAvailable = 240;

  // ── Premium so the Steward's queues + standing orders surface ────────────
  p.premium = true;
  p.buildQueue = ["ironhold", "knights_stables", "walls"];
  p.researchQueue = [
    { field: "art_of_war", toLevel: 3 },
    { field: "masonry", toLevel: 3 },
  ];
  p.standingOrders = [
    {
      id: "so-dev-1",
      when: { kind: "gold", amount: 250_000 },
      then: { kind: "build", building: "collegium" },
    },
  ];

  // ── Market: a lively order book from the bots + two of our own caravans ──
  const asks: MarketOrder[] = [
    { id: "dev-a1", sellerId: "bot-eldervale", resource: "wood", remaining: 6200, pricePerUnit: 0.05, createdTick: tick - 40 },
    { id: "dev-a2", sellerId: "bot-sylvangrove", resource: "wood", remaining: 3100, pricePerUnit: 0.062, createdTick: tick - 30 },
    { id: "dev-a3", sellerId: "bot-stonewatch", resource: "stone", remaining: 5400, pricePerUnit: 0.058, createdTick: tick - 52 },
    { id: "dev-a4", sellerId: "bot-grimhold", resource: "stone", remaining: 2600, pricePerUnit: 0.071, createdTick: tick - 22 },
    { id: "dev-a5", sellerId: "bot-karakdun", resource: "ore", remaining: 4300, pricePerUnit: 0.083, createdTick: tick - 61 },
    { id: "dev-a6", sellerId: "bot-bloodfang", resource: "ore", remaining: 1900, pricePerUnit: 0.095, createdTick: tick - 12 },
    { id: "dev-a7", sellerId: "bot-nightpaw", resource: "food", remaining: 8800, pricePerUnit: 0.031, createdTick: tick - 70 },
    { id: "dev-a8", sellerId: "bot-freeholt", resource: "food", remaining: 4200, pricePerUnit: 0.037, createdTick: tick - 18 },
    // Our own live caravans (populate "Your Caravans")
    { id: "dev-mine-1", sellerId: p.id, resource: "stone", remaining: 3000, pricePerUnit: 0.07, createdTick: tick - 8 },
    { id: "dev-mine-2", sellerId: p.id, resource: "ore", remaining: 1500, pricePerUnit: 0.1, createdTick: tick - 3 },
  ];
  // Drop any previous dev orders / our stale ones, then add the fresh book.
  world.orders = world.orders.filter(
    (o) => !o.id.startsWith("dev-") && o.sellerId !== p.id,
  );
  world.orders.push(...asks);

  // ── Two weeks of hourly price history for the charts ─────────────────────
  const N = 150;
  const bases: Record<Resource, number> = { food: 0.033, wood: 0.05, stone: 0.06, ore: 0.084 };
  world.priceHistory = {
    food: priceSeries(bases.food, tick, N),
    wood: priceSeries(bases.wood, tick, N),
    stone: priceSeries(bases.stone, tick, N),
    ore: priceSeries(bases.ore, tick, N),
  };

  await saveWorld(world);

  return NextResponse.json({
    ok: true,
    seeded: {
      player: p.name,
      buildings: Object.keys(p.buildings).length,
      orders: world.orders.length,
      priceHistoryPoints: N + 1,
    },
    next: "Visit /buildings, /train, /troops, /research, /siege, /market",
  });
}
