import Link from "next/link";
import { Art } from "@/components/Art";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { HOLD_CLOCKS, RACE_NAMES, TICKS_PER_HOUR } from "@/lib/constants";
import { rankingScore, settlementTitle, totalPopulation } from "@/lib/engine";
import { getGame } from "@/lib/server/session";
import { clanScore } from "@/lib/server/world";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; err?: string }>;
}) {
  const { q, err } = await searchParams;
  const { world, player: me } = await getGame();
  const query = (q ?? "").toLowerCase();

  const ladder = Object.values(world.players)
    .map((p) => ({ p, score: rankingScore(p) }))
    .sort((a, b) => b.score - a.score);
  const filtered = query
    ? ladder.filter(
        ({ p }) =>
          p.name.toLowerCase().includes(query) ||
          RACE_NAMES[p.race].toLowerCase().includes(query) ||
          settlementTitle(p).toLowerCase().includes(query),
      )
    : ladder;

  const leader = ladder[0];
  const cum = leader ? (world.meta.overlordClocks[leader.p.id] ?? 0) : 0;
  const streak =
    leader && world.meta.overlordStreak?.playerId === leader.p.id
      ? world.meta.overlordStreak.ticks
      : 0;

  const clans = Object.values(world.clans)
    .map((c) => ({ c, score: clanScore(world, c) }))
    .sort((a, b) => b.score - a.score);

  return (
    <>
      <Flash err={err} />
      <LearnLink href="/guide#winning">How the ladder wins you the era</LearnLink>
      <Panel title="The Ladder — the world itself">
        <form style={{ marginBottom: 8, display: "flex", gap: 6 }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, race, or title…"
            style={{ padding: "3px 8px", border: "1px solid var(--border)", background: "var(--input-bg)", font: "13.5px Verdana", width: 240 }}
          />
          <button className="btn">Search</button>
        </form>
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Empire</th>
              <th>Race</th>
              <th>Clan</th>
              <th className="num">Population</th>
              <th className="num">Score</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ p, score }) => {
              const rank = ladder.findIndex((l) => l.p.id === p.id) + 1;
              return (
                <tr key={p.id} style={p.id === me.id ? { fontWeight: 700 } : undefined}>
                  <td className="num">{rank === 1 ? "👑 1" : rank}</td>
                  <td>
                    <span className="race-cell">
                      <span className="race-avatar">
                        <Art path={`races/${p.race}`} size={26} title={RACE_NAMES[p.race]} />
                      </span>
                      <span>
                        <Link href={`/empire/${p.id}`}>{p.name}</Link>
                        {p.id === me.id && " (you)"}
                        {p.surrendered && " 🏳"}
                      </span>
                    </span>
                  </td>
                  <td>{RACE_NAMES[p.race]}</td>
                  <td>{p.clanId ? (world.clans[p.clanId]?.name ?? "—") : "—"}</td>
                  <td className="num">{fmt(totalPopulation(p))}</td>
                  <td className="num">{fmt(score)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {leader && (
          <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 6 }}>
            👑 The crown is public: {leader.p.name} holds #1 —{" "}
            {(cum / TICKS_PER_HOUR).toFixed(1)}h of the {HOLD_CLOCKS.CUMULATIVE_HOURS}h cumulative,{" "}
            {(streak / TICKS_PER_HOUR).toFixed(1)}h of the {HOLD_CLOCKS.STREAK_HOURS}h streak
            {totalPopulation(leader.p) < 10000 ? " (below the 10,000 population floor — clocks frozen)" : ""}.
          </p>
        )}
      </Panel>

      {clans.length > 0 && (
        <Panel title="Clan Ladder">
          <table className="tbl">
            <thead>
              <tr>
                <th className="num">#</th>
                <th>Clan</th>
                <th className="num">Members</th>
                <th>War record</th>
                <th className="num">Score</th>
              </tr>
            </thead>
            <tbody>
              {clans.map(({ c, score }, i) => (
                <tr key={c.id}>
                  <td className="num">{i + 1}</td>
                  <td>{c.name}</td>
                  <td className="num">{c.members.length}</td>
                  <td>
                    {c.warRecord.wins}W / {c.warRecord.losses}L
                  </td>
                  <td className="num">{fmt(score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
