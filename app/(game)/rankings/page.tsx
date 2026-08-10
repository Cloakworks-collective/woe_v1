import { Btn } from "@/components/Btn";
import Link from "next/link";
import { Art } from "@/components/Art";
import { BattleReportPanel } from "@/components/BattleReportPanel";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { ReqTip } from "@/components/CostTip";
import { TargetActions } from "@/components/TargetActions";
import { Pager } from "@/components/Pager";
import { ARMY_FLOORS, ATTACK_HISTORY_HOURS, ATTACK_HISTORY_TICKS, HOLD_CLOCKS, RACE_NAMES } from "@/lib/constants";
import {
  attacksByDefender,
  rankingScore,
  researchLevel,
  settlementTitle,
  regularTroops,
  totalPopulation,
  troopStrengthLabel,
} from "@/lib/engine";
import { paginate } from "@/lib/paginate";
import { getGame } from "@/lib/server/session";
import { MS_PER_HOUR, REVENGE_WINDOW_TICKS, overlordHold } from "@/lib/server/world";

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
  // Public raid history — who has been fed upon lately. Same facts the World
  // News feed already publishes; the ladder just counts them per empire.
  const raidHistory = attacksByDefender(world.battles, tick, ATTACK_HISTORY_TICKS);

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
            style={{ width: 240 }}
          />
          <ReqTip heading="Search the ladder" body="Filter to empires matching your query — by empire name, race, clan, or settlement title. Leave blank to see everyone.">
            <Btn className="btn">Search</Btn>
          </ReqTip>
        </form>
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">Rank</th>
              <th>Empire</th>
              <th>Clan</th>
              <th>
                <ReqTip
                  down
                  heading="Troop strength — a traveller's guess"
                  body="Read as a passer-by would judge it: None · Weak · Moderate · Strong · Heavy. Exact counts are for spies — run an op from 🗡 Spy to see the real muster."
                >
                  <span className="tip-under">Troops</span>
                </ReqTip>
              </th>
              <th className="num">
                <ReqTip
                  down
                  heading="Population — the victory fuel"
                  body="Civilians + regular troops (mercenaries never count). Ranking score also weighs walls, buildings, treasury, experience, and 7 of the 10 research fields — and the victory clocks only tick with enough REGULARS in the field (mercenaries and engineers do not count)."
                >
                  <span className="tip-under">Population</span>
                </ReqTip>
              </th>
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
              const hits = raidHistory.get(p.id) ?? [];
              const raided = hits.length;
              const raiders = new Set(hits.map((h) => h.attackerId)).size;
              const hint = shielded
                ? "🛡 Under the newcomer shield — no attacks or spying."
                : refused
                  ? "Far stronger than you — the army may refuse to march."
                  : p.onVacation
                    ? "🏖 On vacation — only revenge may touch them."
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
                          {p.onVacation && " · 🏖"}
                          {shielded && " · 🛡"}
                        </div>
                        <div style={{ fontSize: 13 }}>
                          <Link href={`/empire/${p.id}`} style={{ color: raided > 0 ? "var(--warn)" : "var(--ink-soft)" }}>
                            ⚔ {raided === 0
                              ? `no attacks in ${ATTACK_HISTORY_HOURS}h`
                              : `attacked ${raided}× by ${raiders} in ${ATTACK_HISTORY_HOURS}h`}
                          </Link>
                        </div>
                      </span>
                    </span>
                  </td>
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
                        pathfinding={researchLevel(me, "pathfinding")}
                        state={{ shielded, onVacation: p.onVacation, revengeOpen }}
                        last={{
                          scoutOp: me.lastScoutOp,
                          scoutAgents: me.lastScoutAgents,
                          spyOp: me.lastSpyOp,
                          spyAgents: me.lastSpyAgents,
                        }}
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
          Exact counts are for spies. Use <b>⚔ Attack</b>, <b>🏹 Scout</b> or <b>🗡 Spy</b> on any
          empire — or open their profile for the full War Council. 🏖 on vacation · 🛡 newcomer
          shield · 🔥 your clan is at war. The ⚔ line under each empire is their public war record —
          click it to see who has been striking them over the last {ATTACK_HISTORY_HOURS} hours.
        </p>
        {leader && (
          <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginTop: 6 }}>
            <span style={{ color: "var(--coin)" }}>👑</span> The crown is public:{" "}
            <b>{leader.p.name}</b> holds #1 — {(cum / MS_PER_HOUR).toFixed(1)}h of the{" "}
            {HOLD_CLOCKS.CUMULATIVE_HOURS}h cumulative, {(streak / MS_PER_HOUR).toFixed(1)}h of the{" "}
            {HOLD_CLOCKS.STREAK_HOURS}h streak
            {regularTroops(leader.p) < ARMY_FLOORS.INDIVIDUAL
              ? ` (below the ${ARMY_FLOORS.INDIVIDUAL.toLocaleString("en-US")} regular floor — clocks frozen)`
              : ""}
            .
          </p>
        )}
      </Panel>
    </>
  );
}
