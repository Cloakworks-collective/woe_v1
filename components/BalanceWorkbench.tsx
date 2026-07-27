"use client";

import { useMemo, useState } from "react";
import type { Curve } from "@/lib/constants/curves";
import {
  CATEGORIES,
  CURVES,
  SCALARS,
  curvesInCategory,
  scalarsInCategory,
  tablesInCategory,
  groupsInCategory,
  defaultCurve,
} from "@/lib/balance/catalog";
import { CurvePanel } from "./CurvePanel";
import { RefTables } from "./RefTables";

/**
 * The Crown's tuning bench, split into category tabs so each screen stays
 * readable. Every curve and scalar is editable; charts redraw live as you type.
 * Nothing here writes to the running game — it produces an overrides diff you
 * Export (destined for world.meta.balanceOverrides once runtime overrides land).
 */
export function BalanceWorkbench() {
  const [tab, setTab] = useState(CATEGORIES[0].key);
  const [curveEdits, setCurveEdits] = useState<Record<string, Curve>>({});
  const [scalarEdits, setScalarEdits] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  const diff = useMemo(() => {
    const curves: Record<string, Curve> = {};
    for (const c of CURVES) {
      const edited = curveEdits[c.key];
      if (edited && JSON.stringify(edited) !== JSON.stringify(defaultCurve(c.key))) curves[c.key] = edited;
    }
    const scalars: Record<string, number> = {};
    for (const s of SCALARS) {
      const v = scalarEdits[s.key];
      if (v !== undefined && v !== s.value && Number.isFinite(v)) scalars[s.key] = v;
    }
    return { curves, scalars };
  }, [curveEdits, scalarEdits]);

  const changeCount = Object.keys(diff.curves).length + Object.keys(diff.scalars).length;
  const payload = JSON.stringify(diff, null, 2);

  // per-category pending badge
  const pendingIn = (cat: string) => {
    const cKeys = new Set(curvesInCategory(cat).map((c) => c.key));
    const sKeys = new Set(scalarsInCategory(cat).map((s) => s.key));
    return (
      Object.keys(diff.curves).filter((k) => cKeys.has(k)).length +
      Object.keys(diff.scalars).filter((k) => sKeys.has(k)).length
    );
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payload);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked — the textarea below is the fallback */
    }
  };
  const reset = () => {
    setCurveEdits({});
    setScalarEdits({});
  };

  const active = CATEGORIES.find((c) => c.key === tab) ?? CATEGORIES[0];
  const curves = curvesInCategory(active.key);
  const tables = tablesInCategory(active.key);
  const scalarGroups = groupsInCategory(active.key)
    .map((g) => ({ group: g, items: scalarsInCategory(active.key).filter((s) => s.group === g) }))
    .filter((x) => x.items.length);

  return (
    <div className="workbench">
      {/* sticky diff bar */}
      <div className={`wb-bar${changeCount ? " has-changes" : ""}`}>
        <div className="wb-bar-left">
          {changeCount ? (
            <>
              <strong>{changeCount}</strong> pending change{changeCount === 1 ? "" : "s"}
              <span className="wb-bar-hint"> — preview only; nothing is live yet</span>
            </>
          ) : (
            <span className="wb-bar-hint">Tweak any shape or value — charts redraw as you type</span>
          )}
        </div>
        <div className="wb-bar-actions">
          <button type="button" className="btn-ghost" onClick={copy} disabled={!changeCount}>
            {copied ? "✓ copied" : "⧉ copy overrides"}
          </button>
          <button type="button" className="btn-ghost" onClick={reset} disabled={!changeCount}>
            ↺ reset all
          </button>
        </div>
      </div>

      {/* category tabs */}
      <nav className="cat-tabs" aria-label="Balance categories">
        {CATEGORIES.map((cat) => {
          const n = pendingIn(cat.key);
          return (
            <button
              key={cat.key}
              type="button"
              className={`cat-tab${cat.key === active.key ? " is-active" : ""}`}
              onClick={() => setTab(cat.key)}
            >
              <span className="cat-tab-icon" aria-hidden>
                {cat.icon}
              </span>
              {cat.label}
              {n > 0 && <span className="cat-tab-badge">{n}</span>}
            </button>
          );
        })}
      </nav>

      <p className="almanac-cat-blurb">{active.blurb}</p>

      {/* curve editors */}
      {curves.length > 0 && (
        <div className="cpanel-stack">
          {curves.map((meta) => (
            <CurvePanel
              key={meta.key}
              meta={meta}
              initial={curveEdits[meta.key] ?? defaultCurve(meta.key)}
              baseline={defaultCurve(meta.key)}
              editable
              onChange={(c) => setCurveEdits((p) => ({ ...p, [meta.key]: c }))}
            />
          ))}
        </div>
      )}

      {/* scalar editors */}
      {scalarGroups.length > 0 && (
        <section className="wb-section">
          {scalarGroups.map(({ group, items }) => (
            <div key={group} className="wb-scalar-group">
              <h3 className="wb-h3">{group}</h3>
              <div className="wb-scalars">
                {items.map((s) => {
                  const cur = scalarEdits[s.key] ?? s.value;
                  const changed = cur !== s.value;
                  return (
                    <div key={s.key} className={`wb-scalar${changed ? " is-dirty" : ""}`}>
                      <div className="wb-scalar-top">
                        <span className="wb-scalar-label">{s.label}</span>
                        <span className="wb-scalar-input">
                          <input
                            type="number"
                            value={s.pct ? Math.round(cur * 1000) / 1000 : cur}
                            step={s.step ?? (s.pct ? 0.05 : 1)}
                            min={s.min}
                            max={s.max}
                            onChange={(e) => setScalarEdits((p) => ({ ...p, [s.key]: parseFloat(e.target.value) }))}
                          />
                          <span className="wb-scalar-unit">{s.unit}</span>
                        </span>
                      </div>
                      <p className="wb-scalar-desc">{s.desc}</p>
                      {changed && (
                        <button
                          type="button"
                          className="wb-scalar-reset"
                          onClick={() => setScalarEdits((p) => { const n = { ...p }; delete n[s.key]; return n; })}
                        >
                          ↺ reset — was {s.pct ? `${Math.round(s.value * 100)}%` : s.value.toLocaleString("en-US")}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* reference tables */}
      {tables.length > 0 && (
        <section className="wb-section">
          <h3 className="wb-h3">Reference tables — read-only</h3>
          <RefTables tables={tables} />
        </section>
      )}

      {/* export payload */}
      <section className="wb-section">
        <h3 className="wb-h3">Overrides export — all categories</h3>
        <p className="wb-note">
          The sparse diff below gathers every pending change across all tabs. It's destined for{" "}
          <code>world.meta.balanceOverrides</code> once per-era runtime overrides ship; until then, apply a
          change by editing <code>lib/constants/balance.ts</code> to match.
        </p>
        <textarea className="wb-export" readOnly rows={Math.min(20, payload.split("\n").length)} value={payload} />
      </section>
    </div>
  );
}
