import Link from "next/link";
import { notFound } from "next/navigation";
import { FORUM_LIMITS, forumChannel } from "@/lib/constants/forum";
import { banNotice, getForumViewer } from "@/lib/server/forumAuth";
import { findUser, listThreads } from "@/lib/server/forumStore";
import { forumNewThread } from "../../actions";
import { Notice } from "../../Notice";

export const dynamic = "force-dynamic";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ channel: string }>;
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { channel: id } = await params;
  const { err, ok } = await searchParams;
  const channel = forumChannel(id);
  if (!channel) notFound();

  const viewer = await getForumViewer();
  const threads = await listThreads(id);
  const authors = new Map<string, string>();
  for (const t of threads) {
    if (t.authorId && !authors.has(t.authorId)) {
      const a = await findUser(t.authorId);
      authors.set(t.authorId, a?.handle ?? "—");
    }
  }

  return (
    <>
      <p style={{ margin: "0 0 12px", fontSize: 13.5 }}>
        <Link href="/forum">← All channels</Link>
      </p>
      <Notice err={err} ok={ok} />

      <div className="flat-card">
        <h2>{channel.name}</h2>
        <p className="flat-sub">{channel.blurb}</p>
        {threads.length === 0 ? (
          <p className="flat-hint">No discussions here yet.</p>
        ) : (
          <div className="flat-scroll">
            <table className="flat-tbl">
              <thead>
                <tr>
                  <th>Discussion</th>
                  <th>Started by</th>
                  <th className="num">Replies</th>
                  <th>Last post</th>
                </tr>
              </thead>
              <tbody>
                {threads.map((t) => (
                  <tr key={t.id}>
                    <td>
                      {t.pinned && <span className="flat-pill" style={{ marginRight: 6 }}>pinned</span>}
                      {t.locked && <span className="flat-pill" style={{ marginRight: 6 }}>locked</span>}
                      <Link href={`/forum/t/${t.id}`} style={{ fontWeight: 700 }}>
                        {t.title}
                      </Link>
                    </td>
                    <td>{t.authorId ? authors.get(t.authorId) : "—"}</td>
                    <td className="num">{Math.max(0, t.postCount - 1)}</td>
                    <td>{when(t.lastPostAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewer.isAdmin ? (
        <div className="flat-card">
          <h3>Open a new discussion</h3>
          <p className="flat-sub">
            Only the crown starts threads for now. Anyone signed in may reply.
          </p>
          <form action={forumNewThread}>
            <input type="hidden" name="channel" value={id} />
            <label className="flat-field">
              <span>Title</span>
              <input name="title" type="text" maxLength={FORUM_LIMITS.TITLE_MAX} required />
            </label>
            <label className="flat-field">
              <span>Opening post</span>
              <textarea name="body" maxLength={FORUM_LIMITS.BODY_MAX} required />
            </label>
            <button className="flat-btn" type="submit">Post discussion</button>
          </form>
        </div>
      ) : (
        <p className="flat-hint">
          {viewer.ban
            ? banNotice(viewer.ban)
            : viewer.user
              ? "Only the crown opens new discussions for now — open one of the above and reply."
              : "Sign in to reply to a discussion."}
        </p>
      )}
    </>
  );
}
