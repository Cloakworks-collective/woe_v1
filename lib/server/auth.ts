// ONE identity for the whole system.
//
// There used to be three credentials: a `woe_session` cookie holding a player
// id, a `woe_` realm token for the CLI, and — once the forum existed — a second
// account with its own handle, password and cookie. Nothing joined them, so
// "who are you" had three different answers depending on which page you were
// standing on.
//
// Now there is an ACCOUNT. It holds one secret, `woe_<40 hex>`, which is both
// the magic link and the API bearer token. What the account *has* is layered on
// top and is deliberately not identity:
//
//   • a forum handle — claimed once, kept forever (lib/server/accounts.ts)
//   • an empire      — one per AGE, named and raced afresh each time
//
// That split is the whole point. `eraReset` replaces the world, so an empire
// cannot be an identity; the account is the person who keeps founding them, and
// it is what makes "one empire per player per age" a rule that can exist at all.
//
// No email, no password, no reset flow. Whoever holds the link is the account —
// the bearer-token trade the game has always made, now made once instead of
// three times.

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { findAccount, findAccountByToken, type Account } from "./accounts";
import { impersonatedPlayerId } from "./admin";
import type { World } from "./store";

const COOKIE = "woe_account";

/** 160 bits. The prefix makes a stray one recognisable in a log or a paste. */
export function newAccountToken(): string {
  return `woe_${randomBytes(20).toString("hex")}`;
}

/** The one-click gate. Absolute, so it survives being pasted anywhere. */
export function magicLink(token: string, origin: string): string {
  return `${origin.replace(/\/$/, "")}/enter?t=${encodeURIComponent(token)}`;
}

// ── Session ────────────────────────────────────────────────────────────────

export async function setAccountSession(accountId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, accountId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // A forum you have to sign into weekly is a forum nobody posts in, and an
    // age lasts days. Long-lived on purpose; the magic link is the recovery.
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function currentAccountId(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

/** The signed-in account, or null. Never redirects — a guest is a normal state
 *  on the forum, and the game's own pages decide what to do about it. */
export async function currentAccount(): Promise<Account | null> {
  const id = await currentAccountId();
  if (!id) return null;
  return findAccount(id);
}

// ── Account → empire ───────────────────────────────────────────────────────

/**
 * The empire this account holds in THIS age, if any.
 *
 * Deliberately a scan rather than an index: the world is one JSON document that
 * is already fully in memory by the time anyone asks, and an index would be a
 * second copy of the same fact to keep honest across every founding, ban and
 * era reset. A few hundred empires is nothing to scan.
 */
export function playerIdForAccount(world: World, accountId: string): string | null {
  for (const p of Object.values(world.players)) {
    if (p.accountId === accountId) return p.id;
  }
  return null;
}

/**
 * Who is playing, resolved through the account.
 *
 * Returns null both for "not signed in" and for "signed in but has not founded
 * an empire this age" — two states that look the same to every caller, because
 * the answer to both is the same page.
 */
export async function currentPlayerId(world: World): Promise<string | null> {
  // Impersonation is checked HERE and not only in getGame, because commands
  // resolve the actor through this function. Split the two and the console
  // would render one empire's pages while its buttons spent another empire's
  // gold — the worst possible failure for a tool whose whole job is to look at
  // somebody else's game.
  const worn = await impersonatedPlayerId();
  if (worn && world.players[worn]) return worn;
  const accountId = await currentAccountId();
  if (!accountId) return null;
  return playerIdForAccount(world, accountId);
}

// ── API bearer auth ────────────────────────────────────────────────────────

export async function playerIdFromToken(world: World, token: string): Promise<string | null> {
  const account = await findAccountByToken(token);
  if (!account) return null;
  return playerIdForAccount(world, account.id);
}

/**
 * Bearer token if present (Authorization or X-Realm-Token), else the session
 * cookie. The one auth entrypoint for API routes. Banished empires resolve to
 * null everywhere.
 */
export async function resolvePlayerId(req: NextRequest, world: World): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : (req.headers.get("x-realm-token") ?? "");
  const id = token ? await playerIdFromToken(world, token) : await currentPlayerId(world);
  if (!id || world.players[id]?.banned) return null;
  return id;
}
