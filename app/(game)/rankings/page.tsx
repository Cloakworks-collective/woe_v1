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
import { ARMY_FLOORS, ATTACK_HISTORY_HOURS, HOLD_CLOCKS, RACE_NAMES } from "@/lib/constants";
import {
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
  searchParams: Promise<{
    q?: string;
    page?: string;
    err?: string;
    ok?: string;
    report?: string;
    /** Which arm the sidebar sent you here for. The ladder is one page reached
     *  three ways — arriving for "Spy" should not put Attack and Scout under
     *  your cursor on all forty rows. */
    act?: string;
  }>;
}) {
  const { q, page, err, ok, report: reportId, act } = await searchParams;
  const arm = act === "attack" || act === "scout" || act === "spy" ? act : undefined;
  const ARM_HEAD = {
    attack: "The Ladder — pick a target and march",
    scout: "The Ladder — pick a target and send rangers",
    spy: "The Ladder — pick a target and send shadows",
  } as const;
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

  // Arriving to ACT opens at YOUR page — the neighbours you can actually reach.
  //
  // Browsing the ladder and picking a fight are different errands. From the top
  // you read the age's standings; to pick a fight you want the empires near
  // your own weight, and the crown at #1 is the one target the army will
  // refuse. Only the DEFAULT moves: page= still wins, so the pager and every
  // link keep working from wherever you land.
  const myRow = filtered.findIndex(({ p }) => p.id === me.id);
  const myPage = myRow >= 0 ? Math.floor(myRow / PAGE_SIZE) + 1 : 1;
  const paged = paginate(filtered, page ?? (arm ? myPage : 1), PAGE_SIZE);
  const pageHref = (n: number) =>
    `/rankings?${q ? `q=${encodeURIComponent(q)}&` : ""}${arm ? `act=${arm}&` : ""}page=${n}`;

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
      <Panel title={arm ? ARM_HEAD[arm] : "The Ladder — the world itself, and your war console"}>
        {arm && (
          <p style={{ fontSize: 13, marginBottom: 6 }}>
            Showing the <b>{arm === "attack" ? "march" : arm === "scout" ? "ranger" : "shadow"}</b>{" "}
            order only
            {myRow >= 0 && !page && paged.pageNo === myPage && (
              <>
                , opened at <b>your own rank (#{myRow + 1})</b> so you can see who is near your
                weight
              </>
            )}
            . <Link href={`/rankings${q ? `?q=${encodeURIComponent(q)}` : ""}`}>The full ladder from the top →</Link>
          </p>
        )}
        <form style={{ marginBottom: 8, display: "flex", gap: 6 }}>
          {arm && <input type="hidden" name="act" value={arm} />}
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
                        {/* Only the flags that change what you can DO to this
                            empire. The settlement title was a restatement of
                            the population column, and the race is the avatar
                            sitting immediately to the left of it. */}
                        {(revengeOpen || atWar || p.onVacation || shielded) && (
                          <div style={{ fontSize: 13, color: "var(--ink-soft)" }}>
                            {revengeOpen && <span style={{ color: "var(--warn)", fontWeight: 700 }}>⚔ revenge open</span>}
                            {atWar && <span style={{ color: "var(--warn)" }}>{revengeOpen ? " · " : ""}🔥 at war</span>}
                            {p.onVacation && <span>{revengeOpen || atWar ? " · " : ""}🏖 on vacation</span>}
                            {shielded && <span>{revengeOpen || atWar || p.onVacation ? " · " : ""}🛡 shielded</span>}
                          </div>
                        )}
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
                        only={arm}
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
          empire — or open their profile for the full War Council, which also carries their public
          war record for the last {ATTACK_HISTORY_HOURS} hours. 🏖 on vacation · 🛡 newcomer shield ·
          🔥 your clan is at war.
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
