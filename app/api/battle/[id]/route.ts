// GET /api/battle/[id] — a full battle report, participants only.

import { NextResponse, type NextRequest } from "next/server";
import { loadBattle } from "@/lib/server/store";
import { resolvePlayerId } from "@/lib/server/auth";
import { getCurrentWorld } from "@/lib/server/world";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const world = await getCurrentWorld();
  const playerId = await resolvePlayerId(req, world);
  if (!playerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const report = await loadBattle(world, id);
  if (!report || (report.attackerId !== playerId && report.defenderId !== playerId)) {
    return NextResponse.json({ error: "no such battle" }, { status: 404 });
  }
  return NextResponse.json(report);
}
