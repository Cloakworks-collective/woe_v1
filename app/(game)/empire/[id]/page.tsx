import Link from "next/link";
import { notFound } from "next/navigation";
import { Art } from "@/components/Art";
import { Panel } from "@/components/Panel";
import { PublicBattleTable } from "@/components/PublicBattleTable";
import { RACE_NAMES } from "@/lib/constants";
import { publicBattle, rankingScore, settlementTitle } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

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

  const mine = world.battles
    .filter((b) => b.attackerId === id || b.defenderId === id)
    .map(publicBattle);
  const totals = { troopsLost: 0, troopsKilled: 0, gearLost: 0, wallTaken: 0, wallDealt: 0 };
  for (const b of mine) {
    const asAttacker = b.attackerId === id;
    totals.troopsLost += asAttacker ? b.attackerTroopsLost : b.defenderTroopsLost;
    totals.troopsKilled += asAttacker ? b.defenderTroopsLost : b.attackerTroopsLost;
    totals.gearLost += asAttacker ? b.attackerGearLost : 0;
    totals.wallTaken += asAttacker ? 0 : b.wallDamage;
    totals.wallDealt += asAttacker ? b.wallDamage : 0;
  }

  return (
    <>
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
            <dt>Battles won / lost</dt>
            <dd>{p.battlesWon} / {p.battlesLost}</dd>
            <dt>Standing</dt>
            <dd>
              {p.surrendered ? "🏳 surrendered" : p.shieldUntilTick > tick ? "🛡 newcomer shield" : "at large"}
              {p.id === me.id && " (this is you)"}
            </dd>
          </dl>
        </div>
        {p.id !== me.id && (
          <p style={{ fontSize: 12.5, marginTop: 6 }}>
            <Link href="/attack">→ the war room</Link> · <Link href="/spy">→ send spies</Link>{" "}
            <span style={{ color: "var(--ink-soft)" }}>
              (what you see here is what the heralds tell everyone — composition costs spies)
            </span>
          </p>
        )}
      </Panel>

      <Panel title={`The reckoning — across ${mine.length} recorded battles`}>
        <table className="tbl">
          <thead>
            <tr>
              <th className="num">Troops lost</th>
              <th className="num">Troops slain</th>
              <th className="num">Siege gear lost</th>
              <th className="num">Wall damage taken</th>
              <th className="num">Wall damage dealt</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="num">{fmt(totals.troopsLost)}</td>
              <td className="num">{fmt(totals.troopsKilled)}</td>
              <td className="num">{fmt(totals.gearLost)}</td>
              <td className="num">−{Math.round(totals.wallTaken * 100)}%</td>
              <td className="num">−{Math.round(totals.wallDealt * 100)}%</td>
            </tr>
          </tbody>
        </table>
      </Panel>

      <Panel title="Recent battles">
        <PublicBattleTable battles={mine.slice(0, 25)} highlightId={p.id} />
        <p style={{ fontSize: 12.5, marginTop: 6 }}>
          <Link href="/battles">→ the World News feed</Link>
        </p>
      </Panel>
    </>
  );
}
