import Link from "next/link";
import { FORUM_LIMITS } from "@/lib/constants/forum";
import { claimForumName } from "./actions";

/**
 * The one thing the boards ask of you, asked where you would actually notice —
 * in place of the reply box, at the moment you want to say something.
 *
 * Three states, and they are genuinely different asks:
 *   • guest        → sign in (the game's gate; there is no second account)
 *   • no handle    → name yourself, once, forever
 *   • silenced     → nothing to do; the ban notice says why elsewhere
 *
 * `to` is where the action returns, so claiming a name from a thread lands back
 * in that thread rather than at the top of the forum.
 */
export function NamePrompt({ needsHandle, to }: { needsHandle: boolean; to: string }) {
  if (!needsHandle) {
    return (
      <p className="flat-notice is-warn">
        <Link href={`/login?next=${encodeURIComponent(to)}`}>Sign in</Link> to reply — your game
        account is your forum account, and reading needs no account at all.
      </p>
    );
  }
  return (
    <div className="flat-card">
      <h3>Name yourself</h3>
      <p className="flat-sub">
        Your empire is called something different every age. This is the name you keep — it is what
        your posts will carry from now on, and it cannot be changed later.
      </p>
      <form action={claimForumName} className="flat-row" style={{ gap: 8, alignItems: "flex-end" }}>
        <input type="hidden" name="to" value={to} />
        <label className="flat-field" style={{ flex: 1, marginBottom: 0 }}>
          <span>Forum name</span>
          <input
            name="handle"
            type="text"
            autoComplete="off"
            minLength={FORUM_LIMITS.HANDLE_MIN}
            maxLength={FORUM_LIMITS.HANDLE_MAX}
            required
          />
        </label>
        <button className="flat-btn" type="submit">
          Claim it
        </button>
      </form>
    </div>
  );
}
