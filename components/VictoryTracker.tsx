import Link from "next/link";
import { Info } from "./Info";
import { ARMY_FLOORS, HOLD_CLOCKS } from "@/lib/constants";
import { rankingScore, regularTroops, type Player } from "@/lib/engine";
import type { World } from "@/lib/server/store";
import { MS_PER_HOUR, clanHold, clanScore, overlordHold } from "@/lib/server/world";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/** A labelled progress bar toward a victory clock (hours held at #1). §14.3: the
 *  held time is exact milliseconds, so it advances between ticks. */
function Clock({ heldMs, targetHours }: { heldMs: number; targetHours: number }) {
  const heldHours = heldMs / MS_PER_HOUR;
  const pct = Math.max(0, Math.min(100, (heldHours / targetHours) * 100));
  const done = pct >= 100;
  return (
    <span className="vt-clock" title={`${heldHours.toFixed(1)}h of ${targetHours}h`}>
      <span className="vt-track">
        <i style={{ width: `${pct}%`, background: done ? "var(--gold)" : undefined }} />
      </span>
      <small>
        {heldHours.toFixed(1)} / {targetHours}h
      </small>
    </span>
  );
}

/**
 * The Race to the Throne — surfaces the two victory paths and how close the
 * world is to an era win. Shows the reigning #1's two hold-clocks + pop floor,
 * and the viewing player's own standing (rank, gap to the crown). Reused on the
 * Command View and the Rankings ladder. Spec: victory.md.
 */
export function VictoryTracker({ world, me }: { world: World; me: Player }) {
  if (world.meta.winner) return null;

  const ladder = Object.values(world.players)
    .map((p) => ({ p, score: rankingScore(p) }))
    .sort((a, b) => b.score - a.score);
  const leader = ladder[0];
  if (!leader) return null;

  const myRank = ladder.findIndex((l) => l.p.id === me.id) + 1;
  const myScore = rankingScore(me);
  const gap = leader.score - myScore;
  const iAmLeader = leader.p.id === me.id;

  const oh = overlordHold(world);
  const cum = leader.p.id === oh.holderId ? oh.cumMs : (world.meta.overlordClocksMs?.[leader.p.id] ?? 0);
  const streak = leader.p.id === oh.holderId ? oh.streakMs : 0;
  // The solo crown asks for a real army AND clean hands: never clanned this age.
  const leaderRegulars = regularTroops(leader.p);
  const leaderClanFree = !leader.p.everJoinedClan && !leader.p.clanId;
  const leaderMeetsFloor = leaderRegulars >= ARMY_FLOORS.INDIVIDUAL && leaderClanFree;

  // Clan race (only if there are clans in the world).
  const clans = Object.values(world.clans)
    .map((c) => ({ c, score: clanScore(world, c) }))
    .sort((a, b) => b.score - a.score);
  const topClan = clans[0];
  const ch = clanHold(world);
  const clanCum = topClan ? (topClan.c.id === ch.holderId ? ch.cumMs : (world.meta.clanClocksMs?.[topClan.c.id] ?? 0)) : 0;
  const clanStreak = topClan && topClan.c.id === ch.holderId ? ch.streakMs : 0;
  const clanPop = topClan
    ? topClan.c.members.reduce(
        (s, id) => s + (world.players[id] ? regularTroops(world.players[id]) : 0),
        0,
      )
    : 0;
  const myClan = me.clanId ? world.clans[me.clanId] : undefined;

  return (
    <section className="panel vt">
      <h3>
        👑 The Race to the Throne{" "}
        <Link href="/guide#winning" className="vt-learn">
          how to win →
        </Link>
      </h3>
      <div className="body">
        <div className="vt-grid">
          {/* Grand Overlord */}
          <div className="vt-card">
            <div className="vt-card-head">
              <span className="vt-badge">Solo</span> Grand Overlord{" "}
              <Info
                tip={`Hold #1 on the ladder for ${HOLD_CLOCKS.CUMULATIVE_HOURS}h total and ${HOLD_CLOCKS.STREAK_HOURS}h unbroken, with ${fmt(ARMY_FLOORS.INDIVIDUAL)}+ regulars and having NEVER joined a clan this age. An era ends the moment someone wins — the next era is named after them.`}
                guide="/guide#winning"
              />
            </div>
            <div className="vt-leader">
              👑 {leader.p.name}
              {iAmLeader && " (you!)"} reigns
              {!leaderMeetsFloor && <span className="vt-frozen"> — below the floor, clocks frozen</span>}
            </div>
            <dl className="vt-clocks">
              <dt>Total held</dt>
              <dd>
                <Clock heldMs={cum} targetHours={HOLD_CLOCKS.CUMULATIVE_HOURS} />
              </dd>
              <dt>Unbroken streak</dt>
              <dd>
                <Clock heldMs={streak} targetHours={HOLD_CLOCKS.STREAK_HOURS} />
              </dd>
            </dl>
          </div>

          {/* Clan Victory */}
          <div className="vt-card">
            <div className="vt-card-head">
              <span className="vt-badge">Clan</span> Clan Victory{" "}
              <Info
                tip={`Same clocks for the #1 clan (sum of member scores), with ${fmt(ARMY_FLOORS.CLAN)} regulars summed across its members.`}
                guide="/guide#winning"
              />
            </div>
            {topClan ? (
              <>
                <div className="vt-leader">
                  🛡 {topClan.c.name} leads — {fmt(clanPop)} / {fmt(ARMY_FLOORS.CLAN)} regulars
                  {myClan?.id === topClan.c.id && " (yours!)"}
                </div>
                <dl className="vt-clocks">
                  <dt>Total held</dt>
                  <dd>
                    <Clock heldMs={clanCum} targetHours={HOLD_CLOCKS.CUMULATIVE_HOURS} />
                  </dd>
                  <dt>Unbroken streak</dt>
                  <dd>
                    <Clock heldMs={clanStreak} targetHours={HOLD_CLOCKS.STREAK_HOURS} />
                  </dd>
                </dl>
              </>
            ) : (
              <p className="vt-rule" style={{ fontStyle: "italic" }}>
                No clan has risen yet. <Link href="/clan">Found one →</Link>
              </p>
            )}
          </div>
        </div>

        <div className="vt-you">
          {iAmLeader ? (
            <>
              🏆 <b>You wear the crown</b> — now defend it. Rivals will bombard, revenge, and scatter
              your people to break your {HOLD_CLOCKS.STREAK_HOURS}h streak.
            </>
          ) : (
            <>
              You stand <b>#{myRank || "—"}</b> · <b>{fmt(myScore)}</b> pts · <b>{fmt(gap)}</b>{" "}
              behind the crown{" "}
              <Info tip="Your score is your visible empire: population, troops, walls, buildings, treasury, and 7 of the 10 research fields. Grow them to climb." />{" "}
              <Link href="/rankings">Full ladder →</Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
