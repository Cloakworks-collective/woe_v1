import Link from "next/link";
import { EraRecordsView } from "@/components/EraRecords";
import { Panel } from "@/components/Panel";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function WarRecordsPage() {
  const { world } = await getGame();

  return (
    <>
      <p style={{ margin: "0 0 8px", fontSize: 13.5 }}>
        <Link href="/rankings">← The Ladder</Link>
      </p>

      <Panel title={`⚔ War Records — ${world.meta.eraName} (this age, still being written)`}>
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 8 }}>
          The great deeds of arms this age, tallied as they happen — the richest attacks and raids,
          the bloodiest clashes, the bitterest feuds and the mightiest wars between banners. When
          the age ends these are sealed into <Link href="/annals">the Annals</Link> for all time.
        </p>
        <EraRecordsView records={world.eraRecords} />
      </Panel>
    </>
  );
}
