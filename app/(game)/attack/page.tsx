import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { Pills } from "@/components/Pills";
import { rankingScore, totalPopulation, settlementTitle } from "@/lib/engine";
import { ATTACK_MODE_GUIDE, ATTACK_MODE_INFO, RACE_NAMES } from "@/lib/constants";
import { getGame } from "@/lib/server/session";
import { REVENGE_WINDOW_TICKS } from "@/lib/server/world";

export const dynamic = "force-dynamic";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");

export default async function AttackPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; report?: string; target?: string }>;
}) {
  const { err, ok, report: reportId, target } = await searchParams;
  const { world, player: p } = await getGame();
  const tick = world.meta.tickNumber;

  const report = reportId ? world.battles.find((b) => b.id === reportId) : undefined;
  const myBattles = world.battles
    .filter((b) => b.attackerId === p.id || b.defenderId === p.id)
    .slice(0, 12);
  const revengeIds = new Set(
    p.recentAttackers
      .filter((a) => tick - a.tick <= REVENGE_WINDOW_TICKS && !p.revengeUsed.includes(a.playerId))
      .map((a) => a.playerId),
  );
  const targets = Object.values(world.players)
    .filter((t) => t.id !== p.id)
    .sort((a, b) => rankingScore(b) - rankingScore(a));
  const myScore = Math.max(1, rankingScore(p));

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#battle">Attack modes &amp; battle strategy</LearnLink>
      {report && (
        <Panel title={`Battle Report — ${report.mode} on ${report.defenderName} (turn ${report.tick})`}>
          <p style={{ fontWeight: 700, marginBottom: 6 }}>
            {report.victor === "none"
              ? "Artillery duel — no victor, only rubble."
              : report.victor === "attacker"
                ? `${report.attackerName} carries the field after ${report.rounds} rounds.`
                : `${report.defenderName} holds after ${report.rounds} rounds.`}
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
                    ["Warriors", "warriors"],
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
              <dd>−{Math.round(report.wallIntegrityDamage * 100)}%</dd>
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
              <dd>{fmt(report.loot.gold)}</dd>
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
          <div style={{ marginTop: 8, fontSize: 12.5, fontStyle: "italic", color: "var(--ink-soft)" }}>
            {report.log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title={`The War Room — ${p.turnsAvailable} action turns (every attack costs 10)`}>
        <div style={{ marginBottom: 8, display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
          {(["raid", "siege", "revenge", "bombard"] as const).map((m) => (
            <span key={m} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <b>{ATTACK_MODE_INFO[m].title}</b>
              <Info tip={ATTACK_MODE_INFO[m].tip} guide={ATTACK_MODE_GUIDE[m]} />
            </span>
          ))}
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th>Empire</th>
              <th className="num">Score</th>
              <th className="num">
                <Info
                  tip="Their ranking score as a percentage of yours. Pick fights within about 20% of your own strength for the most experience; anyone 75% stronger, your troops will refuse to attack; and bullying much weaker empires actually costs you experience and loot."
                  guide="/guide#battle"
                >
                  vs you
                </Info>
              </th>
              <th>Mode & launch</th>
            </tr>
          </thead>
          <tbody>
            {targets.map((t) => {
              const ratio = rankingScore(t) / myScore;
              const shielded = t.shieldUntilTick > tick;
              const refused = ratio >= 1.75;
              return (
                <tr key={t.id} style={target === t.id ? { outline: "2px solid var(--warn)" } : undefined}>
                  <td>
                    <span className="race-cell">
                      <span className="race-avatar">
                        <Art path={`races/${t.race}`} size={30} title={RACE_NAMES[t.race]} />
                      </span>
                      <span>
                        <b>{t.name}</b> — {settlementTitle(t)} of the {RACE_NAMES[t.race]}
                        <div style={{ fontSize: 12, color: "var(--ink-soft)" }}>
                          {fmt(totalPopulation(t))} pop
                          {revengeIds.has(t.id) && " · ⚔ revenge open"}
                          {t.surrendered && " · 🏳 surrendered"}
                          {shielded && " · 🛡 shielded"}
                        </div>
                      </span>
                    </span>
                  </td>
                  <td className="num">{fmt(rankingScore(t))}</td>
                  <td className="num" title={refused ? "Too strong — your troops will refuse" : undefined}>
                    {refused ? "☠ " : ""}
                    {Math.round(ratio * 100)}%
                  </td>
                  <td>
                    <CmdForm name="attack" path="/attack">
                      <input type="hidden" name="targetId" value={t.id} />
                      <Pills
                        name="mode"
                        ariaLabel={`Attack mode against ${t.name}`}
                        defaultValue={revengeIds.has(t.id) ? "revenge" : "raid"}
                        options={[
                          { value: "raid", label: "Raid", title: ATTACK_MODE_INFO.raid.tip },
                          { value: "siege", label: "Siege", title: ATTACK_MODE_INFO.siege.tip },
                          { value: "revenge", label: "Revenge", title: ATTACK_MODE_INFO.revenge.tip },
                          { value: "bombard", label: "Bombard", title: ATTACK_MODE_INFO.bombard.tip },
                        ]}
                      />{" "}
                      <button className="btn">Attack</button>
                    </CmdForm>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      {myBattles.length > 0 && (
        <Panel title="Recent Battles">
          <table className="tbl">
            <thead>
              <tr>
                <th className="num">Turn</th>
                <th>Battle</th>
                <th>Victor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {myBattles.map((b) => (
                <tr key={b.id}>
                  <td className="num">{b.tick}</td>
                  <td>
                    {b.attackerName} {b.mode}s {b.defenderName}
                  </td>
                  <td>{b.victor === "none" ? "—" : b.victor === "attacker" ? b.attackerName : b.defenderName}</td>
                  <td>
                    <a href={`/attack?report=${b.id}`}>read the report</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
