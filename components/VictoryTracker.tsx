import Link from "next/link";
import { Info } from "./Info";
import { HOLD_CLOCKS, POPULATION_FLOORS, TICKS_PER_HOUR } from "@/lib/constants";
import { rankingScore, totalPopulation, type Player } from "@/lib/engine";
import type { World } from "@/lib/server/store";
import { clanScore } from "@/lib/server/world";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/** A labelled progress bar toward a victory clock (hours held at #1). */
function Clock({ heldTicks, targetHours }: { heldTicks: number; targetHours: number }) {
  const targetTicks = targetHours * TICKS_PER_HOUR;
  const pct = Math.max(0, Math.min(100, (heldTicks / targetTicks) * 100));
  const done = pct >= 100;
  return (
    <span className="vt-clock" title={`${(heldTicks / TICKS_PER_HOUR).toFixed(1)}h of ${targetHours}h`}>
      <span className="vt-track">
        <i style={{ width: `${pct}%`, background: done ? "var(--gold)" : undefined }} />
      </span>
      <small>
        {(heldTicks / TICKS_PER_HOUR).toFixed(1)} / {targetHours}h
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

  const cum = world.meta.overlordClocks[leader.p.id] ?? 0;
  const streak =
    world.meta.overlordStreak?.playerId === leader.p.id ? world.meta.overlordStreak.ticks : 0;
  const leaderPop = totalPopulation(leader.p);
  const leaderMeetsFloor = leaderPop >= POPULATION_FLOORS.GRAND_OVERLORD;

  // Clan race (only if there are clans in the world).
  const clans = Object.values(world.clans)
    .map((c) => ({ c, score: clanScore(world, c) }))
    .sort((a, b) => b.score - a.score);
  const topClan = clans[0];
  const clanCum = topClan ? (world.meta.clanClocks[topClan.c.id] ?? 0) : 0;
  const clanStreak =
    topClan && world.meta.clanStreak?.clanId === topClan.c.id ? world.meta.clanStreak.ticks : 0;
  const clanPop = topClan
    ? topClan.c.members.reduce(
        (s, id) => s + (world.players[id] ? totalPopulation(world.players[id]) : 0),
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
                tip={`Hold #1 on the ladder for ${HOLD_CLOCKS.CUMULATIVE_HOURS}h total and ${HOLD_CLOCKS.STREAK_HOURS}h unbroken, while above ${fmt(POPULATION_FLOORS.GRAND_OVERLORD)} population. An era ends the moment someone wins — the next era is named after them.`}
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
                <Clock heldTicks={cum} targetHours={HOLD_CLOCKS.CUMULATIVE_HOURS} />
              </dd>
              <dt>Unbroken streak</dt>
              <dd>
                <Clock heldTicks={streak} targetHours={HOLD_CLOCKS.STREAK_HOURS} />
              </dd>
            </dl>
          </div>

          {/* Clan Victory */}
          <div className="vt-card">
            <div className="vt-card-head">
              <span className="vt-badge">Clan</span> Clan Victory{" "}
              <Info
                tip={`Same clocks for the #1 clan (sum of member scores), above ${fmt(POPULATION_FLOORS.CLAN)} total clan population.`}
                guide="/guide#winning"
              />
            </div>
            {topClan ? (
              <>
                <div className="vt-leader">
                  🛡 {topClan.c.name} leads — {fmt(clanPop)} / {fmt(POPULATION_FLOORS.CLAN)} pop
                  {myClan?.id === topClan.c.id && " (yours!)"}
                </div>
                <dl className="vt-clocks">
                  <dt>Total held</dt>
                  <dd>
                    <Clock heldTicks={clanCum} targetHours={HOLD_CLOCKS.CUMULATIVE_HOURS} />
                  </dd>
                  <dt>Unbroken streak</dt>
                  <dd>
                    <Clock heldTicks={clanStreak} targetHours={HOLD_CLOCKS.STREAK_HOURS} />
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
