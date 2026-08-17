import Link from "next/link";
import { forumLogout } from "./actions";
import { getForumViewer, markSeen } from "@/lib/server/forumAuth";
import { getThread, postsByAuthor } from "@/lib/server/accounts";
import { getReadMap } from "@/lib/server/forumExtra";

/**
 * The bell — forum-side and participation-driven, which is the LEAN version of
 * notifications: threads YOU have posted in that carry replies you have not
 * read. No emails, no push, no settings page; the moment you read the thread,
 * the bell forgets it. Capped and best-effort, because a header must never be
 * the slow part of a page.
 */
async function unreadReplies(accountId: string): Promise<{ id: string; title: string }[]> {
  try {
    const [mine, readMap] = await Promise.all([postsByAuthor(accountId, 50), getReadMap(accountId)]);
    const threadIds = [...new Set(mine.map((p) => p.threadId))].slice(0, 20);
    const out: { id: string; title: string }[] = [];
    for (const tid of threadIds) {
      const t = await getThread(tid);
      if (!t) continue;
      const readAt = readMap[tid];
      if (!readAt || readAt < t.lastPostAt) out.push({ id: t.id, title: t.title });
      if (out.length >= 8) break;
    }
    return out;
  } catch {
    return [];
  }
}

export const dynamic = "force-dynamic";

// The forum lives OUTSIDE the game shell on purpose: no resource bar, no turn
// clock, no empire. It has to work for someone who has never played, and it has
// to still be here when the age they played in is sealed.
export default async function ForumLayout({ children }: { children: React.ReactNode }) {
  const { account, ban, isAdmin, needsHandle } = await getForumViewer();
  if (account) await markSeen(account.id);
  const unread = account ? await unreadReplies(account.id) : [];

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
              {/* <details>, not a component: the bell must work with no JS,
                  like the rest of the boards. */}
              <details className="fbell">
                <summary title={unread.length ? `${unread.length} discussions with new replies` : "Nothing new for you"}>
                  🔔{unread.length > 0 && <span className="fbell-n">{unread.length}</span>}
                </summary>
                <div className="fbell-pop">
                  <b>Replies since you last looked</b>
                  {unread.length === 0 ? (
                    <p className="flat-hint" style={{ margin: "6px 0 0" }}>
                      Nothing new in the discussions you have posted in.
                    </p>
                  ) : (
                    unread.map((t) => (
                      <Link key={t.id} href={`/forum/t/${t.id}`}>
                        {t.title}
                      </Link>
                    ))
                  )}
                </div>
              </details>
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
