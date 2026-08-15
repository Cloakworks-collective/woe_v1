// GET /api/rankings — the public ladder (target discovery for CLI clients).
// Same information the Rankings page shows every player — and no more.
//
// `online` is CLAN BUSINESS and is null for everyone outside your own. It used
// to be returned for every empire on the ladder, which quietly made the roster's
// presence column pointless: an outsider could poll this endpoint and learn
// exactly which four hours a target sleeps in. The Rankings page has never
// displayed presence at all, so nothing in this app regresses; a CLI client
// reading the field now sees null for strangers, which is the intent.

import { NextResponse, type NextRequest } from "next/server";
import { rankingScore, settlementTitle, totalPopulation, troopStrengthLabel } from "@/lib/engine";
import { resolvePlayerId } from "@/lib/server/auth";
import { empireNumbers, getCurrentWorld, isOnline } from "@/lib/server/world";

export async function GET(req: NextRequest) {
  const world = await getCurrentWorld();
  const playerId = await resolvePlayerId(req, world);
  if (!playerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const viewer = world.players[playerId];
  const sameClan = (p: { id: string; clanId?: string | null }) =>
    p.id === playerId || (!!viewer?.clanId && p.clanId === viewer.clanId);

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
      online: sameClan(p) ? isOnline(p) : null,
      score: rankingScore(p),
      onVacation: p.onVacation,
      shielded: p.shieldUntilTick > tick,
      you: p.id === playerId,
    }))
    .sort((a, b) => b.score - a.score)
    .map((e, i) => ({ rank: i + 1, ...e }));

  return NextResponse.json({ tick, ladder });
}
