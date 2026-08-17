import Link from "next/link";
import { notFound } from "next/navigation";
import { FORUM_LIMITS, FORUM_REACTIONS, forumChannel } from "@/lib/constants/forum";
import { RACE_NAMES, type Race } from "@/lib/constants/races";
import { banNotice, getForumViewer } from "@/lib/server/forumAuth";
import { findAccount, getThread, listPosts } from "@/lib/server/accounts";
import { getThreadExtra, markRead, getReadMap } from "@/lib/server/forumExtra";
import { playerIdForAccount } from "@/lib/server/auth";
import { getWorld } from "@/lib/server/world";
import { rankingScore } from "@/lib/engine";
import { forumDeleteOwn, forumEditPost, forumModerate, forumReact, forumReply } from "../../actions";
import { Editor } from "../../Editor";
import { PostBody } from "../../PostBody";
import { NamePrompt } from "../../NamePrompt";
import { Notice } from "../../Notice";

export const dynamic = "force-dynamic";

export const metadata = { title: "Forum" };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

/** What the boards know of a poster's life in the game — for the hover card.
 *  The forum outlives every era, so "no banner this age" is an ordinary state
 *  and not an error. Best-effort: a forum that cannot reach the world still
 *  reads fine, just without the cards. */
interface GameIdentity {
  empire: string;
  race: string;
  score: number;
  rank: number;
}

async function gameIdentities(accountIds: string[]): Promise<Map<string, GameIdentity>> {
  const out = new Map<string, GameIdentity>();
  try {
    const world = await getWorld();
    const ladder = Object.values(world.players)
      .map((p) => ({ id: p.id, score: rankingScore(p) }))
      .sort((a, b) => b.score - a.score);
    const rank = new Map(ladder.map((r, i) => [r.id, i + 1]));
    for (const accountId of accountIds) {
      const pid = playerIdForAccount(world, accountId);
      const p = pid ? world.players[pid] : undefined;
      if (!p) continue;
      out.set(accountId, {
        empire: p.name,
        race: RACE_NAMES[p.race as Race] ?? p.race,
        score: rankingScore(p),
        rank: rank.get(p.id) ?? 0,
      });
    }
  } catch {
    // The world store may be absent where the forum still runs — fine.
  }
  return out;
}

/** A one-line HTML quote of a post, safe by construction: the handle and the
 *  snippet are text, and the editor's sanitizer guards the gate regardless. */
function quoteSeed(handle: string, n: number, body: string): string {
  const text = body
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<blockquote><strong>${esc(handle)}</strong> wrote (#${n}): ${esc(text)}${text.length >= 200 ? "…" : ""}</blockquote><p></p>`;
}

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ thread: string }>;
  searchParams: Promise<{ err?: string; ok?: string; quote?: string; edit?: string; page?: string }>;
}) {
  const { thread: id } = await params;
  const { err, ok, quote, edit, page: pageParam } = await searchParams;
  const thread = await getThread(id);
  if (!thread) notFound();

  const channel = forumChannel(thread.channel);
  const viewer = await getForumViewer();
  const posts = await listPosts(id);
  const extra = await getThreadExtra(id);

  const authors = new Map<string, { handle: string; admin: boolean }>();
  for (const p of posts) {
    if (p.authorId && !authors.has(p.authorId)) {
      const a = await findAccount(p.authorId);
      authors.set(p.authorId, { handle: a?.handle ?? "—", admin: a?.isAdmin ?? false });
    }
  }
  const identities = await gameIdentities([...authors.keys()]);

  // ── Unread: where did this reader leave off? ──────────────────────────────
  // The marker is read BEFORE it moves, so this render still knows where the
  // old line was; then it advances to the newest post. Idempotent and
  // forward-only, so a double render cannot un-read anything.
  let firstUnreadId: string | undefined;
  if (viewer.account) {
    const readAt = (await getReadMap(viewer.account.id))[id];
    firstUnreadId = posts.find((p) => !readAt || p.createdAt > readAt)?.id;
    const newest = posts[posts.length - 1]?.createdAt;
    if (newest) await markRead(viewer.account.id, id, newest);
  }

  const canReply = viewer.canPost && (!thread.locked || viewer.isAdmin);

  // ── Pages of PAGE_SIZE, numbered against the WHOLE thread ────────────────
  // #17 is #17 on every page — the numbers are the permalinks, so they cannot
  // restart at 1 each page.
  const pageCount = Math.max(1, Math.ceil(posts.length / FORUM_LIMITS.PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(Number(pageParam)) || 1));
  const pagePosts = posts.slice((page - 1) * FORUM_LIMITS.PAGE_SIZE, page * FORUM_LIMITS.PAGE_SIZE);
  const pageOfIndex = (i: number) => Math.floor(i / FORUM_LIMITS.PAGE_SIZE) + 1;

  // Quote / edit seeds for the editor, resolved from the ?quote= / ?edit= post.
  const numberOf = new Map(posts.map((p, i) => [p.id, i + 1]));
  const quoted = quote ? posts.find((p) => p.id === quote && !p.deletedAt) : undefined;
  const editing =
    edit && viewer.account
      ? posts.find(
          (p) => p.id === edit && !p.deletedAt && (p.authorId === viewer.account!.id || viewer.isAdmin),
        )
      : undefined;
  const quotedHandle = quoted?.authorId ? (authors.get(quoted.authorId)?.handle ?? "—") : "—";

  return (
    <>
      <p style={{ margin: "0 0 12px", fontSize: 13.5 }}>
        <Link href="/forum">All channels</Link>
        {channel && (
          <>
            {" · "}
            <Link href={`/forum/c/${channel.id}`}>{channel.name}</Link>
          </>
        )}
        {firstUnreadId && (
          <>
            {" · "}
            <a
              href={`/forum/t/${id}?page=${pageOfIndex((numberOf.get(firstUnreadId) ?? 1) - 1)}#p${numberOf.get(firstUnreadId)}`}
            >
              ↓ first unread (#{numberOf.get(firstUnreadId)})
            </a>
          </>
        )}
        {pageCount > 1 && (
          <span style={{ float: "right" }}>
            {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={`/forum/t/${id}?page=${n}`}
                style={{ marginLeft: 6, fontWeight: n === page ? 800 : 400 }}
              >
                {n}
              </Link>
            ))}
          </span>
        )}
      </p>
      <Notice err={err} ok={ok} />

      <div className="flat-card">
        <h2 style={{ marginBottom: 8 }}>
          {thread.pinned && <span className="flat-pill" style={{ marginRight: 8 }}>pinned</span>}
          {thread.locked && <span className="flat-pill" style={{ marginRight: 8 }}>locked</span>}
          {extra.tag && <span className="flat-pill" style={{ marginRight: 8 }}>{extra.tag}</span>}
          {thread.title}
        </h2>
        {viewer.isAdmin && (
          <form action={forumModerate} className="flat-row" style={{ gap: 8, marginTop: 8 }}>
            <input type="hidden" name="threadId" value={thread.id} />
            <button className="flat-btn is-ghost is-small flat-shrink" name="what" value={thread.pinned ? "unpin" : "pin"}>
              {thread.pinned ? "Unpin" : "Pin"}
            </button>
            <button className="flat-btn is-ghost is-small flat-shrink" name="what" value={thread.locked ? "unlock" : "lock"}>
              {thread.locked ? "Unlock" : "Lock"}
            </button>
            <button className="flat-btn is-danger is-small flat-shrink" name="what" value="deleteThread">
              Delete discussion
            </button>
          </form>
        )}
      </div>

      {pagePosts.map((p) => {
        const n = numberOf.get(p.id)!;
        const a = p.authorId ? authors.get(p.authorId) : undefined;
        const px = extra.posts[p.id];
        const identity = p.authorId ? identities.get(p.authorId) : undefined;
        const mine = viewer.account && p.authorId === viewer.account.id;
        return (
          <div className="flat-card" key={p.id} id={`p${n}`}>
            {firstUnreadId === p.id && (
              <p className="fnew-line" aria-label="First unread post">
                new since your last visit
              </p>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 8,
                flexWrap: "wrap",
                borderBottom: "1px solid var(--flat-line)",
                paddingBottom: 8,
                marginBottom: 10,
              }}
            >
              {/* The poster, and — on hover or focus — their life in the game.
                  The handle outlives every era; the card shows this age's. */}
              <span className="fpop-wrap" tabIndex={identity ? 0 : undefined}>
                <b>{a?.handle ?? "—"}</b>
                {identity && (
                  <span className="fpop" role="tooltip">
                    <b>{identity.empire}</b>
                    <span className="fpop-line">{identity.race}</span>
                    <span className="fpop-line">
                      #{identity.rank} · {identity.score.toLocaleString("en-US")} pts this age
                    </span>
                  </span>
                )}
              </span>
              {a?.admin && <span className="flat-pill is-admin">Admin</span>}
              <span className="flat-hint">{when(p.createdAt)}</span>
              {px?.editedAt && (
                <span className="flat-hint" title={when(px.editedAt)}>· edited</span>
              )}
              {px?.replyTo && (
                <a className="flat-hint" href={`#p${px.replyTo.n}`}>
                  ↩ in reply to {px.replyTo.handle} #{px.replyTo.n}
                </a>
              )}
              <span className="flat-spacer" />
              <a className="flat-hint" href={`#p${n}`} title="Link to this post">#{n}</a>
              {mine && !p.deletedAt && (
                <>
                  <Link className="flat-hint" href={`/forum/t/${thread.id}?edit=${p.id}#reply`}>
                    Edit
                  </Link>
                  <form action={forumDeleteOwn} style={{ display: "inline" }}>
                    <input type="hidden" name="threadId" value={thread.id} />
                    <input type="hidden" name="postId" value={p.id} />
                    <button className="flat-btn is-ghost is-small">Remove</button>
                  </form>
                </>
              )}
              {viewer.isAdmin && !p.deletedAt && !mine && (
                <form action={forumModerate}>
                  <input type="hidden" name="threadId" value={thread.id} />
                  <input type="hidden" name="postId" value={p.id} />
                  <button className="flat-btn is-ghost is-small" name="what" value="deletePost">
                    Delete
                  </button>
                </form>
              )}
            </div>
            {p.deletedAt ? (
              <p className="flat-hint" style={{ fontStyle: "italic", margin: 0 }}>
                {p.deletedBy && p.deletedBy === p.authorId
                  ? "Removed by its author."
                  : "This post was removed by a moderator."}
              </p>
            ) : (
              <PostBody body={p.body} />
            )}

            {/* ── Reactions + quote — the post's footer ─────────────────── */}
            {!p.deletedAt && (
              <div className="freact-row">
                {FORUM_REACTIONS.map((emoji) => {
                  const who = px?.reactions?.[emoji] ?? [];
                  const on = viewer.account ? who.includes(viewer.account.id) : false;
                  if (who.length === 0 && !viewer.canPost) return null;
                  return (
                    <form action={forumReact} key={emoji} style={{ display: "inline" }}>
                      <input type="hidden" name="threadId" value={thread.id} />
                      <input type="hidden" name="postId" value={p.id} />
                      <input type="hidden" name="emoji" value={emoji} />
                      <input type="hidden" name="n" value={n} />
                      <button
                        className={`freact${on ? " is-on" : ""}`}
                        title={on ? "Take it back" : "React"}
                        disabled={!viewer.canPost}
                      >
                        {emoji}
                        {who.length > 0 && <span className="freact-n">{who.length}</span>}
                      </button>
                    </form>
                  );
                })}
                {canReply && (
                  <Link className="flat-hint freact-quote" href={`/forum/t/${thread.id}?quote=${p.id}#reply`}>
                    ❝ Quote
                  </Link>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="flat-card" id="reply">
        <h3>{editing ? `Edit #${numberOf.get(editing.id)}` : "Reply"}</h3>
        {editing ? (
          <form action={forumEditPost}>
            <input type="hidden" name="threadId" value={thread.id} />
            <input type="hidden" name="postId" value={editing.id} />
            <Editor label="Your post, again" minHeight={150} initialHtml={editing.body} />
            <div className="flat-row" style={{ gap: 8 }}>
              <button className="flat-btn" type="submit">Save the edit</button>
              <Link className="flat-btn is-ghost" href={`/forum/t/${thread.id}`}>Never mind</Link>
            </div>
          </form>
        ) : canReply ? (
          <form action={forumReply}>
            <input type="hidden" name="threadId" value={thread.id} />
            {quoted && (
              <>
                <input type="hidden" name="replyTo" value={quoted.id} />
                <input type="hidden" name="replyToN" value={numberOf.get(quoted.id)} />
                <input type="hidden" name="replyToHandle" value={quotedHandle} />
              </>
            )}
            <Editor
              label="Your reply"
              minHeight={150}
              initialHtml={quoted ? quoteSeed(quotedHandle, numberOf.get(quoted.id) ?? 0, quoted.body) : undefined}
            />
            <button className="flat-btn" type="submit">Post reply</button>
          </form>
        ) : viewer.ban ? (
          <p className="flat-hint" style={{ margin: 0 }}>{banNotice(viewer.ban)}</p>
        ) : thread.locked ? (
          <p className="flat-hint" style={{ margin: 0 }}>This discussion is locked.</p>
        ) : (
          // Not signed in, or signed in but unnamed. The prompt is HERE rather
          // than at the door: this is the moment someone actually wants to say
          // something, which is the only moment the name matters.
          <NamePrompt needsHandle={viewer.needsHandle} to={`/forum/t/${thread.id}`} />
        )}
      </div>
    </>
  );
}
