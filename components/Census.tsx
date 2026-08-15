import { bareTiers, civilians, mercTotal, military, totalPopulation, troopTotal, type Player } from "@/lib/engine";
import { Art } from "./Art";
import { TiredArt, tiredLabel } from "./TiredArt";
import { BareBadge } from "./BareBadge";

const fmt = (n: number) => n.toLocaleString("en-US");

type Row = {
  key: string;
  art?: string;
  glyph?: string;
  label: string;
  count: number;
  muted?: boolean;
  /** The RANKS of this arm with no sellswords beside them, if any. */
  bare?: string[];
  /** Fighting men wear the army's stamina on their backs; civilians don't. */
  tires?: boolean;
};

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
  // Per RANK, not per arm: heavy footmen behind light sellswords are unscreened
  // however many hirelings the arm musters in total. See `bareTiers`.
  const armyRows: Row[] = [
    { key: "footmen", art: "units/footman", label: "Footmen", count: troopTotal(p.army.footmen), bare: bareTiers(p, "footmen"), tires: true },
    { key: "archers", art: "units/archer", label: "Archers", count: troopTotal(p.army.archers), bare: bareTiers(p, "archers"), tires: true },
    { key: "cavalry", art: "units/cavalry", label: "Cavalry", count: troopTotal(p.army.cavalry), bare: bareTiers(p, "cavalry"), tires: true },
    { key: "engineers", art: "units/engineer", label: "Siege engineers", count: p.army.siegeEngineers, tires: true },
  ];

  const m = p.army.mercenaries;
  const mercs = mercTotal(m);
  const mercRows: Row[] = [
    // Sellswords march under the same standard and tire with it — stamina is one
    // army-wide stat, and they are in the same battle line taking the larger
    // share of whatever damage lands at their own arm AND rank.
    { key: "merc-foot", art: "units/footman", label: "Hired footmen", count: troopTotal(m.footmen), muted: troopTotal(m.footmen) === 0, tires: true },
    { key: "merc-arch", art: "units/archer", label: "Hired archers", count: troopTotal(m.archers), muted: troopTotal(m.archers) === 0, tires: true },
    { key: "merc-cav", art: "units/cavalry", label: "Hired cavalry", count: troopTotal(m.cavalry), muted: troopTotal(m.cavalry) === 0, tires: true },
  ];

  const col = (rows: Row[]) => (
    <ul className="census-list">
      {rows.map((r) => (
        <li key={r.key} className={`census-row${r.muted ? " muted" : ""}`}>
          <span className="census-ic">
            {r.art ? (
              r.tires ? (
                <TiredArt path={r.art} stamina={p.army.stamina} size={52} title={r.label} race={p.race} />
              ) : (
                <Art path={r.art} size={52} title={r.label} race={p.race} />
              )
            ) : (
              <span className="census-glyph">{r.glyph}</span>
            )}
          </span>
          <span className="census-label">
            {r.label}
            {r.bare && <BareBadge arm={r.label.toLowerCase()} tiers={r.bare} />}
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
        <div className="census-stamina">
          Stamina <b>{p.army.stamina}</b>/100 — the host looks <b>{tiredLabel(p.army.stamina)}</b>.
          Rest them and the kit comes back with them.
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
          hiring is a one-time price with no wage to pay, they take a Muster Hall bed like anyone
          else, and they <b>count as neither population nor ranking</b>.
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
