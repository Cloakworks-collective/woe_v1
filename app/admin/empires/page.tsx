import { RACE_NAMES } from "@/lib/constants";
import { rankingScore, settlementTitle, totalPopulation } from "@/lib/engine";
import { getWorld } from "@/lib/server/world";
import { adminEnterAs, adminGrant, adminReturnToSelf, adminSetBan, adminSetPremium } from "../actions";
import { impersonatedPlayerId } from "@/lib/server/admin";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const RES = ["gold", "food", "wood", "stone", "ore"] as const;

const FILTERS = [
  { id: "", label: "All" },
  { id: "humans", label: "Humans" },
  { id: "bots", label: "Bots" },
  { id: "trouble", label: "Trouble" },
  { id: "banned", label: "Banished" },
  { id: "premium", label: "Charters" },
];

export default async function AdminEmpiresPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; q?: string; only?: string }>;
}) {
  const { err, ok, q, only } = await searchParams;
  const world = await getWorld();
  const worn = await impersonatedPlayerId();
  const players = Object.values(world.players).sort((a, b) => rankingScore(b) - rankingScore(a));

  const needle = (q ?? "").trim().toLowerCase();
  const ledger = players.filter((p) => {
    if (needle && !`${p.name} ${p.id} ${RACE_NAMES[p.race]}`.toLowerCase().includes(needle)) return false;
    if (only === "humans") return !p.isBot;
    if (only === "bots") return Boolean(p.isBot);
    if (only === "banned") return Boolean(p.banned);
    if (only === "premium") return Boolean(p.premium);
    if (only === "trouble") return Boolean(p.starving) || Boolean(p.banned);
    return true;
  });

  return (
    <>
      {(err || ok) && <p className={`flat-notice ${err ? "is-bad" : "is-good"}`}>{err ?? ok}</p>}

      {worn && (
        <div className="flat-notice is-bad flat-row" style={{ justifyContent: "space-between" }}>
          <span>
            👑 You are currently acting as <b>{world.players[worn]?.name ?? worn}</b>. Every game
            command you issue is theirs until you step down.
          </span>
          <form action={adminReturnToSelf}>
            <button className="flat-btn flat-shrink" type="submit">Return to your own throne</button>
          </form>
        </div>
      )}

      <div className="flat-card">
        <h2>Royal grant</h2>
        <p className="flat-sub">Give resources — or take them, with a negative number.</p>
        <form action={adminGrant} className="flat-row">
          <select name="playerId" aria-label="Empire">
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isBot ? " (bot)" : ""}
              </option>
            ))}
          </select>
          {RES.map((r) => (
            <label className="flat-field flat-shrink" key={r} style={{ marginBottom: 0 }}>
              <span style={{ textTransform: "capitalize" }}>{r}</span>
              <input name={r} type="number" defaultValue={0} aria-label={`Grant ${r}`} style={{ width: 120 }} />
            </label>
          ))}
          <button className="flat-btn flat-shrink" type="submit">Decree</button>
        </form>
      </div>

      <div className="flat-card">
        <h3>The ledger — {fmt(ledger.length)} of {fmt(players.length)} empires</h3>
        <form method="get" className="flat-row" style={{ marginBottom: 12 }}>
          <input name="q" type="search" defaultValue={q ?? ""} placeholder="Search name, id or race" aria-label="Search empires" />
          <select name="only" defaultValue={only ?? ""} aria-label="Filter" className="flat-shrink" style={{ minWidth: 140 }}>
            {FILTERS.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <button className="flat-btn is-ghost flat-shrink" type="submit">Filter</button>
        </form>

        <div className="flat-scroll">
          <table className="flat-tbl">
            <thead>
              <tr>
                <th>Empire</th>
                <th>Race</th>
                <th className="num">Score</th>
                <th className="num">Population</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((p) => (
                <tr key={p.id}>
                  <td>
                    <b>{p.name}</b>
                    {p.isBot && <span className="flat-pill" style={{ marginLeft: 6 }}>bot</span>}
                    <div className="flat-hint">{settlementTitle(p)}</div>
                  </td>
                  <td>{RACE_NAMES[p.race]}</td>
                  <td className="num">{fmt(rankingScore(p))}</td>
                  <td className="num">{fmt(totalPopulation(p))}</td>
                  <td>
                    {p.banned && <span className="flat-pill is-banned">banished</span>}
                    {p.starving && <span className="flat-pill" style={{ marginLeft: 4 }}>starving</span>}
                    {p.premium && <span className="flat-pill is-admin" style={{ marginLeft: 4 }}>charter</span>}
                    {p.onVacation && <span className="flat-pill" style={{ marginLeft: 4 }}>away</span>}
                    {!p.banned && !p.starving && !p.premium && !p.onVacation && (
                      <span className="flat-hint">—</span>
                    )}
                  </td>
                  <td>
                    <div className="flat-row" style={{ gap: 6 }}>
                      <form action={adminSetBan} className="flat-shrink">
                        <input type="hidden" name="playerId" value={p.id} />
                        <input type="hidden" name="flag" value={p.banned ? "0" : "1"} />
                        <button className={`flat-btn is-small ${p.banned ? "is-ghost" : "is-danger"}`} type="submit">
                          {p.banned ? "Pardon" : "Banish"}
                        </button>
                      </form>
                      <form action={adminSetPremium} className="flat-shrink">
                        <input type="hidden" name="playerId" value={p.id} />
                        <input type="hidden" name="flag" value={p.premium ? "0" : "1"} />
                        <button className="flat-btn is-ghost is-small" type="submit">
                          {p.premium ? "Revoke charter" : "Grant charter"}
                        </button>
                      </form>
                      {/* Every empire, bots included — impersonation no longer
                          needs an account behind the throne. */}
                      <form action={adminEnterAs} className="flat-shrink">
                        <input type="hidden" name="playerId" value={p.id} />
                        <button className="flat-btn is-ghost is-small" type="submit">
                          {worn === p.id ? "Re-enter" : "Enter as"}
                        </button>
                      </form>
                    </div>
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
