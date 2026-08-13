import Link from "next/link";
import { forumLogout } from "./actions";
import { getForumViewer, markSeen } from "@/lib/server/forumAuth";

export const dynamic = "force-dynamic";

// The forum lives OUTSIDE the game shell on purpose: no resource bar, no turn
// clock, no empire. It has to work for someone who has never played, and it has
// to still be here when the age they played in is sealed.
export default async function ForumLayout({ children }: { children: React.ReactNode }) {
  const { account, ban, isAdmin, needsHandle } = await getForumViewer();
  if (account) await markSeen(account.id);

  return (
    <div className="flat">
      <header className="flat-top">
        <div className="flat-top-inner">
          <Link href="/forum" className="flat-brand">
            War of Empires — Forum
            <small>outlives every era · no empire required</small>
          </Link>
          <nav>
            <Link href="/forum">Channels</Link>
            <Link href="/">The Game →</Link>
          </nav>
          <div className="flat-spacer" />
          {account ? (
            <div className="flat-row flat-shrink" style={{ alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 14 }}>
                {/* An account with no handle is signed in but unnamed — the
                    normal state of someone who has only ever played the game.
                    They are told what is missing, not that they are a guest. */}
                {account.handle ? <b>{account.handle}</b> : <i>unnamed here</i>}
                {isAdmin && <span className="flat-pill is-admin" style={{ marginLeft: 6 }}>Admin</span>}
                {ban && <span className="flat-pill is-banned" style={{ marginLeft: 6 }}>Silenced</span>}
                {needsHandle && (
                  <span className="flat-pill" style={{ marginLeft: 6 }}>Name yourself to post</span>
                )}
              </span>
              <form action={forumLogout}>
                <button className="flat-btn is-ghost is-small" type="submit">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <div className="flat-row flat-shrink" style={{ gap: 8 }}>
              {/* No separate forum account to register any more — the gate is
                  the game's, and reading needs no gate at all. */}
              <Link href="/login" className="flat-btn is-ghost is-small">
                Sign in
              </Link>
            </div>
          )}
        </div>
      </header>
      <div className="flat-wrap">{children}</div>
    </div>
  );
}
