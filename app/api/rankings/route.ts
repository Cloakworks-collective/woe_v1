// GET /api/rankings — the public ladder (target discovery for CLI clients).
// Same information the Rankings page shows every player.

import { NextResponse, type NextRequest } from "next/server";
import { rankingScore, settlementTitle, totalPopulation, troopStrengthLabel } from "@/lib/engine";
import { resolvePlayerId } from "@/lib/server/auth";
import { empireNumbers, getCurrentWorld, isOnline } from "@/lib/server/world";

export async function GET(req: NextRequest) {
  const world = await getCurrentWorld();
  const playerId = await resolvePlayerId(req, world);
  if (!playerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const tick = world.meta.tickNumber;
  const numbers = empireNumbers(world);
  const ladder = Object.values(world.players)
    .map((p) => ({
      id: p.id,
      no: numbers.get(p.id),
      name: p.name,
      race: p.race,
      title: settlementTitle(p),
      clan: p.clanId ? (world.clans[p.clanId]?.name ?? null) : null,
      troops: troopStrengthLabel(p),
      population: totalPopulation(p),
      online: isOnline(p),
      score: rankingScore(p),
      onVacation: p.onVacation,
      shielded: p.shieldUntilTick > tick,
      you: p.id === playerId,
    }))
    .sort((a, b) => b.score - a.score)
    .map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({ tick, ladder });
}
