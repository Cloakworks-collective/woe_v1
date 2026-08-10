import Link from "next/link";
import { FORUM_CHANNELS } from "@/lib/constants/forum";
import { getForumViewer } from "@/lib/server/forumAuth";
import { isSchemaMissing, listThreads } from "@/lib/server/forumStore";
import { Notice } from "./Notice";
import { SetupNotice } from "./SetupNotice";

export const dynamic = "force-dynamic";

export default async function ForumIndex({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { user, ban } = await getForumViewer();

  let channels;
  try {
    channels = await Promise.all(
      FORUM_CHANNELS.map(async (c) => {
        const threads = await listThreads(c.id);
        const posts = threads.reduce((s, t) => s + t.postCount, 0);
        return { channel: c, threads: threads.length, posts, latest: threads[0] };
      }),
    );
  } catch (e) {
    if (isSchemaMissing(e)) return <SetupNotice />;
    throw e;
  }

  return (
    <>
      <Notice err={err} ok={ok} />
      {ban && (
        <p className="flat-notice is-bad">
          <b>You are silenced.</b> You can read every channel, but not post.
          {ban.reason && <> Reason: {ban.reason}</>}
        </p>
      )}
      {!user && (
        <p className="flat-notice is-warn">
          You are reading as a guest. <Link href="/forum/register">Register a handle</Link> to reply
          — you do not need an empire, and your account outlives every era.
        </p>
      )}

      <div className="flat-card">
        <h2>Channels</h2>
        <p className="flat-sub">
          The forum is separate from the game. In-game letters and clan chat live inside your era and
          are wiped with it; everything here stays.
        </p>
        <div className="flat-scroll">
          <table className="flat-tbl">
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num">Discussions</th>
                <th className="num">Posts</th>
                <th>Latest</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(({ channel, threads, posts, latest }) => (
                <tr key={channel.id}>
                  <td>
                    <Link href={`/forum/c/${channel.id}`} style={{ fontWeight: 700 }}>
                      {channel.name}
                    </Link>
                    {channel.adminOnlyThreads && (
                      <span className="flat-pill" style={{ marginLeft: 6 }}>
                        announcements
                      </span>
                    )}
                    <div className="flat-hint">{channel.blurb}</div>
                  </td>
                  <td className="num">{threads}</td>
                  <td className="num">{posts}</td>
                  <td>
                    {latest ? (
                      <Link href={`/forum/t/${latest.id}`}>{latest.title}</Link>
                    ) : (
                      <span className="flat-hint">nothing yet</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
