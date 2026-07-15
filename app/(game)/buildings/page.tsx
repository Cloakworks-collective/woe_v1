import { Art } from "@/components/Art";
import { CmdForm } from "@/components/CmdForm";
import { Flash } from "@/components/Flash";
import { HealthBar } from "@/components/HealthBar";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { ResIcon, type ResKind } from "@/components/ResIcon";
import {
  CIVILIAN_BUILDINGS,
  MILITARY_BUILDINGS,
  WALL_NAMES,
  maxLevel,
} from "@/lib/constants";
import { BUILDING_GUIDE, BUILDING_INFO } from "@/lib/constants";
import type { BuildingId, BuildingMeta } from "@/lib/constants/buildings";
import { buildingCost, buildingUpgradeBenefit, buildingIntegrity, level, type Player } from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");

function affordable(p: Player, c: { gold: number; wood: number; stone: number; ore: number }) {
  return (
    p.gold >= c.gold &&
    p.resources.wood >= c.wood &&
    p.resources.stone >= c.stone &&
    p.resources.ore >= c.ore
  );
}

const HEARTHSTEAD: BuildingMeta = {
  id: "hearthstead",
  name: "Hearthstead",
  desc: "Houses 10 people each — growth stops when full",
};

// The civilian and military trees, broken into digestible groups.
const CIV = Object.fromEntries(CIVILIAN_BUILDINGS.map((b) => [b.id, b])) as Record<string, BuildingMeta>;
const MIL = Object.fromEntries(MILITARY_BUILDINGS.map((b) => [b.id, b])) as Record<string, BuildingMeta>;

const CIVILIAN_GROUPS: { title: string; note: string; ids: string[] }[] = [
  { title: "🌾 Production — the resource engines", note: "Each level adds 20 worker slots. A bombarded producer yields proportionally less until repaired.", ids: ["grange", "masons_quarry", "deepvein_mine", "sawyers_mill"] },
  { title: "🏛 Storage — protect the wealth", note: "Protected capacity = 20,000 × level × integrity. What sits above capacity is lootable.", ids: ["granary", "timberyard", "masons_yard", "ironhold", "counting_house"] },
  { title: "📚 Knowledge & Trade", note: "The Collegium researches slower when cracked; the others hold slots for merchants, spies, and scouts.", ids: ["market_square", "collegium", "shadow_guild", "rangers_lodge"] },
  { title: "🏘 Housing", note: "Settlers arrive at dawn and walk on if no bed is free — build ahead of growth.", ids: ["hearthstead"] },
];

const MILITARY_GROUPS: { title: string; note: string; ids: string[] }[] = [
  { title: "⚔ Barracks & Tiers", note: "Muster Halls house 10 troops each; the trainers + Forge gate light → medium → heavy.", ids: ["muster_hall", "drill_yard", "fletchers_range", "knights_stables", "forge"] },
  { title: "🏰 Siege & Defence", note: "The Walls blunt sieges (and bombard hits them first); the War Foundry's ladder lives in the Siege Works.", ids: ["war_foundry", "walls"] },
];

function CostList({ cost }: { cost: { gold: number; wood: number; stone: number; ore: number } }) {
  const parts: [ResKind, number][] = [
    ["wood", cost.wood],
    ["stone", cost.stone],
    ["ore", cost.ore],
    ["gold", cost.gold],
  ];
  return (
    <ul className="bcard-costs">
      {parts
        .filter(([, n]) => n > 0)
        .map(([kind, n]) => (
          <li key={kind}>
            <ResIcon kind={kind} size={20} /> {fmt(n)}
          </li>
        ))}
    </ul>
  );
}

// A segmented level ladder: owned levels solid, the next glows gold, rest empty.
function LevelTrack({ lvl, max }: { lvl: number; max: number }) {
  return (
    <span className="lvltrack" aria-label={`Level ${lvl} of ${max}`}>
      <span className="lvltrack-segs">
        {Array.from({ length: max }, (_, i) => {
          const n = i + 1;
          const cls = n <= lvl ? "on" : n === lvl + 1 ? "next" : "off";
          return <i key={n} className={`lvlseg ${cls}`} title={`Level ${n}`} />;
        })}
      </span>
      {lvl >= max ? (
        <span className="lvltrack-max">max</span>
      ) : (
        <b className="lvltrack-num">
          {lvl}
          <span>/{max}</span>
        </b>
      )}
    </span>
  );
}

function BuildingCards({ ids, player, path }: { ids: string[]; player: Player; path: string }) {
  return (
    <div className="card-grid">
      {ids.map((id) => {
        const b = (CIV[id] ?? MIL[id] ?? HEARTHSTEAD) as BuildingMeta;
        const bid = b.id as BuildingId;
        const info = BUILDING_INFO[bid];
        const lvl = level(player, bid);
        const capped = lvl >= maxLevel(bid);
        const cost = capped ? null : buildingCost(bid, lvl + 1);
        const benefit = buildingUpgradeBenefit(player, bid);
        const counted = bid === "hearthstead" || bid === "muster_hall";
        const name = bid === "walls" && lvl > 0 ? `${b.name} — ${WALL_NAMES[lvl]}` : b.name;
        const integrity = bid === "walls" ? player.wallIntegrity : buildingIntegrity(player, bid);
        return (
          <div className="bcard" key={id}>
            <div className="bcard-head">
              <div>
                <Info tip={info.tip} title={info.title} guide={BUILDING_GUIDE[bid]}>
                  <span className="bcard-name">{name}</span>
                </Info>
                <div className="bcard-sub">
                  {counted ? (
                    <span className="lvl-count">
                      <b>{lvl}</b> built
                    </span>
                  ) : (
                    <LevelTrack lvl={lvl} max={maxLevel(bid)} />
                  )}
                  {lvl > 0 && integrity < 1 && (
                    <>
                      {" · "}
                      <HealthBar integrity={integrity} />
                    </>
                  )}
                </div>
              </div>
              {cost && (
                <div className="bcard-btns">
                  <CmdForm name="build" path={path}>
                    <input type="hidden" name="id" value={bid} />
                    <button className="btn" disabled={!affordable(player, cost)}>
                      {counted ? "Build" : lvl === 0 ? "Found" : "Upgrade"}
                    </button>
                  </CmdForm>
                  {player.premium && (
                    <CmdForm name="queueBuild" path={path}>
                      <input type="hidden" name="id" value={bid} />
                      <button className="btn" title="Queue for the Steward — built when affordable">
                        🪶
                      </button>
                    </CmdForm>
                  )}
                </div>
              )}
            </div>
            <p className="bcard-desc">{b.desc}</p>
            <div className="bcard-main">
              <span className="bcard-art">
                <Art path={`buildings/${bid}`} size={104} title={info.title} />
              </span>
              {cost ? (
                <CostList cost={cost} />
              ) : (
                <span className="bcard-zenith">at its zenith — fully built</span>
              )}
            </div>
            {cost && (
              <div className="bcard-gain">
                <b>Next level brings</b>: {benefit}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function damagedBuildings(p: Player): { id: BuildingId; integrity: number }[] {
  const out: { id: BuildingId; integrity: number }[] = [];
  for (const [id, integ] of Object.entries(p.buildingIntegrity ?? {}) as [BuildingId, number][]) {
    if (integ < 1) out.push({ id, integrity: integ });
  }
  return out.sort((a, b) => a.integrity - b.integrity);
}

export default async function BuildingsPage({
  searchParams,
}: {
  searchParams: Promise<{ err?: string; ok?: string; tab?: string }>;
}) {
  const { err, ok, tab = "civilian" } = await searchParams;
  const { player: p } = await getGame();
  const military = tab === "military";
  const path = military ? "/buildings?tab=military" : "/buildings";
  const groups = military ? MILITARY_GROUPS : CIVILIAN_GROUPS;
  const damaged = damagedBuildings(p);

  return (
    <>
      <Flash err={err} ok={ok} />
      <LearnLink href="/guide#grow">How buildings grow your empire</LearnLink>
      <div className="tabs">
        <a href="/buildings" className={military ? "" : "on"}>
          🏘 Civilian — the growth engine
        </a>
        <a href="/buildings?tab=military" className={military ? "on" : ""}>
          ⚔ Military — the war engine
        </a>
      </div>

      {p.premium && (p.buildQueue?.length ?? 0) > 0 && (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "4px 0" }}>
          🪶 The Steward holds {p.buildQueue!.length} queued build
          {p.buildQueue!.length > 1 ? "s" : ""} — <a href="/steward">review the queue</a>.
        </p>
      )}

      {(p.wallIntegrity < 1 || damaged.length > 0) && (
        <Panel
          title="🔨 Repairs — the masons await"
          info="Bombardment cracks buildings down to a floor of 50% — repairing restores full storage protection, production, and research."
        >
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            {p.wallIntegrity < 1 && (
              <CmdForm name="repairWalls" path={path}>
                <span style={{ marginRight: 4 }}>
                  <HealthBar integrity={p.wallIntegrity} label="Walls" />
                </span>
                <button className="btn">Repair walls — ½ cost × damage</button>
              </CmdForm>
            )}
            {damaged.map(({ id, integrity }) => (
              <CmdForm key={id} name="repairBuilding" path={path}>
                <input type="hidden" name="id" value={id} />
                <span style={{ marginRight: 4 }}>
                  <HealthBar integrity={integrity} label={id.replace(/_/g, " ")} />
                </span>
                <button className="btn">Repair</button>
              </CmdForm>
            ))}
          </div>
        </Panel>
      )}

      {groups.map((g) => (
        <Panel key={g.title} title={g.title} info={g.note} guide="/guide#grow">
          <BuildingCards ids={g.ids} player={p} path={path} />
        </Panel>
      ))}

      {military && (
        <p style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>
          The War Foundry&apos;s weapons and counters live in the <a href="/siege">Siege Works</a>.
        </p>
      )}
    </>
  );
}
