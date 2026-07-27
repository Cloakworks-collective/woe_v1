// The war-front bombard board: for every clan you're at war with, its three
// works with a per-structure bombard button. Shared by the Clan Hall (/clan)
// and the Clan Ranks page (/rankings/clans) so the action lives wherever you
// meet the enemy. `path` is where the command redirects back to.

import Link from "next/link";
import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import type { Clan } from "@/lib/engine";

const STRUCTS = [
  { key: "storage", label: "Clan Storage", note: "shelter shrinks, pooled goods spill" },
  { key: "hall", label: "Clan Hall", note: "tax shelter weakens for every member" },
  { key: "wonder", label: "Clan Wonder", note: "war-cost discount fades" },
] as const;

export function ClanBombardTargets({
  enemies,
  turnsAvailable,
  path,
}: {
  enemies: Clan[];
  turnsAvailable: number;
  path: string;
}) {
  return (
    <div className="cbt">
      {enemies.map((enemy) => {
        const rows = STRUCTS.map((s) => ({
          ...s,
          level: enemy.buildings[`${s.key}Level` as const],
          integ: enemy.buildings.integrity[s.key],
        })).filter((r) => r.level > 0);
        return (
          <div key={enemy.id} className="cbt-enemy">
            <div className="cbt-enemy-head">
              <span className="cbt-flag" aria-hidden>⚔</span>
              <Link href={`/clan/${enemy.id}`}>{enemy.name}</Link>
              <span className="cbt-record">
                {enemy.warRecord.wins}W · {enemy.warRecord.losses}L
              </span>
            </div>
            {rows.length === 0 ? (
              <p className="cbt-empty">No works standing to break.</p>
            ) : (
              <div className="cbt-structs">
                {rows.map((r) => {
                  const cracked = r.integ <= 0.5;
                  const pct = Math.round(r.integ * 100);
                  return (
                    <div key={r.key} className={`cbt-struct${cracked ? " is-cracked" : ""}`}>
                      <div className="cbt-struct-top">
                        <span className="cbt-struct-name">{r.label}</span>
                        <span className="cbt-struct-lvl">L{r.level}</span>
                      </div>
                      <div className="cbt-bar" title={`${pct}% integrity`}>
                        <span className="cbt-bar-fill" style={{ width: `${pct}%` }} />
                        <span className="cbt-bar-label">{pct}%</span>
                      </div>
                      <p className="cbt-struct-note">{r.note}</p>
                      {cracked ? (
                        <span className="cbt-floored">cracked to its floor</span>
                      ) : (
                        <CmdForm name="clanBombard" path={path}>
                          <input type="hidden" name="clanId" value={enemy.id} />
                          <input type="hidden" name="which" value={r.key} />
                          <ReqTip
                            heading={`Bombard ${enemy.name}'s ${r.label}`}
                            body={`Fire your crewed trebuchets at this structure, cracking its integrity toward the 50% floor (now ${pct}%). Any member of your clan may fire.`}
                            rows={[{ icon: <span className="costtip-ico">⏳</span>, label: "Action turns", need: 10, have: turnsAvailable }]}
                            note="Needs at least one crewed trebuchet (a trebuchet with engineers to work it). Each strike hands the enemy clan a single revenge (18h)."
                            disabledReason={turnsAvailable < 10 ? "Not enough action turns — a bombardment costs 10." : undefined}
                          >
                            <Btn className="btn cbt-fire">🎯 Bombard (10 turns)</Btn>
                          </ReqTip>
                        </CmdForm>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
