import Link from "next/link";
import { notFound } from "next/navigation";
import { Art } from "@/components/Art";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { PublicBattleTable } from "@/components/PublicBattleTable";
import { WarCouncil } from "@/components/WarCouncil";
import { RACE_NAMES, SCOUT_OPS } from "@/lib/constants";
import { level, publicBattle, rankingScore, regularTroops, scoutsNeeded, settlementTitle, troopTotal, veterancyBonus } from "@/lib/engine";
import { getGame } from "@/lib/server/session";
import { REVENGE_WINDOW_TICKS } from "@/lib/server/world";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

export default async function EmpireProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { world, player: me } = await getGame();
  const p = world.players[id];
  if (!p) notFound();

  const tick = world.meta.tickNumber;
  const rank =
    Object.values(world.players)
      .map((q) => rankingScore(q))
      .filter((s) => s > rankingScore(p)).length + 1;

  // Whether I may revenge this empire — a personal window, or a clan-bombard
  // window my banner still holds against their clan.
  const personalRevenge = me.recentAttackers.some(
    (a) => a.playerId === p.id && tick - a.tick <= REVENGE_WINDOW_TICKS && !me.revengeUsed.includes(p.id),
  );
  const myClan = me.clanId ? world.clans[me.clanId] : undefined;
  const rev = myClan?.pendingRevenge;
  const clanRevenge =
    !!rev &&
    tick <= rev.expiresAtTick &&
    rev.memberSnapshot.includes(me.id) &&
    p.clanId === rev.againstClanId;
  const revengeOpen = personalRevenge || clanRevenge;

  const mine = world.battles
    .filter((b) => b.attackerId === id || b.defenderId === id)
    .map(publicBattle);

  return (
    <>
      <LearnLink href="/guide#battle">Attacking, raiding &amp; revenge</LearnLink>
      <Panel title={`The ${settlementTitle(p)} of ${p.name} — ${RACE_NAMES[p.race]}`}>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{ border: "1px solid var(--border-light)", background: "var(--panel-alt)", padding: 2, alignSelf: "flex-start" }}>
            <Art path={`races/${p.race}`} size={120} title={RACE_NAMES[p.race]} />
          </div>
          <dl className="kv" style={{ flex: 1 }}>
            <dt>Ranking</dt>
            <dd>#{rank} — {fmt(rankingScore(p))} points</dd>
            <dt>Clan</dt>
            <dd>{p.clanId ? (world.clans[p.clanId]?.name ?? "—") : "—"}</dd>
            <dt>Battles</dt>
            <dd>
              <span style={{ color: "var(--pos)", fontWeight: 700 }}>{p.battlesWon} wins</span> ·{" "}
              <span style={{ color: "var(--neg)", fontWeight: 700 }}>{p.battlesLost} losses</span>
            </dd>
            <dt>Standing</dt>
            <dd>
              {p.onVacation ? "🏖 on vacation" : p.shieldUntilTick > tick ? "🛡 shielded" : "at large"}
              {p.id === me.id && " (this is you)"}
            </dd>
          </dl>
        </div>
        {p.id !== me.id && (
          <WarCouncil
            target={{ id: p.id, name: p.name }}
            revengeOpen={revengeOpen}
            guild={level(me, "shadow_guild")}
            lodge={level(me, "rangers_lodge")}
            turns={me.turnsAvailable}
            spyTurns={me.spyTurnsAvailable ?? 0}
            yours={{
              regulars: regularTroops(me),
              footmen: troopTotal(me.army.footmen),
              archers: troopTotal(me.army.archers),
              cavalry: troopTotal(me.army.cavalry),
              stamina: me.army.stamina,
              experience: veterancyBonus(me.army.experiencePoints) * 100,
            }}
            last={{
              scoutOp: me.lastScoutOp,
              scoutAgents: me.lastScoutAgents,
              spyOp: me.lastSpyOp,
              spyAgents: me.lastSpyAgents,
            }}
            scoutNeeds={Object.fromEntries(SCOUT_OPS.map((op) => [op.id, scoutsNeeded(op, p, me)]))}
            state={{
              shielded: p.shieldUntilTick > tick,
              onVacation: p.onVacation,
              revengeOpen,
              sameClan: Boolean(me.clanId && p.clanId === me.clanId && p.id !== me.id),
              isSelf: p.id === me.id,
            }}
          />
        )}
      </Panel>

      <Panel title="Recent battles">
        <PublicBattleTable battles={mine.slice(0, 25)} highlightId={p.id} nowTick={tick} />
        <p style={{ fontSize: 13.5, marginTop: 6 }}>
          <Link href="/battles">→ the World News feed</Link>
        </p>
      </Panel>
    </>
  );
}
