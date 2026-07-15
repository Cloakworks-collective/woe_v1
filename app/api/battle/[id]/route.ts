// GET /api/battle/[id] — a full battle report, participants only.

import { NextResponse, type NextRequest } from "next/server";
import { resolvePlayerId } from "@/lib/server/auth";
import { getWorld, runDueTicks } from "@/lib/server/world";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const world = await getWorld();
  runDueTicks(world);
  const playerId = await resolvePlayerId(req, world);
  if (!playerId) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const report = world.battles.find((b) => b.id === id);
  if (!report || (report.attackerId !== playerId && report.defenderId !== playerId)) {
    return NextResponse.json({ error: "no such battle" }, { status: 404 });
  }
  return NextResponse.json(report);
}
