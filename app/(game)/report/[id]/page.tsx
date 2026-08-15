import Link from "next/link";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { timeAgo } from "@/components/timeAgo";
import { COVERT_LOG_DAYS } from "@/lib/constants";
import { covertHistory } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * ONE covert report, on its own page.
 *
 * There is deliberately no index of these. The chronicle already is the list —
 * every operation you ran filed a tiding there, in order, paginated — so a
 * second scrollable list of the same events was one list too many, and the
 * question a player actually arrives with is never "show me all my reports"
 * but "what did THAT one say". So the tiding links straight here, and here is
 * the whole finding rather than a row you then have to find.
 */
export default async function CovertReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { world, player: p } = await getGame();
  const tick = world.meta.tickNumber;
  const r = covertHistory(p, tick).find((x) => x.id === id);

  // Reports age out after COVERT_LOG_DAYS while the tiding that linked to one
  // lives on in the chronicle forever, so this is a NORMAL outcome and not an
  // error. Say which it is rather than showing a bare 404.
  if (!r) {
    return (
      <>
        <LearnLink href="/guide#shadows">Spies, scouts &amp; the shadow war</LearnLink>
        <Panel title="🗂 No such report">
          <p className="rep-gone">
            This report is no longer on file. Findings are kept for{" "}
            <b>{COVERT_LOG_DAYS} days</b> and this one has aged out — the tiding that linked to it
            outlives the report itself.
          </p>
          <p style={{ fontSize: 13.5, margin: 0 }}>
            <Link href="/chronicle">← back to the chronicle</Link>
          </p>
        </Panel>
      </>
    );
  }

  const returned = r.sent - r.intercepted;

  return (
    <>
      <LearnLink href="/guide#shadows">Spies, scouts &amp; the shadow war</LearnLink>
      <Panel
        title={`${r.arm === "spy" ? "🗡" : "👁"} ${r.opName} — ${r.targetName}`}
        info={`Filed exactly as your agents reported it. A scout report is a snapshot of what was true when they looked, not what is true now, so an old report is history rather than intelligence. Kept for ${COVERT_LOG_DAYS} days.`}
        guide="/guide#shadows"
      >
        <dl className="kv rep-head">
          <dt>When</dt>
          <dd>
            {timeAgo({ tick: r.tick }, world.meta)}{" "}
            <span style={{ color: "var(--ink-soft)" }}>· turn {r.tick.toLocaleString("en-US")}</span>
          </dd>
          <dt>Target</dt>
          <dd>
            <Link href={`/empire/${r.targetId}`}>{r.targetName}</Link>
          </dd>
          <dt>Agents</dt>
          <dd>
            {r.sent.toLocaleString("en-US")} sent ·{" "}
            {r.intercepted > 0 ? (
              <b style={{ color: "var(--warn)" }}>{r.intercepted.toLocaleString("en-US")} taken</b>
            ) : (
              "none lost"
            )}{" "}
            · {returned.toLocaleString("en-US")} came home
          </dd>
          <dt>Cost</dt>
          <dd>{r.turnsSpent.toLocaleString("en-US")} spy turns</dd>
          {(r.resourcesDestroyed ?? 0) > 0 && (
            <>
              <dt>Destroyed</dt>
              <dd>{(r.resourcesDestroyed ?? 0).toLocaleString("en-US")} of goods</dd>
            </>
          )}
          {(r.gearDestroyed ?? 0) > 0 && (
            <>
              <dt>Engines wrecked</dt>
              <dd>{r.gearDestroyed}</dd>
            </>
          )}
        </dl>

        {r.exposed && (
          <p className="rep-exposed-note">
            🗡 <b>You were named.</b> Rangers took {r.intercepted} of your agents, so{" "}
            {r.targetName} knows the hand behind it — and their revenge window opened.
          </p>
        )}

        <h4 className="rep-h">The finding</h4>
        {/* Figures in COLUMNS when the operation returned figures; prose for the
            ops whose result genuinely is a sentence ("Fires set — burned 4,000
            wood"), and as the fallback for reports filed before the structured
            form existed. */}
        {r.facts && r.facts.length > 0 ? (
          <table className="tbl rep-full-facts">
            <tbody>
              {r.facts.map((f, i) => (
                <tr key={`${f.label}-${i}`}>
                  <th scope="row">{f.label}</th>
                  <td className="num">{f.value}</td>
                  <td className="rep-fact-note">{f.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="rep-prose">{r.detail}</p>
        )}

        <p className="rep-back">
          <Link href="/chronicle">← back to the chronicle</Link>
          {" · "}
          <Link href={`/empire/${r.targetId}`}>{r.targetName}&rsquo;s dossier</Link>
        </p>
      </Panel>
    </>
  );
}
