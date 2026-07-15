// GET /api/rankings — the public ladder (target discovery for CLI clients).
// Same information the Rankings page shows every player.

import { NextResponse, type NextRequest } from "next/server";
import { rankingScore, settlementTitle } from "@/lib/engine";
import { resolvePlayerId } from "@/lib/server/auth";
import { getWorld, runDueTicks } from "@/lib/server/world";

export async function GET(req: NextRequest) {
  const world = await getWorld();
  runDueTicks(world);
  const playerId = await resolvePlayerId(req, world);
  if (!playerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const tick = world.meta.tickNumber;
  const ladder = Object.values(world.players)
    .map((p) => ({
      id: p.id,
      name: p.name,
      race: p.race,
      title: settlementTitle(p),
      clan: p.clanId ? (world.clans[p.clanId]?.name ?? null) : null,
      score: rankingScore(p),
      surrendered: p.surrendered,
      shielded: p.shieldUntilTick > tick,
      you: p.id === playerId,
    }))
    .sort((a, b) => b.score - a.score)
    .map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({ tick, ladder });
}
