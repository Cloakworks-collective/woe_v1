// Clan works, explained. Three cards — Storage, Hall, Wonder — each showing
// what it grants NOW, an integrity bar (with a repair when cracked), and what
// the NEXT level buys plus its pool cost. Read-only for outsiders; leadership
// gets Build/Repair buttons (editable). Shared by /clan and /clan/[id].

import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Info } from "@/components/Info";
import { ResIcon } from "@/components/ResIcon";
import {
  BUILD_COSTS,
  CLAN_BUILDING_INFO,
  HALL,
  STORAGE_CAP_PER_LEVEL,
  WONDER_REQUIRES_STORAGE,
} from "@/lib/constants";
import { clanRepairCost, wonderDiscount, type Clan } from "@/lib/engine";

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const pct = (n: number) => `${Math.round(n * 100)}%`;

type Which = "storage" | "hall" | "wonder";
const MAX: Record<Which, number> = { storage: 10, hall: 4, wonder: 3 };

/** What a given level grants, in one line. */
function effect(which: Which, level: number): string {
  if (which === "storage") {
    return level <= 0 ? "No shared vault yet" : `Pool holds ${fmt(STORAGE_CAP_PER_LEVEL * level)} of each resource`;
  }
  if (which === "hall") {
    const h = HALL[level - 1];
    return `${h.memberCap} member cap · members feel ${pct(h.taxPenaltyFelt)} of the tax penalty`;
  }
  return level <= 0 ? "No discount yet" : `−${pct(0.1 * level)} on war costs (mercs, troops, siege)`;
}

function buildCost(which: Which, next: number): { gold: number; each: number } {
  if (which === "storage") return BUILD_COSTS.storage(next);
  if (which === "hall") return BUILD_COSTS.hall[next]!;
  return BUILD_COSTS.wonder[next]!;
}

function Card({
  which,
  clan,
  level,
  integrity,
  editable,
  path,
}: {
  which: Which;
  clan: Clan;
  level: number;
  integrity: number;
  editable: boolean;
  path: string;
}) {
  const info = CLAN_BUILDING_INFO[which];
  const maxed = level >= MAX[which];
  const next = level + 1;
  const cost = maxed ? null : buildCost(which, next);
  const cracked = integrity < 1 && level > 0;
  const repair = clanRepairCost(clan, which);

  // Wonder gating on Storage depth.
  const reqStorage = which === "wonder" && !maxed ? WONDER_REQUIRES_STORAGE[next as 1 | 2 | 3] : 0;
  const reqMet = which !== "wonder" || maxed || clan.buildings.storageLevel >= reqStorage;

  const buildDisabled =
    !cost || clan.storage.gold < cost.gold || clan.storage.wood < cost.each || clan.storage.stone < cost.each || clan.storage.ore < cost.each
      ? "The clan pool can't cover this yet."
      : !reqMet
        ? `Requires Clan Storage L${reqStorage} first.`
        : undefined;

  return (
    <div className={`clanwork${cracked ? " is-cracked" : ""}`}>
      <div className="clanwork-head">
        <span className="clanwork-icon" aria-hidden>{info.icon}</span>
        <b className="clanwork-title">{info.title}</b>
        <span className="clanwork-lvl">
          Lv {level}
          <span className="clanwork-lvl-max"> / {MAX[which]}</span>
        </span>
        <span className="clanwork-info">
          <Info tip={info.tip} guide="/guide#clans" />
        </span>
      </div>

      <p className="clanwork-effect">{effect(which, level)}</p>

      {level > 0 && (
        <div className="clanwork-integ" title={`${pct(integrity)} integrity`}>
          <span className={`clanwork-integ-fill${cracked ? " is-cracked" : ""}`} style={{ width: `${Math.round(integrity * 100)}%` }} />
          <span className="clanwork-integ-label">{cracked ? `cracked — ${pct(integrity)} integrity` : "whole"}</span>
        </div>
      )}

      {editable && cracked && (
        <CmdForm name="clanRepair" path={path}>
          <input type="hidden" name="which" value={which} />
          <ReqTip
            heading={`Repair the ${info.title}`}
            body="Mend it back to full integrity, restoring its effect. Paid from the clan pool."
            rows={[{ icon: <ResIcon kind="gold" size={16} />, label: "Gold (from pool)", need: repair.gold, have: clan.storage.gold }]}
            note={`Plus ${fmt(repair.each)} of every other resource, from the pool.`}
            disabledReason={clan.storage.gold < repair.gold ? "The clan pool is short on gold to mend it." : undefined}
          >
            <Btn className="btn btn-repair">🔧 Repair ({fmt(repair.gold)}g + {fmt(repair.each)} each)</Btn>
          </ReqTip>
        </CmdForm>
      )}

      <div className="clanwork-next">
        {maxed ? (
          <span className="clanwork-zenith">✦ At its zenith</span>
        ) : (
          <>
            <div className="clanwork-next-effect">
              <span className="clanwork-next-arrow">→ Lv {next}:</span> {effect(which, next)}
            </div>
            <div className="clanwork-next-cost">
              {fmt(cost!.gold)}g + {fmt(cost!.each)} each · from pool
              {which === "wonder" && !reqMet && <span className="clanwork-req"> · needs Storage L{reqStorage}</span>}
            </div>
            {editable && (
              <CmdForm name="clanBuild" path={path}>
                <input type="hidden" name="which" value={which} />
                <ReqTip
                  heading={`${info.title} → Lv ${next}`}
                  body={effect(which, next)}
                  rows={[{ icon: <ResIcon kind="gold" size={16} />, label: "Gold (from pool)", need: cost!.gold, have: clan.storage.gold }]}
                  note={`Plus ${fmt(cost!.each)} of every other resource, paid from the clan pool.${which === "wonder" ? ` Requires Clan Storage L${reqStorage}.` : ""}`}
                  disabledReason={buildDisabled}
                >
                  <Btn className="btn">Raise → Lv {next}</Btn>
                </ReqTip>
              </CmdForm>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ClanWorks({ clan, editable = false, path = "/clan" }: { clan: Clan; editable?: boolean; path?: string }) {
  return (
    <div className="clanworks">
      <Card which="storage" clan={clan} level={clan.buildings.storageLevel} integrity={clan.buildings.integrity.storage} editable={editable} path={path} />
      <Card which="hall" clan={clan} level={clan.buildings.hallLevel} integrity={clan.buildings.integrity.hall} editable={editable} path={path} />
      <Card which="wonder" clan={clan} level={clan.buildings.wonderLevel} integrity={clan.buildings.integrity.wonder} editable={editable} path={path} />
    </div>
  );
}
