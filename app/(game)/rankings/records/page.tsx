import Link from "next/link";
import { EraTablesView } from "@/components/EraRecords";
import { Panel } from "@/components/Panel";
import { getGame } from "@/lib/server/session";
import { buildEraTables } from "@/lib/server/eraTables";

export const dynamic = "force-dynamic";

export default async function WarRecordsPage() {
  const { world } = await getGame();
  const tables = buildEraTables(world);

  return (
    <>
      <p style={{ margin: "0 0 8px", fontSize: 13.5 }}>
        <Link href="/rankings">← The Ladder</Link>
      </p>

      <Panel
        title={`🏆 Records of the Age — ${world.meta.eraName} (still being written)`}
        info="Every superlative of the age, tallied live: the greatest rulers and clans, the champion of each feat of arms and civil title, the mightiest of each race, and the richest, bloodiest and bitterest clashes. Sealed into the Annals when the age ends. The Clan column links to each clan's page; — means the ruler answers to no clan."
      >
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 8 }}>
          The great deeds and standings of the age, tallied as they happen — the greatest rulers and
          clans, the champions of each feat of arms, the lords &amp; ladies of every race, the civil
          titles, and the richest, bloodiest and bitterest clashes. When the age ends these are
          sealed into <Link href="/annals">the Annals</Link> for all time. The <b>Clan</b> column
          links to each clan&apos;s page; <b>—</b> marks a ruler of no clan.
        </p>
        <EraTablesView tables={tables} />
      </Panel>
    </>
  );
}
