import Link from "next/link";
import { Info } from "./Info";
import { ARMY_FLOORS, HOLD_CLOCKS, WONDER_MAX_LEVEL } from "@/lib/constants";
import { RESEARCH_FIELDS } from "@/lib/constants/research";
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

  // ── Is the race live at all? ────────────────────────────────────────────
  // Neither crown can be won until somebody fields a real army, so early in an
  // age this whole panel is two zeroed clocks and a frozen banner — noise that
  // reads like something is broken. It opens the moment ANY empire reaches the
  // solo floor or ANY clan reaches the clan floor, and then stays open for the
  // rest of the age.
  //
  // "Stays open" is derived, not stored: the clocks only accrue while the
  // holder is above the floor, so a non-zero clock anywhere is proof the floor
  // was cleared at some point. That keeps the latch honest across a leader who
  // later falls below it, with no new field on the world.
  const soloFloorReached = ladder.some(({ p }) => regularTroops(p) >= ARMY_FLOORS.INDIVIDUAL);
  const clanFloorReached = clans.some(
    ({ c }) =>
      c.members.reduce((s, id) => s + (world.players[id] ? regularTroops(world.players[id]) : 0), 0) >=
      ARMY_FLOORS.CLAN,
  );
  const clocksEverRan =
    Object.values(world.meta.overlordClocksMs ?? {}).some((ms) => ms > 0) ||
    Object.values(world.meta.clanClocksMs ?? {}).some((ms) => ms > 0);
  const raceOpen = soloFloorReached || clanFloorReached || clocksEverRan;

  // Say it is hidden rather than hiding it. A section that silently vanishes
  // teaches nobody the rule; a dormant one teaches it and sets the target.
  if (!raceOpen) {
    const myRegulars = regularTroops(me);
    return (
      <section className="panel vt vt-dormant">
        <h3>
          👑 The Race to the Throne{" "}
          <Link href="/guide#winning" className="vt-learn">
            how to win →
          </Link>
        </h3>
        <div className="body">
          <p className="vt-rule">
            <b>Not yet contested.</b> No empire or clan has raised an army big enough for a crown to
            be in play, so the clocks are hidden until one does — then this panel stays for the rest
            of the age.{" "}
            <Info
              title="What opens the race"
              tip="Either gate opens it, for everyone — you do not have to be the one who does it."
              bullets={[
                `A lone empire fielding ${fmt(ARMY_FLOORS.INDIVIDUAL)}+ regulars — you have ${fmt(myRegulars)}`,
                `Any clan fielding ${fmt(ARMY_FLOORS.CLAN)}+ regulars summed across its members`,
                "Regulars only — mercenaries never count toward a floor",
              ]}
              guide="/guide#winning"
            />
          </p>
        </div>
      </section>
    );
  }

  // What the reigning empire still lacks, in the order it has to fix them.
  // Only unmet gates are listed: a popover that recites conditions already
  // satisfied buries the one line that matters.
  const soloMissing: string[] = [];
  if (leaderRegulars < ARMY_FLOORS.INDIVIDUAL) {
    soloMissing.push(
      `Regulars ${fmt(leaderRegulars)} / ${fmt(ARMY_FLOORS.INDIVIDUAL)} — ${fmt(ARMY_FLOORS.INDIVIDUAL - leaderRegulars)} short (mercenaries do not count)`,
    );
  }
  if (!leaderClanFree) {
    soloMissing.push(
      "Joined a clan this age — the solo crown is closed for good, and no army fixes it",
    );
  }

  const clanRegularsShort = topClan ? Math.max(0, ARMY_FLOORS.CLAN - clanPop) : 0;
  const clanWonderLevel = topClan?.c.buildings.wonderLevel ?? 0;
  const clanMissing: string[] = [];
  if (topClan && clanRegularsShort > 0) {
    clanMissing.push(
      `Regulars ${fmt(clanPop)} / ${fmt(ARMY_FLOORS.CLAN)} summed — ${fmt(clanRegularsShort)} short`,
    );
  }
  if (topClan && clanWonderLevel < WONDER_MAX_LEVEL) {
    clanMissing.push(`Clan Wonder ${clanWonderLevel} / ${WONDER_MAX_LEVEL} — unfinished`);
  }

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
                title={soloMissing.length > 0 ? "Clocks frozen — what is missing" : undefined}
                tip={
                  soloMissing.length > 0
                    ? `${leader.p.name}${iAmLeader ? " (you)" : ""} holds #1, but the clocks only tick while every gate below is met. They resume the moment it is fixed — nothing already banked is lost.`
                    : `Hold #1 on the ladder for ${HOLD_CLOCKS.CUMULATIVE_HOURS}h total and ${HOLD_CLOCKS.STREAK_HOURS}h unbroken, with ${fmt(ARMY_FLOORS.INDIVIDUAL)}+ regulars and having NEVER joined a clan this age. An era ends the moment someone wins — the next era is named after them.`
                }
                bullets={soloMissing.length > 0 ? soloMissing : undefined}
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
                title={clanMissing.length > 0 ? "Clocks frozen — what is missing" : undefined}
                tip={
                  clanMissing.length > 0
                    ? `${topClan?.c.name ?? "The leading clan"} leads the clan ladder, but its clocks only tick while both gates are met. The army proves the banner can fight; the Wonder proves it can build.`
                    : `Same clocks for the #1 clan (sum of member scores). Two gates: ${fmt(ARMY_FLOORS.CLAN)} regulars summed across its members, AND a completed Clan Wonder (level ${WONDER_MAX_LEVEL}). The army proves the banner can fight; the Wonder proves it can build.`
                }
                bullets={clanMissing.length > 0 ? clanMissing : undefined}
                guide="/guide#winning"
              />
            </div>
            {topClan ? (
              <>
                <div className="vt-leader">
                  🛡 {topClan.c.name} leads — {fmt(clanPop)} / {fmt(ARMY_FLOORS.CLAN)} regulars
                  {myClan?.id === topClan.c.id && " (yours!)"}
                  {/* Without this the clock just sits at zero and looks broken. */}
                  {(topClan.c.buildings.wonderLevel ?? 0) < WONDER_MAX_LEVEL && (
                    <div style={{ color: "var(--warn)", fontSize: 12.5 }}>
                      Wonder {topClan.c.buildings.wonderLevel ?? 0}/{WONDER_MAX_LEVEL} — the clan
                      clock cannot start until it is finished.
                    </div>
                  )}
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
              <Info tip={`Your score is your visible empire: population, troops, walls, buildings, treasury, and ${RESEARCH_FIELDS.filter((f) => f.ranked).length} of the ${RESEARCH_FIELDS.length} research fields. Grow them to climb.`} />{" "}
              <Link href="/rankings">Full ladder →</Link>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
