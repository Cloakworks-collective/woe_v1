import Link from "next/link";
import { EraRecordsView } from "@/components/EraRecords";
import { Panel } from "@/components/Panel";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function EraRecordsPage() {
  const { world } = await getGame();

  return (
    <>
      <p style={{ margin: "0 0 8px", fontSize: 12.5 }}>
        <Link href="/annals">← The Annals</Link>
      </p>

      <Panel title={`⚔ War Records — ${world.meta.eraName}`}>
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 8 }}>
          The great deeds of arms this age, tallied as they happen — the richest attacks and raids,
          the bloodiest clashes, the bitterest feuds and the mightiest wars between banners. When the
          age is sealed these join the <Link href="/annals">history books</Link>, just as the elder
          ages before it.
        </p>
        <EraRecordsView records={world.eraRecords} />
      </Panel>
    </>
  );
}
