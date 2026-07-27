"use client";

import { useState } from "react";
import type { Curve } from "@/lib/constants/curves";
import { CurveChart } from "./CurveChart";
import { sampleCurve, type CurveMeta } from "@/lib/balance/catalog";

const KINDS: Curve["kind"][] = ["constant", "linear", "geometric", "exponential", "polynomial", "steps", "expr"];

const fmtY = (n: number) => {
  if (!Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1000) return Math.round(n).toLocaleString("en-US");
  if (a >= 10) return n.toFixed(0);
  if (a >= 1) return n.toFixed(1);
  return n.toFixed(2);
};
const fmtX = (n: number, step: number) => (step >= 1 ? Math.round(n).toString() : n.toFixed(1));

/** A blank curve of a given kind, seeded from the current one where sensible. */
function morph(kind: Curve["kind"], prev: Curve): Curve {
  switch (kind) {
    case "constant":
      return { kind, value: "value" in prev ? (prev as { value: number }).value : 1 };
    case "linear":
      return { kind, base: 0, perX: 1 };
    case "geometric":
      return { kind, base: 1, ratio: 1.5 };
    case "exponential":
      return { kind, base: 1, rate: 0.1 };
    case "polynomial":
      return { kind, coefficients: [0, 0, 100] };
    case "steps":
      return { kind, points: [[0, 1], [5, 10]] };
    case "expr":
      return { kind, formula: "x" };
  }
}

function Num({ label, value, onChange, step = 0.1 }: { label: string; value: number; onChange: (n: number) => void; step?: number }) {
  return (
    <label className="cp-field">
      <span>{label}</span>
      <input type="number" value={Number.isFinite(value) ? value : 0} step={step} onChange={(e) => onChange(parseFloat(e.target.value))} />
    </label>
  );
}

function Params({ curve, set }: { curve: Curve; set: (c: Curve) => void }) {
  switch (curve.kind) {
    case "constant":
      return <Num label="value" value={curve.value} onChange={(v) => set({ ...curve, value: v })} />;
    case "linear":
      return (
        <>
          <Num label="base (y at x=0)" value={curve.base} onChange={(v) => set({ ...curve, base: v })} />
          <Num label="slope (per x)" value={curve.perX} onChange={(v) => set({ ...curve, perX: v })} />
        </>
      );
    case "geometric":
      return (
        <>
          <Num label="base" value={curve.base} onChange={(v) => set({ ...curve, base: v })} />
          <Num label="ratio (× each step)" value={curve.ratio} step={0.05} onChange={(v) => set({ ...curve, ratio: v })} />
        </>
      );
    case "exponential":
      return (
        <>
          <Num label="base" value={curve.base} onChange={(v) => set({ ...curve, base: v })} />
          <Num label="rate" value={curve.rate} step={0.01} onChange={(v) => set({ ...curve, rate: v })} />
        </>
      );
    case "polynomial":
      return (
        <label className="cp-field cp-wide">
          <span>coefficients — c0, c1, c2 … (lowest power first)</span>
          <input
            type="text"
            defaultValue={curve.coefficients.join(", ")}
            onChange={(e) => {
              const coefficients = e.target.value.split(",").map((s) => parseFloat(s.trim())).filter((n) => Number.isFinite(n));
              if (coefficients.length) set({ ...curve, coefficients });
            }}
          />
        </label>
      );
    case "steps":
      return (
        <label className="cp-field cp-wide">
          <span>points — one “x y” pair per line</span>
          <textarea
            rows={4}
            defaultValue={curve.points.map(([x, y]) => `${x} ${y}`).join("\n")}
            onChange={(e) => {
              const points = e.target.value
                .split("\n")
                .map((ln) => ln.trim().split(/[\s,]+/).map(Number))
                .filter((p) => p.length === 2 && p.every(Number.isFinite)) as [number, number][];
              if (points.length) set({ ...curve, points });
            }}
          />
        </label>
      );
    case "expr":
      return (
        <label className="cp-field cp-wide">
          <span>formula in x — e.g. 2000 * 1.3 ^ (x - 1)</span>
          <input type="text" defaultValue={curve.formula} onChange={(e) => set({ ...curve, formula: e.target.value })} />
        </label>
      );
  }
}

/**
 * One curve, fully explained. Left: a large live chart. Right: what you're
 * looking at (the two axes in words), an "at a glance" table of sample values,
 * and — when `editable` — the shape selector + parameters that redraw the chart
 * on every keystroke, ghosting the compiled default behind the edited line.
 */
export function CurvePanel({
  meta,
  initial,
  baseline,
  editable = false,
  onChange,
}: {
  meta: CurveMeta;
  /** Starting value shown in the controls (may be a persisted prior edit). */
  initial: Curve;
  /** The compiled default to diff against & ghost behind. Defaults to `initial`. */
  baseline?: Curve;
  editable?: boolean;
  onChange?: (c: Curve) => void;
}) {
  const [curve, setCurve] = useState<Curve>(initial);
  const base = baseline ?? initial;
  const dirty = editable && JSON.stringify(curve) !== JSON.stringify(base);

  const update = (c: Curve) => {
    setCurve(c);
    onChange?.(c);
  };

  const samples = sampleCurve(curve, meta, 6);

  return (
    <article className={`cpanel${dirty ? " is-dirty" : ""}`}>
      <header className="cpanel-head">
        <h3>{meta.label}</h3>
        {editable && dirty && (
          <button type="button" className="cp-reset" onClick={() => update(base)}>
            ↺ reset to default
          </button>
        )}
      </header>

      <p className="cpanel-desc">{meta.desc}</p>

      <div className="cpanel-body">
        <div className="cpanel-chart">
          <CurveChart
            curve={curve}
            baseline={dirty ? base : undefined}
            xMin={meta.xMin}
            xMax={meta.xMax}
            xStep={meta.xStep}
            xLabel={meta.xLabel}
            yUnit={meta.yUnit}
            color={dirty ? "var(--red)" : "var(--gold)"}
          />
          {dirty && (
            <p className="cpanel-legend">
              <span className="cpanel-legend-new">— edited</span>
              <span className="cpanel-legend-old">--- current default</span>
            </p>
          )}
        </div>

        <div className="cpanel-side">
          <dl className="cpanel-axes">
            <div>
              <dt>Horizontal (x)</dt>
              <dd>{meta.xLabel}</dd>
            </div>
            <div>
              <dt>Vertical (y)</dt>
              <dd>{meta.yUnit}</dd>
            </div>
          </dl>

          {editable && (
            <div className="cpanel-editor">
              <label className="cp-field">
                <span>shape</span>
                <select value={curve.kind} onChange={(e) => update(morph(e.target.value as Curve["kind"], curve))}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </label>
              <Params curve={curve} set={update} />
            </div>
          )}

          <figure className="cpanel-glance">
            <figcaption>At a glance</figcaption>
            <table>
              <thead>
                <tr>
                  <th>{meta.xLabel.length > 22 ? "x" : meta.xLabel}</th>
                  <th>{meta.yUnit}</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((s, i) => (
                  <tr key={i}>
                    <td>{fmtX(s.x, meta.xStep)}</td>
                    <td>{fmtY(s.y)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </figure>

          {meta.note && <p className="cpanel-note">{meta.note}</p>}
        </div>
      </div>
    </article>
  );
}
