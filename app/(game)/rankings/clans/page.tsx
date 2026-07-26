import Link from "next/link";
import { LearnLink } from "@/components/LearnLink";
import { Pager } from "@/components/Pager";
import { Panel } from "@/components/Panel";
import { HOLD_CLOCKS, POPULATION_FLOORS } from "@/lib/constants";
import { memberCap, totalPopulation } from "@/lib/engine";
import { paginate } from "@/lib/paginate";
import { getGame } from "@/lib/server/session";
import { MS_PER_HOUR, clanHold, clanScore } from "@/lib/server/world";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const PAGE_SIZE = 30;

export default async function ClanRanksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const { world, player: me } = await getGame();

  const clans = Object.values(world.clans)
    .map((c) => ({
      c,
      score: clanScore(world, c),
      population: c.members.reduce(
        (sum, id) => sum + (world.players[id] ? totalPopulation(world.players[id]) : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score);

  const paged = paginate(clans, page, PAGE_SIZE);
  const top = clans[0];
  const ch = clanHold(world);
  const cum = top && top.c.id === ch.holderId ? ch.cumMs : top ? (world.meta.clanClocksMs?.[top.c.id] ?? 0) : 0;
  const streak = top && top.c.id === ch.holderId ? ch.streakMs : 0;

  return (
    <>
      <LearnLink href="/guide#clans">How clans work &amp; win together</LearnLink>
      <nav className="rank-tabs" aria-label="Rankings">
        <Link href="/rankings">Empire Ranks</Link>
        <Link href="/rankings/clans" aria-current="page">Clan Ranks</Link>
      </nav>
      <Panel title="Clan Ranks — the banners of the age">
        {clans.length === 0 ? (
          <p style={{ fontSize: 14.5 }}>
            No banners fly yet. <Link href="/clan">Found the first clan</Link> (50,000 gold).
          </p>
        ) : (
          <>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="num">Rank</th>
                  <th>Clan</th>
                  <th className="num">Members</th>
                  <th className="num">Population</th>
                  <th>War record</th>
                  <th className="num">Score</th>
                </tr>
              </thead>
              <tbody>
                {paged.shown.map(({ c, score, population }, i) => {
                  const rank = paged.start + i + 1;
                  return (
                    <tr key={c.id} style={me.clanId === c.id ? { fontWeight: 700 } : undefined}>
                      <td className="num">
                        {rank === 1 ? (
                          <span style={{ color: "var(--coin)", fontWeight: 700 }}>👑 1</span>
                        ) : rank <= 3 ? (
                          <span style={{ color: "var(--coin)" }}>{rank}</span>
                        ) : (
                          rank
                        )}
                      </td>
                      <td>
                        <Link href={`/clan/${c.id}`}>{c.name}</Link>
                        {me.clanId === c.id && <span style={{ color: "var(--pos)" }}> (yours)</span>}
                        {c.wars.length > 0 && <span style={{ color: "var(--warn)" }}> ⚔ at war</span>}
                      </td>
                      <td className="num">
                        {c.members.length}/{memberCap(c)}
                      </td>
                      <td className="num">{fmt(population)}</td>
                      <td>
                        <span style={{ color: "var(--pos)" }}>{c.warRecord.wins} wins</span>
                        <span style={{ color: "var(--ink-soft)" }}> · </span>
                        <span style={{ color: "var(--neg)" }}>{c.warRecord.losses} losses</span>
                      </td>
                      <td className="num" style={{ color: "var(--coin)", fontWeight: 700 }}>{fmt(score)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager page={paged} href={(n) => `/rankings/clans?page=${n}`} noun="clans" />
            {top && (
              <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 6 }}>
                👑 {top.c.name} leads the clans — {(cum / MS_PER_HOUR).toFixed(1)}h of the{" "}
                {HOLD_CLOCKS.CUMULATIVE_HOURS}h cumulative, {(streak / MS_PER_HOUR).toFixed(1)}h
                of the {HOLD_CLOCKS.STREAK_HOURS}h streak
                {top.population < POPULATION_FLOORS.CLAN
                  ? ` (below the ${fmt(POPULATION_FLOORS.CLAN)} population floor — clocks frozen)`
                  : ""}
                . ⚔ marks a clan at war.
              </p>
            )}
          </>
        )}
      </Panel>
    </>
  );
}
