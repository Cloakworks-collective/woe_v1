import Link from "next/link";
import { redirect } from "next/navigation";
import { Btn } from "@/components/Btn";
import { ClanAlliances } from "@/components/ClanAlliances";
import { ClanBombardTargets } from "@/components/ClanBombardTargets";
import { ClanTabs } from "@/components/ClanTabs";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { ACTION_INFO, WAR } from "@/lib/constants";
import { canDeclareWar, clanBadges, getClanView } from "@/lib/server/clanView";

export const metadata = { title: "Clan war" };

export const dynamic = "force-dynamic";

// Both irreversible war actions live here — declaring (Leader/Vice only, and
// "a declared war can't be called off") and bombarding enemy works (any member).
// Keeping them on one deliberate page beats scattering them mid-scroll.
export default async function ClanWarPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, p, clan, tick } = await getClanView();
  if (!clan) redirect("/clan");

  const canDeclare = canDeclareWar(clan, p.id);
  const enemyClans = clan.wars
    .map((w) => world.clans[w.clanId])
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const otherClans = Object.values(world.clans).filter(
    (c) => c.id !== clan.id && !clan.wars.some((w) => w.clanId === c.id),
  );

  const pendingRev =
    clan.pendingRevenge && tick <= clan.pendingRevenge.expiresAtTick && clan.pendingRevenge.memberSnapshot.includes(p.id)
      ? clan.pendingRevenge
      : undefined;
  const revengeAgainst = pendingRev ? world.clans[pendingRev.againstClanId] : undefined;

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#clans">How clans work &amp; win together</LearnLink>
      <ClanTabs badges={clanBadges(world, clan, p, tick)} />

      {/* ── Who we stand WITH ─────────────────────────────────────────── */}
      <Panel
        title="Alliances — who we stand with"
        info="A promise, not a wall: allied members can still be attacked, but doing it breaks the pact on both sides and the treachery is recorded in the world chronicle. Leader or Vice only."
        guide="/guide#clans"
      >
        <ClanAlliances world={world} clan={clan} canLead={canDeclare} path="/clan/war" />
      </Panel>

      {/* ── Standing wars ─────────────────────────────────────────────── */}
      {enemyClans.length > 0 ? (
        <Panel title={`At war — ${enemyClans.length} banner${enemyClans.length === 1 ? "" : "s"}`}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Enemy</th>
                <th className="num">Net kills</th>
                <th>To win</th>
              </tr>
            </thead>
            <tbody>
              {clan.wars.map((w) => {
                const net = w.regularKills - w.regularLosses;
                return (
                  <tr key={w.clanId}>
                    <td>
                      <b>
                        <Link href={`/clan/${w.clanId}`}>{world.clans[w.clanId]?.name ?? "?"}</Link>
                      </b>
                    </td>
                    <td className="num" style={{ color: net >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 700 }}>
                      {net >= 0 ? "+" : ""}
                      {net}
                    </td>
                    <td style={{ color: "var(--ink-soft)" }}>
                      net +{WAR.NET_REGULAR_KILLS_TO_WIN} regular kills
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      ) : (
        <Panel title="No wars">
          <p style={{ fontSize: 14.5 }}>
            {clan.name} fights no one. A clan war gives <b>both</b> sides +100% damage until one nets{" "}
            +{WAR.NET_REGULAR_KILLS_TO_WIN} regular kills — the loser pays tribute and has their victory
            clocks frozen.
          </p>
        </Panel>
      )}

      {pendingRev && (
        <Panel title="A revenge is owed to you">
          <p style={{ fontSize: 14.5 }}>
            ⚔ Your banner holds <b>one revenge strike</b> against{" "}
            {revengeAgainst?.name ?? "the aggressor"} for bombarding your works — claim it from the{" "}
            <Link href="/rankings">ladder</Link>. The first member to strike takes it.
          </p>
        </Panel>
      )}

      {/* ── War Front — bombard enemy works ───────────────────────────── */}
      {enemyClans.length > 0 && (
        <Panel title="War Front — break the enemy's works" info={ACTION_INFO.clanBombard} guide="/guide#clans">
          <p className="panel-lede">
            Any member may fire. A strike costs 10 action turns and crewed trebuchets (trebuchets with
            engineers to work them), and cracks the target toward its 50% floor. Each strike hands the enemy
            clan a single revenge — expect their strongest.
          </p>
          <ClanBombardTargets enemies={enemyClans} turnsAvailable={p.turnsAvailable} path="/clan/war" />
        </Panel>
      )}

      {/* ── Diplomacy ─────────────────────────────────────────────────── */}
      <Panel
        title="Diplomacy — declare war"
        info="Leaders and Vice-Leaders may open a war. Both clans deal +100% damage until one side nets +200 regular kills. A declared war can't be called off."
        guide="/guide#clans"
      >
        {!canDeclare ? (
          <p className="panel-lede">
            Only the <b>Leader</b> and <b>Vice-Leader</b> may open a war. Speak to them in the{" "}
            <Link href="/clan/chat">hall</Link> if you think a banner needs answering.
          </p>
        ) : otherClans.length === 0 ? (
          <p className="panel-lede">There is no other banner left to declare war on.</p>
        ) : (
          <CmdForm name="clanDeclareWar" path="/clan/war">
            <select name="clanId" aria-label="Clan to declare war on" style={{ font: "14.5px Verdana", padding: 3 }}>
              {otherClans.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.members.length} members, {c.warRecord.wins}W/{c.warRecord.losses}L)
                </option>
              ))}
            </select>
            <ReqTip
              heading="Declare war"
              body="Open a clan war on the chosen banner. Both clans deal +100% damage to each other until one side wins — first to net +200 kills over losses takes it, plus tribute and frozen victory clocks for the loser."
              note="Leaders and Vice only. A declared war can't be called off — fight it out."
            >
              <Btn className="btn" style={{ background: "linear-gradient(var(--warn),var(--warn))", borderColor: "#511207" }}>
                Declare War (+100% damage both ways)
              </Btn>
            </ReqTip>
          </CmdForm>
        )}
      </Panel>
    </>
  );
}
