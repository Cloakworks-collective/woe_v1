// Clan works, explained. Three cards — Storage, Hall, Wonder — each showing
// what it grants NOW, an integrity bar (with a repair when cracked), and what
// the NEXT level buys plus its pool cost. Read-only for outsiders; leadership
// gets Build/Repair buttons (editable). Shared by /clan and /clan/[id].

import { Art } from "@/components/Art";
import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";
import { ReqTip } from "@/components/CostTip";
import { Info } from "@/components/Info";
import { ResIcon } from "@/components/ResIcon";
import {
  BUILD_COSTS,
  CLAN_BUILDING_INFO,
  clanArtStage,
  HALL,
  STORAGE_CAP_PER_LEVEL,
  CLAN_BEACON,
  WONDER_REQUIRES_STORAGE,
} from "@/lib/constants";
import { beaconGraceHours } from "@/lib/constants/clans";
import { clanBuildFunding, clanRepairCost, wonderDiscount, type Clan, type Player } from "@/lib/engine";

/** The four resources a clan work is paid in, in the order they're quoted. */
const WORK_RES = ["gold", "wood", "stone", "ore"] as const;

const fmt = (n: number) => Math.floor(n).toLocaleString("en-US");
const pct = (n: number) => `${Math.round(n * 100)}%`;

type Which = "storage" | "hall" | "wonder" | "beacon";
const MAX: Record<Which, number> = { storage: 10, hall: 4, wonder: 3, beacon: CLAN_BEACON.MAX_LEVEL };

/** What a given level grants, in one line. */
function effect(which: Which, level: number): string {
  if (which === "storage") {
    return level <= 0 ? "No shared vault yet" : `Pool holds ${fmt(STORAGE_CAP_PER_LEVEL * level)} of each resource`;
  }
  if (which === "hall") {
    const h = HALL[level - 1];
    return `${h.memberCap} member cap · members feel ${pct(h.taxPenaltyFelt)} of the tax penalty`;
  }
  if (which === "beacon") {
    // Level 0 still grants the base grace — the horns sound for everyone.
    return `${beaconGraceHours(level)}h of peacetime grace after war is declared on you`;
  }
  return level <= 0 ? "No discount yet" : `−${pct(0.1 * level)} on war costs (mercs, troops, siege)`;
}

/**
 * What this work does for the PEOPLE IN THE CLAN, in plain points.
 *
 * `effect()` above answers "what is this level worth"; this answers "why would
 * a member care", which is the question the card was not answering. Shown on
 * the card and reused inside the ⓘ, so the two can never drift apart.
 */
function benefits(which: Which, level: number, clan: Clan): string[] {
  if (which === "storage") {
    const cap = STORAGE_CAP_PER_LEVEL * level;
    return [
      level > 0
        ? `A shared pool holding ${fmt(cap)} of each resource that any member may draw on.`
        : "Unlocks the shared pool — until it is raised, the clan cannot hold anything at all.",
      "Members withdraw up to 3× what they have ever deposited, so it rewards giving.",
      "Pays for every other work on this page — build and repair spending ignores the 3× cap.",
      "Gates the Wonder: levels 4 / 7 / 10 unlock Wonder 1 / 2 / 3.",
    ];
  }
  if (which === "hall") {
    const h = HALL[level - 1];
    return [
      `Seats ${h.memberCap} banners — the cap on how many empires can fly this one.`,
      `Softens the clan tax penalty: members feel ${pct(h.taxPenaltyFelt)} of it, keeping the rest of their gold.`,
      "Every member feels this the moment it is raised — no opt-in, no upkeep.",
    ];
  }
  if (which === "beacon") {
    return [
      `Watchfires that hold a declared war at PEACETIME rates for ${beaconGraceHours(level)}h.`,
      "During the grace, blows against your members do normal damage and take normal loot — no doubling, no 100% plunder.",
      "Measured from the declaration and it protects YOUR side only, whatever the enemy has built.",
      "Burn higher than your enemy and you strike at full war rates while they still cannot — the drum you beat first.",
    ];
  }
  return [
    level > 0
      ? `Every member pays ${pct(0.1 * level)} less for mercenaries, troop training and siege gear.`
      : "Not yet raised — no discount for anyone.",
    "Applies to every member automatically, on every purchase, for the whole age.",
    "The heaviest work on the clan score, and a statement the whole server can read.",
    "Needs deep Storage first: levels 4 / 7 / 10.",
  ];
}

function buildCost(which: Which, next: number): { gold: number; each: number } {
  if (which === "storage") return BUILD_COSTS.storage(next);
  if (which === "hall") return BUILD_COSTS.hall[next]!;
  if (which === "beacon") return BUILD_COSTS.beacon[next]!;
  return BUILD_COSTS.wonder[next]!;
}

function Card({
  which,
  clan,
  level,
  integrity,
  editable,
  path,
  builder,
}: {
  which: Which;
  clan: Clan;
  level: number;
  integrity: number;
  editable: boolean;
  path: string;
  builder?: Player;
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

  // The pool is spent first; the builder tops up the rest from their own stores.
  const funding = cost && builder ? clanBuildFunding(clan, builder, cost) : null;
  const topUp = funding ? WORK_RES.filter((r) => funding.own[r] > 0) : [];

  const buildDisabled = cracked
    ? "Cracked — mend it to full before raising it higher."
    : !cost
      ? "Already at its zenith."
      : funding && !funding.affordable
        ? "The pool and your own stores together can't cover this yet."
        : !reqMet
          ? `Requires Clan Storage L${reqStorage} first.`
          : undefined;

  return (
    <div className={`clanwork${cracked ? " is-cracked" : ""}`}>
      {/* The work itself — it grows through three forms as the pool builds it. */}
      <span className={`clanwork-art${level <= 0 ? " is-unbuilt" : ""}`}>
        <Art
          path={`clan/${which}/${clanArtStage(which, level)}`}
          size={188}
          title={level > 0 ? `${info.title} — level ${level}` : `${info.title} — not yet raised`}
        />
      </span>
      <div className="clanwork-head">
        <span className="clanwork-icon" aria-hidden>{info.icon}</span>
        <b className="clanwork-title">{info.title}</b>
        <span className="clanwork-meta">
          <span className="clanwork-lvl">
            Lv {level}
            <span className="clanwork-lvl-max"> / {MAX[which]}</span>
          </span>
          <Info
            tip={info.tip}
            title={info.title}
            bullets={benefits(which, level, clan)}
            guide="/guide#clans"
          />
        </span>
      </div>

      <p className="clanwork-effect">{effect(which, level)}</p>

      {/* The same points the ⓘ carries, on the face of the card — a benefit you
          have to hover to discover is a benefit most players never find. */}
      <ul className="clanwork-perks">
        {benefits(which, level, clan).map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>

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
              {fmt(cost!.gold)}g + {fmt(cost!.each)} each · pool first
              {which === "wonder" && !reqMet && <span className="clanwork-req"> · needs Storage L{reqStorage}</span>}
            </div>
            {topUp.length > 0 && (
              <div className="clanwork-topup">
                The pool falls short — you would add{" "}
                {topUp.map((r, i) => (
                  <span key={r}>
                    {i > 0 && ", "}
                    <b>{fmt(funding!.own[r])}</b> {r === "gold" ? "gold" : r}
                  </span>
                ))}{" "}
                from your own treasury.
              </div>
            )}
            {editable && (
              <CmdForm name="clanBuild" path={path}>
                <input type="hidden" name="which" value={which} />
                <ReqTip
                  heading={`${info.title} → Lv ${next}`}
                  body={effect(which, next)}
                  rows={[
                    { icon: <ResIcon kind="gold" size={16} />, label: "Gold (from pool)", need: cost!.gold, have: clan.storage.gold },
                  ]}
                  note={
                    topUp.length > 0
                      ? `The pool is spent first; whatever it can't cover comes out of YOUR OWN treasury — ${topUp
                          .map((r) => `${fmt(funding!.own[r])} ${r}`)
                          .join(", ")}.`
                      : `Plus ${fmt(cost!.each)} of every other resource, paid from the clan pool.${which === "wonder" ? ` Requires Clan Storage L${reqStorage}.` : ""}`
                  }
                  disabledReason={buildDisabled}
                >
                  <Btn className={buildDisabled ? "btn btn-no" : "btn"} disabled={Boolean(buildDisabled)}>
                    Raise → Lv {next}
                  </Btn>
                </ReqTip>
              </CmdForm>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function ClanWorks({
  clan,
  editable = false,
  path = "/clan",
  builder,
}: {
  clan: Clan;
  editable?: boolean;
  path?: string;
  /** The viewer, when they may build — used to quote the pool/own-purse split. */
  builder?: Player;
}) {
  const common = { clan, editable, path, builder };
  return (
    <div className="clanworks">
      <Card which="storage" level={clan.buildings.storageLevel} integrity={clan.buildings.integrity.storage} {...common} />
      <Card which="hall" level={clan.buildings.hallLevel} integrity={clan.buildings.integrity.hall} {...common} />
      <Card which="beacon" level={clan.buildings.beaconLevel ?? 0} integrity={clan.buildings.integrity.beacon ?? 1} {...common} />
      <Card which="wonder" level={clan.buildings.wonderLevel} integrity={clan.buildings.integrity.wonder} {...common} />
    </div>
  );
}
