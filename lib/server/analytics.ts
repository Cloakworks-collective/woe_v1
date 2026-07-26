// §14.4 — durable read-heavy edges to Postgres. Today: spectator snapshots
// (the top-N ladder + crown state), written at the tick boundary and read by
// §14.5's public spectator view. The LIVE world stays in the writer's memory /
// the world blob — this is only the read-scaling projection, so many viewers
// read one indexed row instead of recomputing the ladder each.
//
// All writes are gated on Supabase being configured; without it, everything is
// a graceful no-op (local file-store dev and the standalone service keep
// working, the spectator page just shows "no snapshot yet").

import { rankingScore, totalPopulation } from "../engine";
import { getSupabaseClient, type World } from "./store";
import { clanHold, overlordHold } from "./world";

const TOP_N = 25;
/** Rows to keep per era (older ones are pruned as new snapshots land). */
const KEEP_ROWS = 500;

export interface LadderRow {
  id: string;
  name: string;
  race: string;
  score: number;
  pop: number;
  clanId?: string;
}

export interface CrownHold {
  holderId?: string;
  name?: string;
  cumMs: number;
  streakMs: number;
}

export interface SpectatorSnapshot {
  eraNumber: number;
  eraName: string;
  tick: number;
  capturedAt: string;
  ladder: LadderRow[];
  crown: {
    overlord: CrownHold;
    clan: CrownHold;
    winner?: World["meta"]["winner"];
  };
}

/** Pure — build the top-N ladder + crown view from the world (no I/O). Exported
 *  for the writer and for tests. */
export function buildSpectatorSnapshot(world: World, nowMs = Date.now()): SpectatorSnapshot {
  const ladder = Object.values(world.players)
    .map((p) => ({
      id: p.id,
      name: p.name,
      race: p.race,
      score: rankingScore(p),
      pop: totalPopulation(p),
      clanId: p.clanId,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);

  const oh = overlordHold(world, nowMs);
  const ch = clanHold(world, nowMs);
  const hold = (h: typeof oh, name?: string): CrownHold =>
    h.holderId ? { holderId: h.holderId, name, cumMs: h.cumMs, streakMs: h.streakMs } : { cumMs: 0, streakMs: 0 };

  return {
    eraNumber: world.meta.eraNumber,
    eraName: world.meta.eraName,
    tick: world.meta.tickNumber,
    capturedAt: new Date(nowMs).toISOString(),
    ladder,
    crown: {
      overlord: hold(oh, oh.holderId ? world.players[oh.holderId]?.name : undefined),
      clan: hold(ch, ch.holderId ? world.clans[ch.holderId]?.name : undefined),
      winner: world.meta.winner,
    },
  };
}

/** Persist a snapshot (no-op without Supabase). Off the request path — call at
 *  the tick boundary; safe to fire-and-forget. Prunes old rows to bound growth. */
export async function writeSpectatorSnapshot(world: World): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb) return;
  const snap = buildSpectatorSnapshot(world);
  const { error } = await sb.from("spectator_snapshots").insert({
    era_number: snap.eraNumber,
    era_name: snap.eraName,
    tick: snap.tick,
    ladder: snap.ladder,
    crown: snap.crown,
  });
  if (error) {
    console.error("[analytics] spectator snapshot write failed:", error.message);
    return;
  }
  // Bound growth: keep only the most recent KEEP_ROWS for this era.
  const { data: keep } = await sb
    .from("spectator_snapshots")
    .select("id")
    .eq("era_number", snap.eraNumber)
    .order("captured_at", { ascending: false })
    .range(KEEP_ROWS, KEEP_ROWS);
  const cutoffId = keep?.[0]?.id;
  if (cutoffId) {
    await sb.from("spectator_snapshots").delete().eq("era_number", snap.eraNumber).lt("id", cutoffId);
  }
}

/** The latest spectator snapshot (null without Supabase / no rows yet). */
export async function latestSpectatorSnapshot(): Promise<SpectatorSnapshot | null> {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("spectator_snapshots")
    .select("era_number, era_name, tick, captured_at, ladder, crown")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    eraNumber: data.era_number,
    eraName: data.era_name,
    tick: data.tick,
    capturedAt: data.captured_at,
    ladder: data.ladder as LadderRow[],
    crown: data.crown as SpectatorSnapshot["crown"],
  };
}
