// Forum identity — its own accounts, its own cookie, its own lifetime.
//
// Nothing here touches the game session. A forum account outlives every era and
// needs no empire, so it cannot lean on `woe_session` (which holds a player id
// that stops existing when the age is sealed).
//
// Passwords are scrypt with a per-user salt, using only node:crypto — no new
// dependency for a hash we can get right in twenty lines. Verification is
// constant-time.

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { FORUM_LIMITS } from "../constants/forum";
import { activeBan, findUser, isSchemaMissing, touchUser, type ForumBan, type ForumUser } from "./forumStore";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const COOKIE = "woe_forum";
const KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(plain, salt, KEYLEN);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const derived = await scrypt(plain, Buffer.from(saltHex, "hex"), KEYLEN);
  const expected = Buffer.from(hashHex, "hex");
  // Lengths must match before timingSafeEqual, and it must not short-circuit
  // on content — that is the whole point of using it.
  if (expected.length !== derived.length) return false;
  return timingSafeEqual(expected, derived);
}

// ── Session ────────────────────────────────────────────────────────────────

export async function setForumSession(userId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // A forum you have to sign into weekly is a forum nobody posts in.
    maxAge: 60 * 60 * 24 * 90,
  });
}

export async function clearForumSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function currentForumUserId(): Promise<string | null> {
  return (await cookies()).get(COOKIE)?.value ?? null;
}

export interface ForumViewer {
  user: ForumUser | null;
  /** The live ban, if any. A banned viewer can still READ — see forum.sql. */
  ban: ForumBan | null;
  canPost: boolean;
  isAdmin: boolean;
}

/**
 * Who is reading. Never redirects: the forum is public, so an anonymous viewer
 * is a normal state, not an error.
 */
export async function getForumViewer(): Promise<ForumViewer> {
  const anon: ForumViewer = { user: null, ban: null, canPost: false, isAdmin: false };
  const id = await currentForumUserId();
  if (!id) return anon;
  try {
    const user = await findUser(id);
    if (!user) return anon;
    const ban = await activeBan(user.id);
    return { user, ban, canPost: !ban, isAdmin: user.isAdmin };
  } catch (e) {
    // Before the migration is run there is no account to resolve. The page
    // itself explains the setup step; the shell just renders as a guest.
    if (isSchemaMissing(e)) return anon;
    throw e;
  }
}

/** Presence, best-effort — never let a stamp failure break a page render. */
export async function markSeen(userId: string): Promise<void> {
  try {
    await touchUser(userId);
  } catch {
    /* ignore */
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

export function handleProblem(handle: string): string | null {
  const h = handle.trim();
  if (h.length < FORUM_LIMITS.HANDLE_MIN) return `Handles are at least ${FORUM_LIMITS.HANDLE_MIN} characters.`;
  if (h.length > FORUM_LIMITS.HANDLE_MAX) return `Handles are at most ${FORUM_LIMITS.HANDLE_MAX} characters.`;
  if (!/^[a-zA-Z0-9_\- ]+$/.test(h)) return "Letters, numbers, spaces, hyphens and underscores only.";
  return null;
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < FORUM_LIMITS.PASSWORD_MIN) {
    return `Passwords are at least ${FORUM_LIMITS.PASSWORD_MIN} characters.`;
  }
  return null;
}

/** "silenced until 3 March 2027" / "silenced indefinitely" — one phrasing, used
 *  everywhere a ban is explained so it always reads the same. */
export function banNotice(ban: ForumBan): string {
  if (!ban.untilAt) return "You are silenced indefinitely. You can read, but not post.";
  const when = new Date(ban.untilAt).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `You are silenced until ${when}. You can read, but not post.`;
}
