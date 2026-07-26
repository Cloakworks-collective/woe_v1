// Vercel Cron target (*/10): processes every due tick since the last run.
// Idempotent — ticks are numbered and derived from wall-clock time.

import { NextResponse, type NextRequest } from "next/server";
import { writeSpectatorSnapshot } from "@/lib/server/analytics";
import { commitWithRetry, getWorld, runDueTicks } from "@/lib/server/world";
import { worldServiceEnabled } from "@/lib/server/worldClient";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }
  // §14.2: the world service ticks itself, so the cron is a no-op that just
  // reports status. (The cron can be removed entirely once the service is live.)
  if (worldServiceEnabled()) {
    const world = await getWorld({ forceReload: true });
    return NextResponse.json({ ok: true, processed: 0, tick: world.meta.tickNumber, via: "world-service" });
  }
  // §14.1: compare-and-swap + retry — the end-of-era attack storm has many
  // writers; the cron tick must not clobber a concurrently-resolved battle.
  const { processed, tick, world } = await commitWithRetry((world) => {
    const processed = runDueTicks(world);
    return { result: { processed, tick: world.meta.tickNumber, world }, dirty: true };
  });
  // §14.4: write the durable spectator snapshot at the tick boundary (no-op
  // without Supabase). Awaited so serverless doesn't drop the background write.
  if (processed > 0) await writeSpectatorSnapshot(world);
  return NextResponse.json({ ok: true, processed, tick });
}
