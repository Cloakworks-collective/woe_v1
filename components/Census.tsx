import { civilians, mercTotal, military, totalPopulation, troopTotal, type Player } from "@/lib/engine";
import { Art } from "./Art";
import { BareBadge } from "./BareBadge";

const fmt = (n: number) => n.toLocaleString("en-US");

type Row = { key: string; art?: string; glyph?: string; label: string; count: number; muted?: boolean; bare?: boolean };

/**
 * The census — who your population actually is, told in three estates:
 * Civilians (the taxpayers), the Regular Army (your counted host), and
 * Mercenaries (hired swords who don't count as population at all).
 */
export function Census({ player: p }: { player: Player }) {
  const civilianRows: Row[] = [
    { key: "idle", glyph: "🧍", label: "Idle peasants", count: p.idlePeasants, muted: p.idlePeasants === 0 },
    { key: "farmers", art: "workers/farmers", label: "Farmers", count: p.workers.farmers },
    { key: "quarrymen", art: "workers/quarrymen", label: "Quarrymen", count: p.workers.quarrymen },
    { key: "miners", art: "workers/miners", label: "Miners", count: p.workers.miners },
    { key: "lumberjacks", art: "workers/lumberjacks", label: "Lumberjacks", count: p.workers.lumberjacks },
    { key: "merchants", art: "workers/merchants", label: "Merchants", count: p.workers.merchants },
    { key: "researchers", art: "workers/researchers", label: "Researchers", count: p.workers.researchers },
    { key: "spies", art: "units/spy", label: "Spies", count: p.army.spies },
    { key: "scouts", art: "units/scout", label: "Scouts", count: p.army.scouts },
  ];

  // An arm whose regulars have no hired blades of the same arm in front of them
  // is BARE — in battle those blows land on real population.
  const bareArm = (key: "footmen" | "archers" | "cavalry") =>
    troopTotal(p.army[key]) > 0 && troopTotal(p.army.mercenaries[key]) === 0;

  const armyRows: Row[] = [
    { key: "footmen", art: "units/footman", label: "Footmen", count: troopTotal(p.army.footmen), bare: bareArm("footmen") },
    { key: "archers", art: "units/archer", label: "Archers", count: troopTotal(p.army.archers), bare: bareArm("archers") },
    { key: "cavalry", art: "units/cavalry", label: "Cavalry", count: troopTotal(p.army.cavalry), bare: bareArm("cavalry") },
    { key: "engineers", art: "units/engineer", label: "Siege engineers", count: p.army.siegeEngineers },
  ];

  const m = p.army.mercenaries;
  const mercs = mercTotal(m);
  const mercRows: Row[] = [
    { key: "merc-foot", art: "units/footman", label: "Hired footmen", count: troopTotal(m.footmen), muted: troopTotal(m.footmen) === 0 },
    { key: "merc-arch", art: "units/archer", label: "Hired archers", count: troopTotal(m.archers), muted: troopTotal(m.archers) === 0 },
    { key: "merc-cav", art: "units/cavalry", label: "Hired cavalry", count: troopTotal(m.cavalry), muted: troopTotal(m.cavalry) === 0 },
  ];

  const col = (rows: Row[]) => (
    <ul className="census-list">
      {rows.map((r) => (
        <li key={r.key} className={`census-row${r.muted ? " muted" : ""}`}>
          <span className="census-ic">
            {r.art ? <Art path={r.art} size={52} title={r.label} /> : <span className="census-glyph">{r.glyph}</span>}
          </span>
          <span className="census-label">
            {r.label}
            {r.bare && <BareBadge arm={r.label.toLowerCase()} count={r.count} />}
          </span>
          <span className="census-count">{fmt(r.count)}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="census">
      <div className="census-col">
        <div className="census-col-head">
          <span>🏘 Civilians</span>
          <span className="census-col-total">{fmt(civilians(p))}</span>
        </div>
        {col(civilianRows)}
      </div>

      <div className="census-col">
        <div className="census-col-head">
          <span>⚔ Regular Army</span>
          <span className="census-col-total">{fmt(military(p))}</span>
        </div>
        {col(armyRows)}
      </div>

      <div className="census-col">
        <div className="census-col-head">
          <span>🛡 Mercenaries</span>
          <span className="census-col-total">{fmt(mercs)}</span>
        </div>
        {col(mercRows)}
        <div className="census-merc-note">
          Sellswords, not subjects: they <b>die first</b> in battle, shielding your regulars — but
          they draw gold upkeep every turn and <b>count as neither population nor ranking</b>.
        </div>
      </div>

      <div className="census-foot">
        Population <b>{fmt(totalPopulation(p))}</b> — {fmt(civilians(p))} civilians +{" "}
        {fmt(military(p))} under arms.
        {mercs > 0 && (
          <>
            {" "}
            Plus <b>{fmt(mercs)}</b> mercenaries, hired and uncounted.
          </>
        )}
      </div>
    </div>
  );
}
