import { Panel } from "@/components/Panel";
import type { BattleReport } from "@/lib/engine";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

/** The full account of a single battle — the losses table, the spoils, and
 *  the round-by-round telling. Shown wherever an attack was just launched. */
export function BattleReportPanel({ report }: { report: BattleReport }) {
  const won = report.victor === "attacker";
  const headline =
    report.victor === "none"
      ? "Artillery duel — no victor, only rubble."
      : report.yielded
        ? `${report.defenderName} lays down arms without a fight — the stores are taken, the soldiers spared.`
        : won
          ? `${report.attackerName} carries the field after ${report.rounds} rounds.`
          : `${report.defenderName} holds after ${report.rounds} rounds.`;
  return (
    <Panel title={`Battle Report — ${report.mode} on ${report.defenderName} (turn ${report.tick})`}>
      <p
        style={{
          fontWeight: 700,
          marginBottom: 6,
          color: report.victor === "none" ? "var(--ink-soft)" : won ? "var(--green-dark)" : "var(--warn)",
        }}
      >
        {headline}
      </p>
      <div className="panel-row">
        <table className="tbl">
          <thead>
            <tr>
              <th>Losses</th>
              <th className="num">{report.attackerName}</th>
              <th className="num">{report.defenderName}</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Footmen", "footmen"],
                ["Archers", "archers"],
                ["Cavalry", "cavalry"],
                ["Engineers", "engineers"],
                ["Mercenaries", "mercenaries"],
              ] as const
            ).map(([label, key]) => (
              <tr key={key}>
                <td>{label}</td>
                <td className="num">{report.attackerLosses[key]}</td>
                <td className="num">{report.defenderLosses[key]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <dl className="kv">
          <dt>Wall damage</dt>
          <dd style={{ color: report.wallIntegrityDamage > 0 ? "var(--warn)" : undefined }}>
            −{Math.round(report.wallIntegrityDamage * 100)}%
          </dd>
          {report.buildingDamage && report.buildingDamage.length > 0 && (
            <>
              <dt>Buildings cracked</dt>
              <dd>
                {report.buildingDamage
                  .map((b) => `${b.building.replace(/_/g, " ")} −${Math.round(b.integrityLost * 100)}%`)
                  .join(", ")}
              </dd>
            </>
          )}
          <dt>Gold plundered</dt>
          <dd style={{ color: report.loot.gold > 0 ? "var(--coin)" : undefined, fontWeight: report.loot.gold > 0 ? 700 : undefined }}>
            {fmt(report.loot.gold)}
          </dd>
          <dt>Goods plundered (food/wood/stone/ore)</dt>
          <dd>
            {fmt(report.loot.resources.food)} / {fmt(report.loot.resources.wood)} /{" "}
            {fmt(report.loot.resources.stone)} / {fmt(report.loot.resources.ore)}
          </dd>
          {Object.keys(report.siegeGearLost).length > 0 && (
            <>
              <dt>Siege gear you lost</dt>
              <dd>
                {Object.entries(report.siegeGearLost)
                  .filter(([, v]) => (v ?? 0) > 0)
                  .map(([t, v]) => `${v} ${t}`)
                  .join(", ")}
                {report.trebsDestroyedByCounter
                  ? ` (${report.trebsDestroyedByCounter} smashed by their Counter-Engine)`
                  : ""}
              </dd>
            </>
          )}
          <dt>Stamina spent (you / them)</dt>
          <dd>
            −{report.staminaLoss.attacker} / −{report.staminaLoss.defender}
          </dd>
          <dt>Experience gained (you / them)</dt>
          <dd>
            {report.experienceChange.attacker >= 0 ? "+" : ""}
            {report.experienceChange.attacker} / +{report.experienceChange.defender}
          </dd>
        </dl>
      </div>
      <div style={{ marginTop: 8, fontSize: 13.5, fontStyle: "italic", color: "var(--ink-soft)" }}>
        {report.log.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </Panel>
  );
}
