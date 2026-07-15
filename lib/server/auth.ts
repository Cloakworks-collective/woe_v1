// Dev session: a signed-enough cookie holding the player id, PLUS realm
// tokens — per-empire bearer credentials for the CLI / cmd:* API. Swapped
// for Supabase Auth when the cloud project takes over; the rest of the app
// only ever calls currentPlayerId() / resolvePlayerId().

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import type { World } from "./store";

const COOKIE = "woe_session";

export async function currentPlayerId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

export async function setSession(playerId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, playerId, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// ── Realm tokens (CLI / API bearer auth) ────────────────────────────────────

export function newRealmToken(): string {
  return `woe_${randomBytes(20).toString("hex")}`;
}

export function playerIdFromToken(world: World, token: string): string | null {
  if (!token.startsWith("woe_")) return null;
  for (const p of Object.values(world.players)) {
    if (p.apiToken === token) return p.id;
  }
  return null;
}

/** Bearer realm token if present (Authorization or X-Realm-Token), else the
 *  session cookie. The one auth entrypoint for API routes. Banished empires
 *  resolve to null everywhere. */
export async function resolvePlayerId(req: NextRequest, world: World): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : (req.headers.get("x-realm-token") ?? "");
  const id = token ? playerIdFromToken(world, token) : await currentPlayerId();
  if (!id || world.players[id]?.banned) return null;
  return id;
}
