import Link from "next/link";
import { CurvePanel } from "@/components/CurvePanel";
import { RefTables } from "@/components/RefTables";
import {
  CATEGORIES,
  curvesInCategory,
  scalarsInCategory,
  tablesInCategory,
  groupsInCategory,
  defaultCurve,
} from "@/lib/balance/catalog";

export const metadata = {
  title: "The Codex of Balance — War of Empires",
  description: "Every curve and constant that governs the realm, charted and explained.",
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

export default async function AlmanacPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const active = CATEGORIES.find((cat) => cat.key === c) ?? CATEGORIES[0];

  const curves = curvesInCategory(active.key);
  const scalars = scalarsInCategory(active.key);
  const tables = tablesInCategory(active.key);
  const scalarGroups = groupsInCategory(active.key)
    .map((g) => ({ group: g, items: scalars.filter((s) => s.group === g) }))
    .filter((x) => x.items.length);

  return (
    <main className="almanac">
      {/* masthead */}
      <header className="almanac-head">
        <div className="almanac-crest" aria-hidden>
          ⚖
        </div>
        <div className="almanac-title">
          <p className="almanac-kicker">The realm laid bare</p>
          <h1>The Codex of Balance</h1>
          <p className="almanac-lede">
            Every formula and figure that governs War of Empires, charted and explained — the growth of
            settlers, the price of stone, the reach of a caravan. The Crown may retune these between ages.
          </p>
        </div>
        <nav className="almanac-nav">
          <Link href="/guide">📜 Field Manual</Link>
          <Link href="/login">⚔ Enter the realm</Link>
        </nav>
      </header>

      {/* category tabs */}
      <nav className="cat-tabs" aria-label="Balance categories">
        {CATEGORIES.map((cat) => (
          <Link
            key={cat.key}
            href={`/almanac?c=${cat.key}`}
            className={`cat-tab${cat.key === active.key ? " is-active" : ""}`}
          >
            <span className="cat-tab-icon" aria-hidden>
              {cat.icon}
            </span>
            {cat.label}
          </Link>
        ))}
      </nav>

      {/* selected category */}
      <section className="almanac-cat">
        <p className="almanac-cat-blurb">{active.blurb}</p>

        {curves.length > 0 && (
          <div className="cpanel-stack">
            {curves.map((meta) => (
              <CurvePanel key={meta.key} meta={meta} initial={defaultCurve(meta.key)} />
            ))}
          </div>
        )}

        {scalarGroups.length > 0 && (
          <div className="almanac-scalars">
            {scalarGroups.map(({ group, items }) => (
              <section key={group} className="scalar-card">
                <h3 className="scalar-card-head">{group}</h3>
                <ul>
                  {items.map((s) => (
                    <li key={s.key} className="scalar-row">
                      <div className="scalar-row-top">
                        <span className="scalar-row-label">{s.label}</span>
                        <span className="scalar-row-value">
                          <b>{s.pct ? pct(s.value) : s.value.toLocaleString("en-US")}</b>
                          {!s.pct && <span className="scalar-row-unit"> {s.unit}</span>}
                        </span>
                      </div>
                      <p className="scalar-row-desc">{s.desc}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        {tables.length > 0 && <RefTables tables={tables} />}
      </section>

      <footer className="almanac-foot">
        <span>Figures reflect the current age. The Crown may retune them at each rollover.</span>
        <Link href="/guide">Back to the Field Manual →</Link>
      </footer>
    </main>
  );
}
