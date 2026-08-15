// Admin auth for the hidden /admin console. Enabled only when
// ADMIN_PASSWORD is set; the session cookie is an HMAC keyed by the
// password, so it cannot be forged without knowing it.

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE = "woe_admin";

/** Build phase: with no ADMIN_PASSWORD set and not in production, the Crown
 *  Chamber is open to everyone (no login) so balance can be tuned freely.
 *  Set ADMIN_PASSWORD (prod) to seal it behind the login again. */
export function devOpenAdmin(): boolean {
  return !process.env.ADMIN_PASSWORD && process.env.NODE_ENV !== "production";
}

export function adminEnabled(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD) || devOpenAdmin();
}

function sessionValue(): string {
  return createHmac("sha256", process.env.ADMIN_PASSWORD ?? "")
    .update("woe-admin-session")
    .digest("hex");
}

export function checkPassword(attempt: string): boolean {
  const secret = process.env.ADMIN_PASSWORD ?? "";
  if (!secret) return false;
  const a = Buffer.from(attempt);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function isAdmin(): Promise<boolean> {
  if (devOpenAdmin()) return true; // build phase — open to all
  if (!process.env.ADMIN_PASSWORD) return false;
  const jar = await cookies();
  return jar.get(COOKIE)?.value === sessionValue();
}

export async function setAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, sessionValue(), { httpOnly: true, sameSite: "lax", path: "/admin" });
}

export async function clearAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

// ── Sitting on another throne ───────────────────────────────────────────────
//
// The console can enter ANY empire, bots included, to see the game exactly as
// that ruler sees it. This used to work by overwriting the admin's own account
// cookie, which had two problems: it could only reach empires that HAD an
// account behind them (so never a bot), and it destroyed your own session on
// the way in — there was no way back except signing in again.
//
// So impersonation is its own layer instead: a separate cookie holding a player
// id, laid over whatever session you already have and removed to return. It is
// SIGNED, because unlike the admin cookie it has to be readable outside /admin
// (the whole point is to browse the game), and an unsigned "I am this player"
// cookie would be an open door for anyone who guessed the name.
//
// In the build-phase mode where no ADMIN_PASSWORD is set the key is empty and
// the signature proves nothing — but that mode already hands the console to
// everyone (see devOpenAdmin), so it changes no guarantee. Set ADMIN_PASSWORD
// and both become real.

const AS_COOKIE = "woe_admin_as";

function signAs(playerId: string): string {
  return createHmac("sha256", process.env.ADMIN_PASSWORD ?? "")
    .update(`woe-admin-as:${playerId}`)
    .digest("hex");
}

export async function setImpersonation(playerId: string): Promise<void> {
  const jar = await cookies();
  // Path "/" on purpose: this has to be visible to the game's own pages, which
  // is exactly what the /admin-scoped session cookie cannot do.
  jar.set(AS_COOKIE, `${playerId}.${signAs(playerId)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function clearImpersonation(): Promise<void> {
  const jar = await cookies();
  jar.delete(AS_COOKIE);
}

/** The empire being worn, or null. Verifies the signature — a tampered or
 *  stale cookie resolves to nobody rather than to somebody else. */
export async function impersonatedPlayerId(): Promise<string | null> {
  if (!adminEnabled()) return null;
  const raw = (await cookies()).get(AS_COOKIE)?.value;
  if (!raw) return null;
  const cut = raw.lastIndexOf(".");
  if (cut <= 0) return null;
  const id = raw.slice(0, cut);
  const sig = raw.slice(cut + 1);
  const want = signAs(id);
  if (sig.length !== want.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(want)) ? id : null;
}
