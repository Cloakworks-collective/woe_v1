import { Btn } from "@/components/Btn";
import { BuildingArt } from "@/components/BuildingArt";
import { CmdForm } from "@/components/CmdForm";
import { CostTip } from "@/components/CostTip";
import { Flash } from "@/components/Flash";
import { HealthBar } from "@/components/HealthBar";
import { LearnLink } from "@/components/LearnLink";
import { Info } from "@/components/Info";
import { Panel } from "@/components/Panel";
import { ResIcon, type ResKind } from "@/components/ResIcon";
import {
  CIVILIAN_BUILDINGS,
  HOUSING_PER_HEARTHSTEAD,
  MILITARY_BUILDINGS,
  WALL_NAMES,
  isCounted,
  maxLevel,
} from "@/lib/constants";
import { BUILDING_GUIDE, BUILDING_INFO } from "@/lib/constants";
import type { BuildingId, BuildingMeta } from "@/lib/constants/buildings";
import {
  buildingCost,
  buildingIntegrity,
  buildingUpgradeBenefit,
  level,
  popPerDay,
  vacantHousing,
  repairCost,
  structureIntegrity,
  type Player,
} from "@/lib/engine";
import { getGame } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const fmt = (n: number) => n.toLocaleString("en-US");
type Cost = { gold: number; wood: number; stone: number; ore: number };

function affordable(p: Player, c: Cost) {
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

const CIVILIAN_GROUPS: { slug: string; title: string; note: string; ids: string[] }[] = [
  { slug: "production", title: "🌾 Production — the resource engines", note: "Workers are unlimited — each building level makes every worker produce more (5 × level per turn). Goods are deliberately scarce in this age: coin is what your people are plentiful in, so the Bazaar is where most materials come from. A bombarded producer yields proportionally less until repaired.", ids: ["grange", "masons_quarry", "deepvein_mine", "sawyers_mill"] },
  { slug: "storage", title: "🏛 Storage — protect the wealth", note: "Protected capacity = 20,000 × level × integrity. What sits above capacity is lootable.", ids: ["granary", "timberyard", "masons_yard", "ironhold", "counting_house"] },
  { slug: "knowledge", title: "📚 Knowledge & Trade", note: "The Collegium researches slower when cracked, and a cracked Market Square loads smaller caravans. The Guild and Lodge sharpen every spy and scout — and no bombard can touch them.", ids: ["market_square", "collegium", "shadow_guild", "rangers_lodge"] },
  { slug: "housing", title: "🏘 Housing", note: "Settlers arrive at dawn and walk on if no bed is free — build ahead of growth.", ids: ["hearthstead"] },
];

const MILITARY_GROUPS: { slug: string; title: string; note: string; ids: string[] }[] = [
  { slug: "barracks", title: "⚔ Barracks & Tiers", note: "Muster Halls house 10 troops each; each trainer gates its own arm from light → medium → heavy.", ids: ["muster_hall", "drill_yard", "fletchers_range", "knights_stables"] },
  { slug: "warworks", title: "🔨 The War-Works", note: "The Forge sharpens and the Armoury hardens — +5% attack and defence per level, to every regular you field. Sellswords bring their own steel and draw nothing from either.", ids: ["forge", "armoury"] },
  { slug: "defence", title: "🏰 Siege & Defence", note: "The Walls blunt sieges (and bombard hits them first); the War Foundry's ladder lives in the Siege Works.", ids: ["war_foundry", "walls"] },
];

// Which tab a building's card lives on, so the repair list can point to it.
const MILITARY_IDS = new Set<string>(MILITARY_GROUPS.flatMap((g) => g.ids));
const buildingName = (id: BuildingId): string =>
  id === "walls" ? "The Walls" : (CIV[id] ?? MIL[id] ?? HEARTHSTEAD).name;

/** Batch sizes offered on COUNTED buildings (Hearthsteads, Muster Halls) — the
 *  ones you raise by the dozen, where clicking Build forty times is the only
 *  thing standing between you and housing your settlers. */
const BATCH_SIZES = [5, 10] as const;

/** What the next `n` levels cost together — each priced at its own level, since
 *  that is exactly what the engine charges. */
function batchCost(id: BuildingId, fromLevel: number, n: number) {
  const total = { gold: 0, wood: 0, stone: 0, ore: 0 };
  for (let i = 1; i <= n; i++) {
    const c = buildingCost(id, fromLevel + i);
    total.gold += c.gold;
    total.wood += c.wood;
    total.stone += c.stone;
    total.ore += c.ore;
  }
  return total;
}

/**
 * How many Hearthsteads the next day, three days and week will need at the
 * CURRENT intake — and how many are already spare.
 *
 * Arrivals that find no bed walk on and are lost, and the 24-hour average means
 * a bed bought late barely counts, so the useful question is never "how many do
 * I have" but "how many will I need before I next look at this page".
 */
function HearthsteadPlan({ player }: { player: Player }) {
  const perDay = popPerDay(player);
  const spare = vacantHousing(player);
  const horizons = [1, 3, 7];
  return (
    <div className="stead-plan">
      <div className="stead-plan-head">
        Room for <b>{spare.toLocaleString("en-US")}</b> more · <b>+{perDay}</b> arriving a day
      </div>
      <table className="stead-plan-tbl">
        <thead>
          <tr>
            <th>Ahead</th>
            <th className="num">Settlers</th>
            <th className="num">Steads to build</th>
          </tr>
        </thead>
        <tbody>
          {horizons.map((d) => {
            const incoming = perDay * d;
            const short = Math.max(0, incoming - spare);
            const steads = Math.ceil(short / HOUSING_PER_HEARTHSTEAD);
            return (
              <tr key={d}>
                <td>{d} day{d === 1 ? "" : "s"}</td>
                <td className="num">{incoming.toLocaleString("en-US")}</td>
                <td className="num">
                  {steads === 0 ? (
                    <span style={{ color: "var(--pos)" }}>covered</span>
                  ) : (
                    <b>{steads}</b>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {spare === 0 && (
        <div className="stead-plan-warn">
          Full — every arrival walks on. Beds bought late barely count: the day&apos;s intake is
          averaged over all 144 turns.
        </div>
      )}
    </div>
  );
}

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
  const have = {
    gold: player.gold,
    wood: player.resources.wood,
    stone: player.resources.stone,
    ore: player.resources.ore,
  };
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
        const counted = isCounted(bid);
        const name = bid === "walls" && lvl > 0 ? `${b.name} — ${WALL_NAMES[lvl]}` : b.name;
        const integrity = structureIntegrity(player, bid);
        const needsRepair = lvl > 0 && integrity < 1;
        const rcost = needsRepair ? repairCost(bid, lvl, integrity) : null;
        return (
          <div className="bcard" key={id} id={`b-${bid}`}>
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
              {(cost || (needsRepair && rcost)) && (
                <div className="bcard-btns">
                  {cost && (
                    <CmdForm name="build" path={path}>
                      <input type="hidden" name="id" value={bid} />
                      <CostTip
                        heading={`${counted ? "Build" : lvl === 0 ? "Found" : "Upgrade"} ${b.name}`}
                        cost={cost}
                        have={have}
                        disabledReason={
                          needsRepair
                            ? "Cracked — mend it to full before raising it higher."
                            : undefined
                        }
                      >
                        <Btn
                          className={affordable(player, cost) && !needsRepair ? "btn" : "btn btn-no"}
                          disabled={!affordable(player, cost) || needsRepair}
                        >
                          {counted ? "Build" : lvl === 0 ? "Found" : "Upgrade"}
                        </Btn>
                      </CostTip>
                    </CmdForm>
                  )}
                  {/* Batch building, for the structures you raise by the dozen
                      rather than one at a time. Each is charged at its own
                      price — the button saves clicks, not gold. */}
                  {cost && counted && !needsRepair &&
                    BATCH_SIZES.map((n) => {
                      const batch = batchCost(bid, lvl, n);
                      const can = affordable(player, batch);
                      return (
                        <CmdForm key={n} name="build" path={path}>
                          <input type="hidden" name="id" value={bid} />
                          <input type="hidden" name="count" value={n} />
                          <CostTip
                            heading={`Build ${n} × ${b.name}`}
                            cost={batch}
                            have={have}
                            note={`Each is paid for at its own price — no discount for the batch. If the treasury runs dry partway, what you bought stands.`}
                          >
                            <Btn className={can ? "btn ghost" : "btn btn-no"} disabled={!can}>
                              ×{n}
                            </Btn>
                          </CostTip>
                        </CmdForm>
                      );
                    })}
                  {cost && player.premium && !needsRepair && (
                    <CmdForm name="queueBuild" path={path}>
                      <input type="hidden" name="id" value={bid} />
                      <Btn className="btn" title="Queue for the Steward — built when affordable">
                        🪶
                      </Btn>
                    </CmdForm>
                  )}
                  {needsRepair && rcost && (
                    <CmdForm name={bid === "walls" ? "repairWalls" : "repairBuilding"} path={path}>
                      {bid !== "walls" && <input type="hidden" name="id" value={bid} />}
                      <CostTip heading={`Repair ${b.name} to full (now ${Math.round(integrity * 100)}%)`} cost={rcost} have={have}>
                        <Btn className={affordable(player, rcost) ? "btn" : "btn btn-no"} disabled={!affordable(player, rcost)}>
                          🔨 Repair
                        </Btn>
                      </CostTip>
                    </CmdForm>
                  )}
                </div>
              )}
            </div>
            <p className="bcard-desc">{b.desc}</p>
            <div className="bcard-main">
              <span className="bcard-art">
                <BuildingArt id={bid} level={lvl} size={208} title={info.title} integrity={integrity} />
              </span>
              {cost ? (
                <CostList cost={cost} />
              ) : (
                <span className="zenith-badge" title="Fully built — this building is at its maximum level">
                  <span className="zenith-star" aria-hidden="true">★</span>
                  <span className="zenith-body">
                    <b>ZENITH</b>
                    <small>max level {maxLevel(bid)}</small>
                  </span>
                </span>
              )}
            </div>
            {cost && (
              <div className="bcard-gain">
                <b>Next level brings</b>: {benefit}
              </div>
            )}
            {/* Housing is the one building you buy AHEAD of a number you can
                already see. "+64 settlers/day" and "10 beds per stead" is two
                sums the player should not have to do at 2am. */}
            {bid === "hearthstead" && <HearthsteadPlan player={player} />}
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
  // Everything that can be repaired, across both tabs — walls plus any cracked
  // building. The action buttons live on each building's card; this is the list.
  const repairs: { id: BuildingId; integrity: number }[] = [
    ...(p.wallIntegrity < 1 ? [{ id: "walls" as BuildingId, integrity: p.wallIntegrity }] : []),
    ...damagedBuildings(p),
  ];

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
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "4px 0" }}>
          🪶 The Steward holds {p.buildQueue!.length} queued build
          {p.buildQueue!.length > 1 ? "s" : ""} — <a href="/steward">review the queue</a>.
        </p>
      )}

      {repairs.length > 0 && (
        <Panel
          title={`🔨 Repairs needed — ${repairs.length} ${repairs.length === 1 ? "structure" : "structures"} damaged`}
          info="Bombardment cracks buildings down to a floor of 50%, and a wrecked store shelters less, a producer yields less, the Collegium researches slower. Repair each from its card below (the 🔨 Repair button) — it costs a fraction of the building's price, scaled by the damage. Hover the button for the exact cost."
        >
          <ul className="repair-list">
            {repairs.map(({ id, integrity }) => {
              const dtab = MILITARY_IDS.has(id) ? "military" : "civilian";
              const onThisTab = dtab === (military ? "military" : "civilian");
              return (
                <li key={id} className="repair-row">
                  <HealthBar integrity={integrity} label={buildingName(id)} />
                  <span className="repair-name">{buildingName(id)}</span>
                  {onThisTab ? (
                    <span className="repair-hint">— use its 🔨 Repair button below</span>
                  ) : (
                    <a className="repair-hint" href={`/buildings?tab=${dtab}`}>
                      — on the {dtab === "military" ? "Military" : "Civilian"} tab →
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>
      )}

      {/* Jump straight to a group — the page runs long. */}
      <nav className="anchor-row" aria-label="Building groups">
        {groups.map((g) => (
          <a key={g.slug} href={`#${g.slug}`}>
            {g.title.split("—")[0].trim()}
          </a>
        ))}
      </nav>

      {groups.map((g) => (
        <div key={g.title} id={g.slug}>
          <Panel title={g.title} info={g.note} guide="/guide#grow">
            <BuildingCards ids={g.ids} player={p} path={path} />
          </Panel>
        </div>
      ))}

      {military && (
        <p style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>
          The War Foundry&apos;s weapons and counters live in the <a href="/siege">Siege Works</a>.
        </p>
      )}
    </>
  );
}
