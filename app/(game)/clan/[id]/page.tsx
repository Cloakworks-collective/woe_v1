// Public clan view — any banner on the ladder, inspectable by anyone.
// Members of the clan see exact troop counts; outsiders see ladder labels.

import Link from "next/link";
import { notFound } from "next/navigation";
import { Art } from "@/components/Art";
import { ClanMembers } from "@/components/ClanMembers";
import { Panel } from "@/components/Panel";
import { memberCap, wonderDiscount } from "@/lib/engine";
import { getGame } from "@/lib/server/session";
import { clanScore } from "@/lib/server/world";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

export default async function ClanViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { world, player: me } = await getGame();
  const clan = world.clans[id];
  if (!clan) notFound();

  const score = clanScore(world, clan);
  const rank =
    Object.values(world.clans)
      .map((c) => clanScore(world, c))
      .filter((s) => s > score).length + 1;

  return (
    <>
      <Panel title={`${clan.name} — #${rank} of the clans`}>
        <span className="guide-illo">
          <Art path="clan/crest" size={96} title={`${clan.name} crest`} />
        </span>
        <dl className="kv">
          <dt>Members</dt>
          <dd>
            {clan.members.length}/{memberCap(clan)}
          </dd>
          <dt>Clan Hall</dt>
          <dd>level {clan.buildings.hallLevel}</dd>
          <dt>Clan Storage</dt>
          <dd>level {clan.buildings.storageLevel}</dd>
          <dt>Clan Wonder</dt>
          <dd>
            level {clan.buildings.wonderLevel}
            {clan.buildings.wonderLevel > 0 && ` (−${Math.round(wonderDiscount(clan) * 100)}% war costs)`}
          </dd>
          <dt>War record</dt>
          <dd>
            <span style={{ color: "var(--pos)", fontWeight: 700 }}>{clan.warRecord.wins} wins</span> ·{" "}
            <span style={{ color: "var(--neg)", fontWeight: 700 }}>{clan.warRecord.losses} losses</span>
          </dd>
          <dt>Score</dt>
          <dd>{fmt(score)}</dd>
        </dl>
        {clan.wars.length > 0 && (
          <p style={{ fontSize: 14.5, marginTop: 6, color: "var(--warn)", fontWeight: 700 }}>
            ⚔ AT WAR with{" "}
            {clan.wars
              .map((w) => world.clans[w.clanId]?.name ?? "an unknown banner")
              .join(", ")}
          </p>
        )}
        {me.clanId === clan.id && (
          <p style={{ fontSize: 13.5, marginTop: 6 }}>
            This is your banner — <Link href="/clan">manage it in the Clan Hall</Link>.
          </p>
        )}
      </Panel>

      <Panel title={`Clan Members — ${clan.members.length}`}>
        <ClanMembers world={world} clan={clan} viewerId={me.id} />
      </Panel>
    </>
  );
}
