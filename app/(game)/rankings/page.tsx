import Link from "next/link";
import { Art } from "@/components/Art";
import { BattleReportPanel } from "@/components/BattleReportPanel";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { TargetActions } from "@/components/TargetActions";
import { Pager } from "@/components/Pager";
import { HOLD_CLOCKS, RACE_NAMES } from "@/lib/constants";
import {
  rankingScore,
  researchLevel,
  settlementTitle,
  totalPopulation,
  troopStrengthLabel,
} from "@/lib/engine";
import { paginate } from "@/lib/paginate";
import { getGame } from "@/lib/server/session";
import { MS_PER_HOUR, REVENGE_WINDOW_TICKS, empireNumbers, overlordHold } from "@/lib/server/world";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const PAGE_SIZE = 30;

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; err?: string; ok?: string; report?: string }>;
}) {
  const { q, page, err, ok, report: reportId } = await searchParams;
  const { world, player: me } = await getGame();
  const query = (q ?? "").toLowerCase();
  const tick = world.meta.tickNumber;
  const numbers = empireNumbers(world);
  const report = reportId ? world.battles.find((b) => b.id === reportId) : undefined;

  const ladder = Object.values(world.players)
    .map((p) => ({ p, score: rankingScore(p) }))
    .sort((a, b) => b.score - a.score);
  const rankOf = new Map(ladder.map((l, i) => [l.p.id, i + 1]));
  const filtered = query
    ? ladder.filter(
        ({ p }) =>
          p.name.toLowerCase().includes(query) ||
          RACE_NAMES[p.race].toLowerCase().includes(query) ||
          settlementTitle(p).toLowerCase().includes(query) ||
          (p.clanId && world.clans[p.clanId]?.name.toLowerCase().includes(query)),
      )
    : ladder;

  const paged = paginate(filtered, page, PAGE_SIZE);
  const pageHref = (n: number) => `/rankings?${q ? `q=${encodeURIComponent(q)}&` : ""}page=${n}`;

  // My war context: whom I may revenge (personal window, or a clan-bombardment
  // window my banner still holds), and my Tradecraft for the spy console.
  const myScore = Math.max(1, rankingScore(me));
  const tradecraft = researchLevel(me, "tradecraft");
  const myClan = me.clanId ? world.clans[me.clanId] : undefined;
  const personalRevenge = new Set(
    me.recentAttackers
      .filter((a) => tick - a.tick <= REVENGE_WINDOW_TICKS && !me.revengeUsed.includes(a.playerId))
      .map((a) => a.playerId),
  );
  const clanRevenge = new Set<string>();
  const rev = myClan?.pendingRevenge;
  if (rev && tick <= rev.expiresAtTick && rev.memberSnapshot.includes(me.id)) {
    for (const id of world.clans[rev.againstClanId]?.members ?? []) clanRevenge.add(id);
  }
  const warClanIds = new Set(myClan?.wars.map((w) => w.clanId) ?? []);

  const leader = ladder[0];
  const oh = overlordHold(world);
  const cum = leader && leader.p.id === oh.holderId ? oh.cumMs : leader ? (world.meta.overlordClocksMs?.[leader.p.id] ?? 0) : 0;
  const streak = leader && leader.p.id === oh.holderId ? oh.streakMs : 0;

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#winning">How the ladder wins you the era</LearnLink>
      {report && <BattleReportPanel report={report} />}
      <nav className="rank-tabs" aria-label="Rankings">
        <Link href="/rankings" aria-current="page">Empire Ranks</Link>
        <Link href="/rankings/clans">Clan Ranks</Link>
      </nav>
      <Panel title="The Ladder — the world itself, and your war console">
        <form style={{ marginBottom: 8, display: "flex", gap: 6 }}>
          <input
            name="q"
            defaultValue={q}
            placeholder="Search name, race, clan, or title…"
            style={{ padding: "3px 8px", border: "1px solid var(--border)", background: "var(--input-bg)", font: "14.5px Verdana", width: 240 }}
          />
          <button className="btn">Search</button>
        </form>
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">Rank</th>
              <th>Empire</th>
              <th className="num">ID</th>
              <th>Clan</th>
              <th>Troops</th>
              <th className="num">Population</th>
              <th>Act</th>
            </tr>
          </thead>
          <tbody>
            {paged.shown.map(({ p }) => {
              const rank = rankOf.get(p.id) ?? 0;
              const clan = p.clanId ? world.clans[p.clanId] : undefined;
              const isMe = p.id === me.id;
              const shielded = p.shieldUntilTick > tick;
              const revengeOpen = personalRevenge.has(p.id) || clanRevenge.has(p.id);
              const atWar = p.clanId ? warClanIds.has(p.clanId) : false;
              const refused = rankingScore(p) / myScore >= 1.75;
              const hint = shielded
                ? "🛡 Under the newcomer shield — no attacks or spying."
                : refused
                  ? "Far stronger than you — the army may refuse to march."
                  : p.surrendered
                    ? "🏳 Surrendered — only revenge may touch them."
                    : undefined;
              return (
                <tr key={p.id} style={isMe ? { fontWeight: 700 } : undefined}>
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
                    <span className="race-cell">
                      <span className="race-avatar">
                        <Art path={`races/${p.race}`} size={30} title={RACE_NAMES[p.race]} />
                      </span>
                      <span>
                        <Link href={`/empire/${p.id}`}>{p.name}</Link>
                        {isMe && <span style={{ color: "var(--pos)" }}> (you)</span>}
                        <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                          {settlementTitle(p)} · {RACE_NAMES[p.race]}
                          {revengeOpen && <span style={{ color: "var(--warn)", fontWeight: 700 }}> · ⚔ revenge open</span>}
                          {atWar && <span style={{ color: "var(--warn)" }}> · 🔥 at war</span>}
                          {p.surrendered && " · 🏳"}
                          {shielded && " · 🛡"}
                        </div>
                      </span>
                    </span>
                  </td>
                  <td className="num" style={{ color: "var(--ink-soft)" }}>{numbers.get(p.id)}</td>
                  <td>{clan ? <Link href={`/clan/${clan.id}`}>{clan.name}</Link> : <span style={{ color: "var(--ink-soft)" }}>—</span>}</td>
                  <td>{troopStrengthLabel(p)}</td>
                  <td className="num">{fmt(totalPopulation(p))}</td>
                  <td>
                    {isMe ? (
                      <span style={{ color: "var(--ink-soft)", fontSize: 13 }}>— your seat —</span>
                    ) : (
                      <TargetActions
                        target={{ id: p.id, name: p.name }}
                        revengeOpen={revengeOpen}
                        tradecraft={tradecraft}
                        hint={hint}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Pager page={paged} href={pageHref} noun="empires" />
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>
          Troops read as a traveler would guess them — None · Weak · Moderate · Strong · Heavy.
          Exact counts are for spies. Open <b>⚔ Act</b> on any empire to raid, siege, spy, or send a
          letter. 🏳 surrendered · 🛡 newcomer shield · 🔥 your clan is at war.
        </p>
        {leader && (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 6 }}>
            <span style={{ color: "var(--coin)" }}>👑</span> The crown is public:{" "}
            <b>{leader.p.name}</b> holds #1 — {(cum / MS_PER_HOUR).toFixed(1)}h of the{" "}
            {HOLD_CLOCKS.CUMULATIVE_HOURS}h cumulative, {(streak / MS_PER_HOUR).toFixed(1)}h of the{" "}
            {HOLD_CLOCKS.STREAK_HOURS}h streak
            {totalPopulation(leader.p) < 10000 ? " (below the 10,000 population floor — clocks frozen)" : ""}.
          </p>
        )}
      </Panel>
    </>
  );
}
