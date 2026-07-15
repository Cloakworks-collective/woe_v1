// GET /api/battles — the public War Ledger: the last 100 battles, redacted.
// Aggregate losses only; composition, loot, and the narrated log stay
// participant-only (see publicBattle).

import { NextResponse, type NextRequest } from "next/server";
import { publicBattle } from "@/lib/engine";
import { resolvePlayerId } from "@/lib/server/auth";
import { getWorld, runDueTicks } from "@/lib/server/world";

export async function GET(req: NextRequest) {
  const world = await getWorld();
  runDueTicks(world);
  const playerId = await resolvePlayerId(req, world);
  if (!playerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  return NextResponse.json({
    tick: world.meta.tickNumber,
    battles: world.battles.slice(0, 100).map(publicBattle), // newest first
  });
}
