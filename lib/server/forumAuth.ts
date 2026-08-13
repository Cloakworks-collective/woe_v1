// Who is reading the boards, and what they may do there.
//
// Identity itself lives in lib/server/auth.ts — one account, one magic link, for
// the game and the forum alike. All that is left here is the forum's own view of
// that account: is there a handle yet, is there a live ban, may they post.

import { FORUM_LIMITS } from "../constants/forum";
import { activeBan, isSchemaMissing, touchAccount, type Account, type ForumBan } from "./accounts";
import { currentAccount } from "./auth";

export interface ForumViewer {
  account: Account | null;
  /** The live ban, if any. A banned viewer can still READ — see 0004_accounts.sql. */
  ban: ForumBan | null;
  /**
   * Signed in, unbanned, AND holding a handle.
   *
   * The handle is the last of the three and is claimed at the moment of the
   * first post rather than at the door: reading is what a stranger does first,
   * and asking them to name themselves before they have read a word is a form
   * to fill in for nothing.
   */
  canPost: boolean;
  /** Signed in and unbanned, but has never named themselves. */
  needsHandle: boolean;
  isAdmin: boolean;
}

const ANON: ForumViewer = {
  account: null,
  ban: null,
  canPost: false,
  needsHandle: false,
  isAdmin: false,
};

/**
 * Who is reading. Never redirects: the forum is public, so an anonymous viewer
 * is a normal state, not an error.
 */
export async function getForumViewer(): Promise<ForumViewer> {
  try {
    const account = await currentAccount();
    if (!account) return ANON;
    const ban = await activeBan(account.id);
    return {
      account,
      ban,
      canPost: !ban && Boolean(account.handle),
      needsHandle: !ban && !account.handle,
      isAdmin: account.isAdmin,
    };
  } catch (e) {
    // Before the migration is run there is no account to resolve. The page
    // itself explains the setup step; the shell just renders as a guest.
    if (isSchemaMissing(e)) return ANON;
    throw e;
  }
}

/** Presence, best-effort — never let a stamp failure break a page render. */
export async function markSeen(accountId: string): Promise<void> {
  try {
    await touchAccount(accountId);
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
