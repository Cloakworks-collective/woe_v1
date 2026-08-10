import { FORUM_BAN_DURATIONS, FORUM_CHANNELS } from "@/lib/constants/forum";
import { activeBan, listBans, listThreads, listUsers, postsByAuthor } from "@/lib/server/forumStore";
import { adminForumBan, adminForumPardon, adminForumSetAdmin } from "../forumActions";

export const dynamic = "force-dynamic";

const when = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";

export default async function AdminForumPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; q?: string }>;
}) {
  const { err, ok, q } = await searchParams;
  const users = await listUsers();
  const bans = await listBans();
  const needle = (q ?? "").trim().toLowerCase();
  const shown = needle
    ? users.filter((u) => `${u.handle} ${u.empireName ?? ""}`.toLowerCase().includes(needle))
    : users;

  // One live-ban lookup per shown account, plus their post count — the two
  // things you actually need to decide whether to act.
  const rows = await Promise.all(
    shown.map(async (u) => ({
      user: u,
      ban: await activeBan(u.id),
      posts: (await postsByAuthor(u.id, 500)).length,
    })),
  );

  const threadCounts = await Promise.all(
    FORUM_CHANNELS.map(async (c) => ({ channel: c, threads: (await listThreads(c.id)).length })),
  );

  return (
    <>
      {(err || ok) && (
        <p className={`flat-notice ${err ? "is-bad" : "is-good"}`}>{err ?? ok}</p>
      )}

      <div className="flat-card">
        <h2>Forum</h2>
        <p className="flat-sub">
          Accounts here are independent of empires and survive every era reset. A silence stops
          posting but never reading — a banned account still sees the rules and its own history.
        </p>
        <div className="flat-scroll">
          <table className="flat-tbl">
            <thead>
              <tr>
                <th>Channel</th>
                <th className="num">Discussions</th>
                <th>Who may open one</th>
              </tr>
            </thead>
            <tbody>
              {threadCounts.map(({ channel, threads }) => (
                <tr key={channel.id}>
                  <td>
                    <b>{channel.name}</b>
                    <div className="flat-hint">{channel.blurb}</div>
                  </td>
                  <td className="num">{threads}</td>
                  <td>{channel.adminOnlyThreads ? "Admins only" : "Admins (for now)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flat-card">
        <h3>Accounts — {shown.length} of {users.length}</h3>
        <form method="get" className="flat-row" style={{ marginBottom: 12 }}>
          <input name="q" type="search" defaultValue={q ?? ""} placeholder="Search handle or empire" aria-label="Search accounts" />
          <button className="flat-btn is-ghost flat-shrink" type="submit">Search</button>
        </form>

        {rows.length === 0 ? (
          <p className="flat-hint">No accounts yet. The first one to register becomes an admin.</p>
        ) : (
          <div className="flat-scroll">
            <table className="flat-tbl">
              <thead>
                <tr>
                  <th>Handle</th>
                  <th className="num">Posts</th>
                  <th>Joined</th>
                  <th>Last seen</th>
                  <th>Status</th>
                  <th>Silence</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ user, ban, posts }) => (
                  <tr key={user.id}>
                    <td>
                      <b>{user.handle}</b>
                      {user.isAdmin && <span className="flat-pill is-admin" style={{ marginLeft: 6 }}>Admin</span>}
                      {user.empireName && <div className="flat-hint">{user.empireName}</div>}
                    </td>
                    <td className="num">{posts}</td>
                    <td>{when(user.createdAt)}</td>
                    <td>{when(user.lastSeenAt)}</td>
                    <td>
                      {ban ? (
                        <>
                          <span className="flat-pill is-banned">
                            {ban.untilAt ? "silenced" : "permanent"}
                          </span>
                          <div className="flat-hint">
                            {ban.untilAt ? `until ${when(ban.untilAt)}` : "indefinitely"}
                            {ban.reason && <> · {ban.reason}</>}
                          </div>
                        </>
                      ) : (
                        <span className="flat-hint">clear</span>
                      )}
                    </td>
                    <td>
                      {ban ? (
                        <form action={adminForumPardon}>
                          <input type="hidden" name="userId" value={user.id} />
                          <button className="flat-btn is-ghost is-small" type="submit">Pardon</button>
                        </form>
                      ) : (
                        <form action={adminForumBan} className="flat-row" style={{ gap: 6 }}>
                          <input type="hidden" name="userId" value={user.id} />
                          <select name="days" aria-label={`Silence ${user.handle} for`} style={{ minWidth: 110 }}>
                            {FORUM_BAN_DURATIONS.map((d) => (
                              <option key={d.days} value={d.days}>{d.label}</option>
                            ))}
                          </select>
                          <input name="reason" type="text" placeholder="Reason (optional)" aria-label="Reason" />
                          <button className="flat-btn is-danger is-small flat-shrink" type="submit">Silence</button>
                        </form>
                      )}
                      <form action={adminForumSetAdmin} style={{ marginTop: 6 }}>
                        <input type="hidden" name="userId" value={user.id} />
                        <input type="hidden" name="make" value={user.isAdmin ? "0" : "1"} />
                        <button className="flat-btn is-ghost is-small" type="submit">
                          {user.isAdmin ? "Remove forum crown" : "Make forum admin"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="flat-card">
        <h3>Ban history — {bans.length}</h3>
        {bans.length === 0 ? (
          <p className="flat-hint">Nobody has been silenced.</p>
        ) : (
          <div className="flat-scroll">
            <table className="flat-tbl">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Given</th>
                  <th>Until</th>
                  <th>Reason</th>
                  <th>Lifted</th>
                </tr>
              </thead>
              <tbody>
                {bans.map((b) => {
                  const u = users.find((x) => x.id === b.userId);
                  return (
                    <tr key={b.id}>
                      <td>{u?.handle ?? "—"}</td>
                      <td>{when(b.createdAt)}</td>
                      <td>{b.untilAt ? when(b.untilAt) : "permanent"}</td>
                      <td>{b.reason ?? "—"}</td>
                      <td>{b.liftedAt ? when(b.liftedAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
