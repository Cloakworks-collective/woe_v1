// GET /api/state — the player's own empire as JSON (CLI / agent clients).
// Everything here is information the web UI already shows its owner.

import { NextResponse, type NextRequest } from "next/server";
import { eventLine } from "@/components/eventLine";
import {
  CIVILIAN_BUILDINGS,
  MILITARY_BUILDINGS,
  TURNS_PER_DAY,
  maxLevel,
} from "@/lib/constants";
import {
  advisorReport,
  buildingCost,
  civilians,
  foodUpkeepPerTurn,
  military,
  productionRates,
  rankingScore,
  researchRate,
  settlementTitle,
  taxIncomePerTurn,
  totalPopulation,
  wallName,
} from "@/lib/engine";
import { resolvePlayerId } from "@/lib/server/auth";
import { REVENGE_WINDOW_TICKS, getCurrentWorld } from "@/lib/server/world";

export async function GET(req: NextRequest) {
  // Advances the clock only when something is actually owed, and persists it
  // when it does (§14.1) — see getCurrentWorld.
  const world = await getCurrentWorld();

  const playerId = await resolvePlayerId(req, world);
  const p = playerId ? world.players[playerId] : undefined;
  if (!p) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ladder = Object.values(world.players)
    .map((q) => ({ id: q.id, score: rankingScore(q) }))
    .sort((a, b) => b.score - a.score);
  const rank = ladder.findIndex((e) => e.id === p.id) + 1;

  return NextResponse.json({
    meta: {
      era: world.meta.eraName,
      eraNumber: world.meta.eraNumber,
      tick: world.meta.tickNumber,
      turnsToDawn: TURNS_PER_DAY - (world.meta.tickNumber % TURNS_PER_DAY),
      winner: world.meta.winner ?? null,
    },
    empire: {
      id: p.id,
      name: p.name,
      race: p.race,
      title: settlementTitle(p),
      score: rankingScore(p),
      rank,
      clanId: p.clanId ?? null,
      premium: Boolean(p.premium),
      starving: p.starving,
      onVacation: p.onVacation,
      shieldedUntilTick: p.shieldUntilTick > world.meta.tickNumber ? p.shieldUntilTick : null,
      battlesWon: p.battlesWon,
      battlesLost: p.battlesLost,
    },
    population: {
      total: totalPopulation(p),
      civilians: civilians(p),
      military: military(p),
      idlePeasants: p.idlePeasants,
      workers: p.workers,
    },
    economy: {
      gold: Math.floor(p.gold),
      bankedGold: Math.floor(p.bankedGold),
      taxRate: p.taxRate,
      taxIncomePerTurn: taxIncomePerTurn(p), // whole numbers now — no display fudge needed
      foodUpkeepPerTurn: foodUpkeepPerTurn(p),
      resources: {
        food: Math.floor(p.resources.food),
        wood: Math.floor(p.resources.wood),
        stone: Math.floor(p.resources.stone),
        ore: Math.floor(p.resources.ore),
      },
      productionPerTurn: productionRates(p),
      actionTurns: p.turnsAvailable,
    },
    army: { ...p.army, stamina: p.army.stamina, experience: p.army.experience },
    buildings: [
      ...CIVILIAN_BUILDINGS,
      { id: "hearthstead", name: "Hearthstead" },
      ...MILITARY_BUILDINGS,
    ].map((b) => {
      const lvl = p.buildings[b.id as keyof typeof p.buildings] ?? 0;
      const capped = lvl >= maxLevel(b.id as never);
      return {
        id: b.id,
        name: b.name,
        level: lvl,
        integrity: p.buildingIntegrity?.[b.id as keyof typeof p.buildings] ?? 1,
        counted: b.id === "hearthstead" || b.id === "muster_hall",
        nextCost: capped ? null : buildingCost(b.id as never, lvl + 1),
      };
    }),
    walls: { name: wallName(p), integrity: p.wallIntegrity },
    research: {
      activeField: p.research.activeField ?? null,
      levels: p.research.levels,
      banked: p.research.banked,
      ratePerTurn: Math.round(researchRate(p)),
    },
    steward: p.premium
      ? {
          buildQueue: p.buildQueue ?? [],
          researchQueue: p.researchQueue ?? [],
          standingOrders: p.standingOrders ?? [],
        }
      : null,
    advisors: advisorReport(p),
    chronicle: (world.inbox[p.id] ?? [])
      .slice(0, 20)
      .map((i) => ({ tick: i.tick, line: eventLine(i.event), battleId: "battleId" in i.event ? i.event.battleId : undefined })),
    revengeOpenAgainst: p.recentAttackers
      .filter(
        (r) =>
          world.meta.tickNumber - r.tick <= REVENGE_WINDOW_TICKS &&
          !p.revengeUsed.includes(r.playerId),
      )
      .map((r) => ({ playerId: r.playerId, name: world.players[r.playerId]?.name ?? "?", sinceTick: r.tick })),
  });
}
