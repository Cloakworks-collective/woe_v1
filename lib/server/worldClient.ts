// §14.2 forwarding client. When WORLD_SERVICE_URL is set, the single-writer
// world service (worldService/main.ts) owns the authoritative world in memory
// and serializes every mutation. Next.js then becomes a thin forwarder:
// commands POST to the service, reads GET a fresh snapshot. When the env var is
// absent, none of this is used and the app keeps the in-process store (§14.1).

import type { World } from "./store";
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
const g = globalThis as unknown as { __woeSvcWorld?: World; __woeSvcAt?: number };
// Matches the store's CACHE_TTL_MS on purpose — the two layers used to hold
// different opinions (2s here, 10s there) about how stale a world may be,
// which made latency depend on which layer a request happened to hit. Safe at
// the store's window because every command now refreshes this cache with the
// post-command world, so staleness only accrues while nobody acts.
const READ_TTL_MS = 10_000;

export function invalidateServiceWorldCache(): void {
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
    headers: { "content-type": "application/json", ...secretHeader() },
    body: JSON.stringify({ playerId, name, args }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`world service command failed: HTTP ${res.status}`);
  const body = (await res.json()) as CommandResult | { result: CommandResult; world: World };
  // New services ship the post-command world with the result; it becomes the
  // read cache, so the page render that follows every command costs no second
  // fetch and no second whole-world serialization. An old service that sends
  // a bare result still works — the cache is dropped and the next read pays.
  if (body && typeof body === "object" && "result" in body && "world" in body) {
    g.__woeSvcWorld = body.world;
    g.__woeSvcAt = Date.now();
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
  const res = await fetch(`${worldServiceUrl()}/world`, { headers: secretHeader(), cache: "no-store" });
  if (!res.ok) throw new Error(`world service read failed: HTTP ${res.status}`);
  const world = (await res.json()) as World;
  g.__woeSvcWorld = world;
  g.__woeSvcAt = Date.now();
  return world;
}
