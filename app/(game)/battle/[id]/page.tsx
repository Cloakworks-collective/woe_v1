import Link from "next/link";
import { BattleReportPanel } from "@/components/BattleReportPanel";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { getGame } from "@/lib/server/session";
import { loadBattle } from "@/lib/server/store";

export const metadata = { title: "Battle report" };

export const dynamic = "force-dynamic";

/**
 * ONE battle report, on its own page.
 *
 * This used to be a panel bolted onto the top of the LADDER via
 * `/rankings?report=<id>` — so reading what happened in a fight meant loading
 * every empire in the age and scrolling past a scoreboard to reach it, and the
 * URL described a filtered ladder rather than the thing you came to read. A
 * report is its own document; it now has its own address.
 *
 * The world keeps a capped ring of recent battles, so an old id 404s here the
 * same way a covert report ages out — see the note below.
 */
export default async function BattleReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { world, player: p } = await getGame();
  // The doc carries only the metadata now; the log and the muster roll live in
  // a side store the report page alone pays for. loadBattle falls back to the
  // in-doc entry, so reports filed before the split still render whole.
  const report = await loadBattle(world, id);

  if (!report) {
    return (
      <>
        <LearnLink href="/guide#battle">How a battle resolves</LearnLink>
        <Panel title="⚔ No such battle">
          <p className="rep-gone">
            This report is no longer on file. The realm keeps only its most recent battles, and
            this one has fallen off the end — the tiding that linked to it outlives the report
            itself.
          </p>
          <p style={{ fontSize: 13.5, margin: 0 }}>
            <Link href="/chronicle">← back to the chronicle</Link>
          </p>
        </Panel>
      </>
    );
  }

  // Whose fight was this? A report reached from the world chronicle may be
  // somebody else's entirely, and the panel is written from the ATTACKER's
  // side — so say plainly which side you were on before it says "we".
  const mine =
    report.attackerName === p.name ? "attacker" : report.defenderName === p.name ? "defender" : null;

  return (
    <>
      <LearnLink href="/guide#battle">How a battle resolves</LearnLink>
      {mine === "defender" && (
        <p className="rep-side">
          You were the <b>defender</b> here — the account below is told from{" "}
          {report.attackerName}&rsquo;s side, so &ldquo;our&rdquo; means theirs.
        </p>
      )}
      {mine === null && (
        <p className="rep-side">
          Somebody else&rsquo;s war: {report.attackerName} against {report.defenderName}.
        </p>
      )}
      <BattleReportPanel report={report} />
      <p className="rep-back">
        <Link href="/chronicle">← back to the chronicle</Link>
        {" · "}
        <Link href={`/empire/${report.defenderId}`}>{report.defenderName}</Link>
      </p>
    </>
  );
}
