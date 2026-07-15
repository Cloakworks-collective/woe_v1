// Vercel Cron target (*/10): processes every due tick since the last run.
// Idempotent — ticks are numbered and derived from wall-clock time.

import { NextResponse, type NextRequest } from "next/server";
import { saveWorld } from "@/lib/server/store";
import { getWorld, runDueTicks } from "@/lib/server/world";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  const world = await getWorld();
  const processed = runDueTicks(world);
  await saveWorld(world);
  return NextResponse.json({ ok: true, processed, tick: world.meta.tickNumber });
}
