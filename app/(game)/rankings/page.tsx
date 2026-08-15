import Link from "next/link";
import { Flash } from "@/components/Flash";
import { Ladder, type LadderRow } from "@/components/Ladder";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { ARMY_FLOORS, ATTACK_HISTORY_HOURS, ATTACK_REFUSAL_RATIO, HOLD_CLOCKS, RACE_NAMES } from "@/lib/constants";
import {
  level,
  rankingScore,
  researchLevel,
  settlementTitle,
  regularTroops,
  totalPopulation,
  troopStrengthLabel,
} from "@/lib/engine";
import { getGame } from "@/lib/server/session";
import { MS_PER_HOUR, REVENGE_WINDOW_TICKS, overlordHold } from "@/lib/server/world";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function RankingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    err?: string;
    ok?: string;
    /** Which arm the sidebar sent you here for. The ladder is one page reached
     *  three ways — arriving for "Spy" should not put Attack and Scout under
     *  your cursor on all forty rows. */
    act?: string;
  }>;
}) {
  const { q, page, err, ok, act } = await searchParams;
  const arm = act === "attack" || act === "scout" || act === "spy" ? act : undefined;
  const ARM_HEAD = {
    attack: "The Ladder — pick a target and march",
    scout: "The Ladder — pick a target and send rangers",
    spy: "The Ladder — pick a target and send shadows",
  } as const;
  const { world, player: me } = await getGame();
  const tick = world.meta.tickNumber;

  const ladder = Object.values(world.players)
    .map((p) => ({ p, score: rankingScore(p) }))
    .sort((a, b) => b.score - a.score);

  // My war context: whom I may revenge (personal window, or a clan-bombardment
  // window my banner still holds). The covert consoles gate on the Shadow Guild
  // and the Ranger's Lodge now, not on research — see COVERT_OPS.
  const myScore = Math.max(1, rankingScore(me));
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
  // Allied banners. Read from BOTH sides so a half-written pact counts as none
  // (see areAllied) — the strike console must never promise a treachery warning
  // it cannot deliver, nor withhold one it should.
  const alliedClanIds = new Set(
    (myClan?.friendly ?? []).filter((id) => (world.clans[id]?.friendly ?? []).includes(myClan!.id)),
  );
  // Every empire, flattened to plain data the browser can filter on a keystroke.
  // The search is live, so the whole ladder has to be here — but rendered from
  // data, not markup, so only the visible page ever reaches the DOM.
  const rows: LadderRow[] = ladder.map(({ p }, i) => {
    const clan = p.clanId ? world.clans[p.clanId] : undefined;
    const isMe = p.id === me.id;
    const shielded = p.shieldUntilTick > tick;
    const revengeOpen = personalRevenge.has(p.id) || clanRevenge.has(p.id);
    const atWar = p.clanId ? warClanIds.has(p.clanId) : false;
    // Your own banner is not a target. The pipeline refuses attacks AND covert
    // work against a clanmate, so the row must not offer orders the strike
    // would bounce.
    const sameClan = Boolean(me.clanId && p.clanId === me.clanId) && !isMe;
    const allied = Boolean(p.clanId && alliedClanIds.has(p.clanId));
    // The engine's own refusal line, not a copy of it — see ATTACK_REFUSAL_RATIO.
    const refused = rankingScore(p) / myScore >= ATTACK_REFUSAL_RATIO;
    const title = settlementTitle(p);
    const hint = allied
      ? `🤝 Allied with your banner — striking them breaks the alliance and is recorded as treachery.`
      : sameClan
      ? "🤝 Your own banner — clanmates cannot be attacked, scouted or spied on."
      : shielded
      ? "🛡 Shielded — no attacks or spying."
      : refused
        ? "Far stronger than you — the army may refuse to march."
        : p.onVacation
          ? "🏖 On vacation — nothing reaches them, revenge included."
          : undefined;
    return {
      id: p.id,
      name: p.name,
      race: p.race,
      raceName: RACE_NAMES[p.race],
      rank: i + 1,
      clanId: clan?.id,
      clanName: clan?.name,
      troops: troopStrengthLabel(p),
      population: totalPopulation(p),
      isMe,
      onVacation: p.onVacation,
      shielded,
      revengeOpen,
      atWar,
      allied,
      allyClanName: allied ? clan?.name : undefined,
      state: { shielded, onVacation: p.onVacation, revengeOpen, sameClan, isSelf: isMe, allied },
      hint,
      hay: [p.name, RACE_NAMES[p.race], title, clan?.name ?? "", `#${i + 1}`]
        .join(" ")
        .toLowerCase(),
    };
  });

  // Arriving to ACT opens at YOUR page — the neighbours you can actually reach.
  //
  // Browsing the ladder and picking a fight are different errands. From the top
  // you read the age's standings; to pick a fight you want the empires near
  // your own weight, and the crown at #1 is the one target the army will
  // refuse. Only the DEFAULT moves: page= still wins.
  const myRow = rows.findIndex((r) => r.isMe);
  const myPage = myRow >= 0 ? Math.floor(myRow / PAGE_SIZE) + 1 : 1;
  const openAt = Number(page) || (arm ? myPage : 1);

  const leader = ladder[0];
  const oh = overlordHold(world);
  const cum = leader && leader.p.id === oh.holderId ? oh.cumMs : leader ? (world.meta.overlordClocksMs?.[leader.p.id] ?? 0) : 0;
  const streak = leader && leader.p.id === oh.holderId ? oh.streakMs : 0;

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#winning">How the ladder wins you the era</LearnLink>
      <nav className="rank-tabs" aria-label="Rankings">
        <Link href="/rankings" aria-current="page">Empire Ranks</Link>
        <Link href="/rankings/clans">Clan Ranks</Link>
      </nav>
      <Panel title={arm ? ARM_HEAD[arm] : "The Ladder — the world itself, and your war console"}>
        {arm && (
          <p style={{ fontSize: 13, marginBottom: 6 }}>
            Showing the <b>{arm === "attack" ? "march" : arm === "scout" ? "ranger" : "shadow"}</b>{" "}
            order only
            {myRow >= 0 && !page && !q && (
              <>
                , opened at <b>your own rank (#{myRow + 1})</b> so you can see who is near your
                weight
              </>
            )}
            . <Link href={`/rankings${q ? `?q=${encodeURIComponent(q)}` : ""}`}>The full ladder from the top →</Link>
          </p>
        )}
        <Ladder
          rows={rows}
          initialQuery={q ?? ""}
          initialPage={openAt}
          pageSize={PAGE_SIZE}
          arm={arm}
          guild={level(me, "shadow_guild")}
          lodge={level(me, "rangers_lodge")}
          last={{
            scoutOp: me.lastScoutOp,
            scoutAgents: me.lastScoutAgents,
            spyOp: me.lastSpyOp,
            spyAgents: me.lastSpyAgents,
          }}
        />
        <p style={{ fontSize: 13, color: "var(--ink-soft)", marginTop: 6 }}>
          Troops read as a traveler would guess them — None · Weak · Moderate · Strong · Heavy.
          Exact counts are for spies. Use <b>⚔ Attack</b>, <b>🏹 Scout</b> or <b>🗡 Spy</b> on any
          empire — or open their profile for the full War Council, which also carries their public
          war record for the last {ATTACK_HISTORY_HOURS} hours.{" "}
          <b className="rank-flag-away">🏖 green rows are on vacation</b> — nothing reaches them at
          all: no attack, no revenge, no ranger, no spy. 🛡 shielded (newcomer, or just home from a
          long absence) — likewise untouchable. 🔥 your clan is at war.
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
