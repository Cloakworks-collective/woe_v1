// GET /api/empire/[id] — a public profile: what the ladder and the War
// Ledger already reveal, gathered in one place. No composition, no economy.

import { NextResponse, type NextRequest } from "next/server";
import { publicBattle, rankingScore, settlementTitle } from "@/lib/engine";
import { resolvePlayerId } from "@/lib/server/auth";
import { getCurrentWorld } from "@/lib/server/world";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const world = await getCurrentWorld();
  const viewerId = await resolvePlayerId(req, world);
  if (!viewerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const p = world.players[id];
  if (!p) return NextResponse.json({ error: "no such empire" }, { status: 404 });

  const tick = world.meta.tickNumber;
  const rank =
    Object.values(world.players)
      .map((q) => rankingScore(q))
      .filter((s) => s > rankingScore(p)).length + 1;

  const mine = world.battles.filter((b) => b.attackerId === id || b.defenderId === id);
  const recent = mine.slice(0, 25).map(publicBattle);

  // Aggregates over the ledger window (the world keeps ~300 battles).
  const totals = { troopsLost: 0, troopsKilled: 0, gearLost: 0, wallDamageTaken: 0, wallDamageDealt: 0 };
  for (const b of mine.map(publicBattle)) {
    const asAttacker = b.attackerId === id;
    totals.troopsLost += asAttacker ? b.attackerTroopsLost : b.defenderTroopsLost;
    totals.troopsKilled += asAttacker ? b.defenderTroopsLost : b.attackerTroopsLost;
    totals.gearLost += asAttacker ? b.attackerGearLost : 0;
    totals.wallDamageTaken += asAttacker ? 0 : b.wallDamage;
    totals.wallDamageDealt += asAttacker ? b.wallDamage : 0;
  }

  return NextResponse.json({
    tick,
    empire: {
      id: p.id,
      name: p.name,
      race: p.race,
      title: settlementTitle(p),
      clan: p.clanId ? (world.clans[p.clanId]?.name ?? null) : null,
      score: rankingScore(p),
      rank,
      battlesWon: p.battlesWon,
      battlesLost: p.battlesLost,
      onVacation: p.onVacation,
      shielded: p.shieldUntilTick > tick,
    },
    totals: { ...totals, battles: mine.length },
    recentBattles: recent,
  });
}
