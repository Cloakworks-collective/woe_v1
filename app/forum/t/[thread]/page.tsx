import Link from "next/link";
import { notFound } from "next/navigation";
import { FORUM_LIMITS, forumChannel } from "@/lib/constants/forum";
import { banNotice, getForumViewer } from "@/lib/server/forumAuth";
import { findUser, getThread, listPosts } from "@/lib/server/forumStore";
import { forumModerate, forumReply } from "../../actions";
import { Notice } from "../../Notice";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: Promise<{ thread: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { thread: id } = await params;
  const { err, ok } = await searchParams;
  const thread = await getThread(id);
  if (!thread) notFound();

  const channel = forumChannel(thread.channel);
  const viewer = await getForumViewer();
  const posts = await listPosts(id);

  const authors = new Map<string, { handle: string; empire?: string; admin: boolean }>();
  for (const p of posts) {
    if (p.authorId && !authors.has(p.authorId)) {
      const a = await findUser(p.authorId);
      authors.set(p.authorId, {
        handle: a?.handle ?? "—",
        empire: a?.empireName,
        admin: a?.isAdmin ?? false,
      });
    }
  }

  const canReply = viewer.user && !viewer.ban && (!thread.locked || viewer.isAdmin);

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
      </p>
      <Notice err={err} ok={ok} />

      <div className="flat-card">
        <h2 style={{ marginBottom: 8 }}>
          {thread.pinned && <span className="flat-pill" style={{ marginRight: 8 }}>pinned</span>}
          {thread.locked && <span className="flat-pill" style={{ marginRight: 8 }}>locked</span>}
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

      {posts.map((p, i) => {
        const a = p.authorId ? authors.get(p.authorId) : undefined;
        return (
          <div className="flat-card" key={p.id}>
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
              <b>{a?.handle ?? "—"}</b>
              {a?.admin && <span className="flat-pill is-admin">Admin</span>}
              {a?.empire && <span className="flat-pill">{a.empire}</span>}
              <span className="flat-hint">{when(p.createdAt)}</span>
              <span className="flat-spacer" />
              <span className="flat-hint">#{i + 1}</span>
              {viewer.isAdmin && !p.deletedAt && (
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
                This post was removed by a moderator.
              </p>
            ) : (
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{p.body}</div>
            )}
          </div>
        );
      })}

      <div className="flat-card">
        <h3>Reply</h3>
        {canReply ? (
          <form action={forumReply}>
            <input type="hidden" name="threadId" value={thread.id} />
            <label className="flat-field">
              <span className="sr-only">Your reply</span>
              <textarea name="body" maxLength={FORUM_LIMITS.BODY_MAX} required aria-label="Your reply" />
            </label>
            <button className="flat-btn" type="submit">Post reply</button>
          </form>
        ) : (
          <p className="flat-hint" style={{ margin: 0 }}>
            {viewer.ban
              ? banNotice(viewer.ban)
              : !viewer.user
                ? "Sign in to reply."
                : "This discussion is locked."}
          </p>
        )}
      </div>
    </>
  );
}
