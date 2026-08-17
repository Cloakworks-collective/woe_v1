// §14.2 forwarding client. When WORLD_SERVICE_URL is set, the single-writer
// world service (worldService/main.ts) owns the authoritative world in memory
// and serializes every mutation. Next.js then becomes a thin forwarder:
// commands POST to the service, reads GET a fresh snapshot. When the env var is
// absent, none of this is used and the app keeps the in-process store (§14.1).

import type { World } from "./store";
import { applyDelta, type WorldDelta } from "./worldDelta";
import type { CommandResult } from "./pipeline";

/** The world service base URL (trailing slash trimmed), or undefined when the
 *  single-writer service is not configured. */
export function worldServiceUrl(): string | undefined {
  const u = process.env.WORLD_SERVICE_URL;
  return u && u.trim() ? u.trim().replace(/\/+$/, "") : undefined;
}

export function worldServiceEnabled(): boolean {
  return !!worldServiceUrl();
}

/** Shared secret so only the app (not the public internet) may drive the
 *  service. Sent on every request; enforced by the service when set. */
function secretHeader(): Record<string, string> {
  const s = process.env.WORLD_SERVICE_SECRET;
  return s ? { "x-woe-secret": s } : {};
}

// A tiny read cache so a single render's several getWorld() calls collapse to
// one fetch — mirrors the store's cache window. Invalidated after any command.
const g = globalThis as unknown as {
  __woeSvcWorld?: World;
  __woeSvcAt?: number;
  __woeSvcRev?: string;
  /** The numeric revision the cached world sits at — what ?since= sends. */
  __woeSvcRevN?: number;
};

const revNumber = (etag: string | null | undefined): number | undefined => {
  const m = /^"rev-(\d+)"$/.exec(etag ?? "");
  return m ? Number(m[1]) : undefined;
};

/** Graft a delta onto the cached world and make the result the new cache.
 *  applyDelta returns a NEW object (a page may hold the old one mid-render),
 *  which also means the normalize-once WeakSet treats it as fresh. */
function acceptDelta(delta: WorldDelta): World {
  const merged = applyDelta(g.__woeSvcWorld!, delta);
  g.__woeSvcWorld = merged;
  g.__woeSvcAt = Date.now();
  g.__woeSvcRev = `"rev-${delta.rev}"`;
  g.__woeSvcRevN = delta.rev;
  return merged;
}
// Matches the store's CACHE_TTL_MS on purpose — the two layers used to hold
// different opinions (2s here, 10s there) about how stale a world may be,
// which made latency depend on which layer a request happened to hit. Safe at
// the store's window because every command now refreshes this cache with the
// post-command world, so staleness only accrues while nobody acts.
const READ_TTL_MS = 10_000;

export function invalidateServiceWorldCache(): void {
  g.__woeSvcRev = undefined;
  g.__woeSvcRevN = undefined;
  g.__woeSvcWorld = undefined;
  g.__woeSvcAt = undefined;
}

/** Forward one command to the single writer; returns its CommandResult. The
 *  read cache is dropped so the next read reflects the mutation. */
export async function forwardCommand(
  playerId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<CommandResult> {
  const res = await fetch(`${worldServiceUrl()}/command`, {
    method: "POST",
    headers: { "content-type": "application/json", "accept-encoding": "gzip", ...secretHeader() },
    // Telling the service which rev we hold turns its reply from the whole
    // world into the post-command DELTA — a click's worth of bytes.
    body: JSON.stringify({ playerId, name, args, since: g.__woeSvcWorld ? g.__woeSvcRevN : undefined }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`world service command failed: HTTP ${res.status}`);
  const body = (await res.json()) as
    | CommandResult
    | { result: CommandResult; world: World; rev?: number }
    | { result: CommandResult; delta: WorldDelta };
  if (body && typeof body === "object" && "result" in body && "delta" in body && g.__woeSvcWorld) {
    acceptDelta(body.delta);
    return body.result;
  }
  // New services ship the post-command world with the result; it becomes the
  // read cache, so the page render that follows every command costs no second
  // fetch and no second whole-world serialization. An old service that sends
  // a bare result still works — the cache is dropped and the next read pays.
  if (body && typeof body === "object" && "result" in body && "world" in body) {
    g.__woeSvcWorld = body.world;
    g.__woeSvcAt = Date.now();
    if (typeof body.rev === "number") {
      g.__woeSvcRev = `"rev-${body.rev}"`;
      g.__woeSvcRevN = body.rev;
    }
    return body.result;
  }
  invalidateServiceWorldCache();
  return body as CommandResult;
}

/** Fetch the current authoritative world snapshot from the service (cached
 *  briefly). `forceReload` bypasses the cache. */
export async function fetchServiceWorld(opts: { forceReload?: boolean } = {}): Promise<World> {
  if (!opts.forceReload && g.__woeSvcWorld && Date.now() - (g.__woeSvcAt ?? 0) < READ_TTL_MS) {
    return g.__woeSvcWorld;
  }
  // Conditional fetch: the world moves only on a command or a tick, and the
  // service tags every snapshot with its revision. Holding rev N and asking
  // again returns an empty 304 instead of megabytes this process already has —
  // between changes, a read costs a round trip and nothing else. gzip covers
  // the transfers that DO carry the world (~10x on this JSON); Node's fetch
  // decompresses transparently.
  const headers: Record<string, string> = {
    ...secretHeader(),
    "accept-encoding": "gzip",
  };
  if (g.__woeSvcRev && g.__woeSvcWorld) headers["if-none-match"] = g.__woeSvcRev;
  const since = g.__woeSvcWorld && g.__woeSvcRevN !== undefined ? `?since=${g.__woeSvcRevN}` : "";
  const res = await fetch(`${worldServiceUrl()}/world${since}`, { headers, cache: "no-store" });
  if (res.status === 304 && g.__woeSvcWorld) {
    g.__woeSvcAt = Date.now();
    return g.__woeSvcWorld;
  }
  if (!res.ok) throw new Error(`world service read failed: HTTP ${res.status}`);
  // Three shapes come back: a DELTA (x-woe-delta, the usual case — only the
  // sections that moved since our rev), or the FULL world (first read, or so
  // stale that the delta would not be smaller). 304 was handled above.
  if (res.headers.get("x-woe-delta") === "1" && g.__woeSvcWorld) {
    return acceptDelta((await res.json()) as WorldDelta);
  }
  const world = (await res.json()) as World;
  g.__woeSvcWorld = world;
  g.__woeSvcAt = Date.now();
  g.__woeSvcRev = res.headers.get("etag") ?? undefined;
  g.__woeSvcRevN = revNumber(g.__woeSvcRev);
  return world;
}
