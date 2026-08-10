// The heartbeat.
//
// IDEMPOTENT BY CONSTRUCTION, not by bookkeeping. The tick number is *derived*
// from wall-clock time — `due = floor((now − lastTickAt) / 10min)` — so this
// endpoint never asks "have I already run?" It asks "what is owed?" and pays
// exactly that. Call it twice in the same second and the second call finds
// nothing due and does nothing. Call it an hour late and it pays all six at
// once, each credited at its own scheduled time. There is no queue to
// double-drain and no cursor to corrupt.
//
// WHY A CRON AT ALL, when ticks also run lazily on read (`applyOneCommand`
// calls runDueTicks before EVERY command, and it ticks every player — so an
// offline defender is never stale at the moment someone attacks them):
//
//   1. TIME IS LOST past the catch-up cap. runDueTicks replays at most 2,016
//      ticks (two weeks). A world quieter than that loses the excess for good.
//   2. THE BACKLOG LANDS ON A PLAYER. After three silent days the next person
//      to act replays 432 ticks inside their own request. If it times out,
//      their command fails — and it is never the person responsible for the
//      silence who pays.
//   3. THE SPECTATOR LADDER FREEZES. /spectate reads a snapshot written only
//      when a tick processes, so a world with nobody logged in shows stale
//      standings to the public.
//
// None of those are correctness bugs. The heartbeat is a backstop that keeps
// the backlog near zero so none of them can start.

import { NextResponse, type NextRequest } from "next/server";
import { writeSpectatorSnapshot } from "@/lib/server/analytics";
import { commitWithRetry, getWorld, runDueTicks, tickHealth } from "@/lib/server/world";
import { worldServiceEnabled } from "@/lib/server/worldClient";

/**
 * Tell an external dead-man switch this beat happened (healthchecks.io and
 * friends: GET the URL to check in, GET `<url>/fail` to raise).
 *
 * This exists because the failure we cannot see from in here is the endpoint
 * NOT RUNNING. Vercel Cron gives you logs and no alerting, so a heartbeat that
 * dies at 3am dies quietly — and on Hobby a ten-minute schedule is silently
 * coerced to daily, which looks healthy in every log line we emit. Only a
 * watcher that alerts on *silence* catches either. Best-effort by design: a
 * monitoring outage must never fail the tick that was otherwise fine.
 */
async function pingDeadMan(ok: boolean, detail = ""): Promise<void> {
  const base = process.env.HEARTBEAT_PING_URL;
  if (!base) return;
  try {
    await fetch(ok ? base : `${base.replace(/\/$/, "")}/fail`, {
      method: "POST",
      body: detail,
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // Deliberately swallowed — see above.
  }
}

/**
 * Is this a healthy beat? Not `losingTime` — that only trips after two weeks of
 * silence, by which point the alert is an obituary. A beat is good when the last
 * run did not throw and the clock is now current: a successful catch-up leaves
 * nothing owed, so anything still behind means the run did not achieve what it
 * was for. One tick of slack absorbs a beat landing a moment early.
 */
function beatOk(h: { behind: number; lastRunOk: boolean }): boolean {
  return h.lastRunOk && h.behind <= 1;
}

export async function GET(req: NextRequest) {
  // Vercel Cron sends its own header; a shared secret covers manual/external
  // callers. Either is fine — replaying this endpoint is harmless by design.
  const secret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("user-agent")?.includes("vercel-cron") ?? false;
  if (secret && !isVercelCron) {
    if (req.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // §14.2: the world service runs its own timer, so here we only report. Still
  // worth hitting — a stalled service shows up as a growing `behind`.
  if (worldServiceEnabled()) {
    const world = await getWorld({ forceReload: true });
    const health = tickHealth(world);
    // A stalled service is a dead heartbeat even though this request succeeded,
    // so the check-in reports the world's clock rather than our own liveness.
    await pingDeadMan(
      beatOk(health),
      health.lastRunError ?? `${health.behind} ticks (${health.minutesBehind}m) behind`,
    );
    return NextResponse.json({ ok: true, processed: 0, via: "world-service", health });
  }

  // §14.1: compare-and-swap + retry. An era-closing attack storm has many
  // writers, and the heartbeat must never clobber a concurrently-resolved
  // battle — on a lost CAS it reloads and recomputes what is owed.
  let processed = 0;
  let world;
  try {
    const r = await commitWithRetry((w) => {
      processed = runDueTicks(w);
      return { result: { world: w }, dirty: processed > 0 };
    });
    world = r.world;
  } catch (e) {
    // A thrown tick leaves the clock where it was, so the next beat retries the
    // same work. Report it loudly — a silently failing heartbeat looks exactly
    // like a healthy quiet one.
    const msg = e instanceof Error ? e.message : String(e);
    await pingDeadMan(false, msg);
    return NextResponse.json({ ok: false, processed: 0, error: msg }, { status: 500 });
  }

  // §14.4: awaited so serverless does not drop the background write.
  if (processed > 0) await writeSpectatorSnapshot(world);

  const health = tickHealth(world);
  await pingDeadMan(!health.losingTime, health.losingTime ? `${health.minutesBehind}m behind` : "");
  return NextResponse.json({ ok: true, processed, health });
}
