import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Panel } from "@/components/Panel";
import { SPY_OPS, catchableOpLevel } from "@/lib/constants";
import { level, researchLevel } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export default async function SpyPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string }>;
}) {
  const { err, ok } = await searchParams;
  const { world, player: p } = await getGame();
  const tradecraft = researchLevel(p, "tradecraft");
  const lodge = level(p, "rangers_lodge");
  const targets = Object.values(world.players).filter((t) => t.id !== p.id);
  const intel = (world.inbox[p.id] ?? []).filter(
    (i) => i.event.type === "spyReport" || i.event.type === "scoutReport",
  );

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#shadows">Spies, scouts &amp; the shadow war</LearnLink>
      <div className="panel-row">
        <Panel
          title={`The Shadow Guild — ${p.army.spies} spies · Tradecraft ${tradecraft}`}
          info="More spies = more damage, more noise. Caught spies are executed — real population, gone — and the victim learns your name. Uncaught missions are anonymous."
          guide="/guide#spies"
        >
          <span className="guide-illo">
            <Art path="units/spy" size={72} title="Spy" />
          </span>
          <CmdForm name="spy" path="/spy" inline={false}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
              <select name="targetId" aria-label="Spy mission target" style={{ font: "13.5px Verdana", maxWidth: 160 }}>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <select name="op" aria-label="Operation" style={{ font: "13.5px Verdana", maxWidth: 200 }}>
                {SPY_OPS.map((op) => (
                  <option key={op.id} value={op.id} disabled={tradecraft < op.level}>
                    L{op.level} · {op.name}
                    {tradecraft < op.level ? " (locked)" : ""}
                  </option>
                ))}
              </select>
              <input name="spies" placeholder="# spies" aria-label="Spies to send" size={6} style={{ font: "13.5px Verdana", padding: 2 }} />
              <button className="btn">Send them in (5 turns)</button>
            </div>
          </CmdForm>
          <table className="tbl" style={{ marginTop: 6 }}>
            <tbody>
              {SPY_OPS.map((op) => (
                <tr key={op.id}>
                  <td style={{ width: 30 }} className="num">
                    L{op.level}
                  </td>
                  <td>
                    <b>{op.name}</b> — {op.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          title={`The Ranger's Lodge — ${p.army.scouts} scouts · Lodge ${lodge}`}
          info="Recon is cheap, safe, and fuzzy (±20%, sharpened by Pathfinding). Scouts kept home are your counter-espionage. Sophistication beats vigilance — a low lodge is simply blind to high ops."
          guide="/guide#spies"
        >
          <span className="guide-illo">
            <Art path="units/scout" size={72} title="Scout" />
          </span>
          <CmdForm name="scout" path="/spy">
            <select name="targetId" aria-label="Recon target" style={{ font: "13.5px Verdana", maxWidth: 160 }}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button className="btn">Ride out (2 turns)</button>
          </CmdForm>
          <p style={{ fontSize: 12.5, marginTop: 8 }}>
            🛡 Counter-espionage: catches spy ops up to <b>level {catchableOpLevel(lodge) || 0}</b>
          </p>
        </Panel>
      </div>

      <Panel title="Intelligence File">
        {intel.length === 0 ? (
          <p style={{ fontSize: 13.5, fontStyle: "italic" }}>No reports yet. Knowledge is bought with turns.</p>
        ) : (
          <table className="tbl">
            <tbody>
              {intel.slice(0, 12).map((item, i) => {
                const e = item.event;
                const line =
                  e.type === "spyReport"
                    ? `🗡 [${e.caught ? "FAILED" : "OK"}] vs ${e.targetName}: ${e.detail}`
                    : e.type === "scoutReport"
                      ? `👁 ${e.targetName}: ${e.detail}`
                      : "";
                return (
                  <tr key={i}>
                    <td className="num" style={{ width: 70, color: "var(--ink-soft)" }}>
                      t{item.tick}
                    </td>
                    <td>{line}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </>
  );
}
