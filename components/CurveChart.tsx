import { evalCurve, type Curve } from "@/lib/constants/curves";

const fmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1000) return Math.round(n).toLocaleString("en-US");
  if (a >= 10) return n.toFixed(0);
  if (a >= 1) return n.toFixed(1);
  return n.toFixed(2);
};

/**
 * A parchment SVG line chart of a balance Curve sampled over [xMin, xMax].
 * Pure (no hooks) so it renders in server pages AND re-renders live in the
 * client workbench. Optionally overlays a faint "before" curve to show a tweak.
 */
export function CurveChart({
  curve,
  xMin,
  xMax,
  xStep,
  xLabel,
  yUnit,
  color = "var(--gold)",
  baseline,
  height = 300,
}: {
  curve: Curve;
  xMin: number;
  xMax: number;
  xStep: number;
  xLabel?: string;
  yUnit?: string;
  color?: string;
  /** A ghosted reference curve drawn behind (e.g. the compiled default). */
  baseline?: Curve;
  height?: number;
}) {
  const W = 640;
  const H = height;
  const PAD = { l: 70, r: 22, t: 26, b: 46 };

  const xs: number[] = [];
  for (let x = xMin; x <= xMax + 1e-9; x += xStep) xs.push(Math.round(x * 1e6) / 1e6);

  const sample = (c: Curve) => xs.map((x) => ({ x, y: evalCurve(c, x) }));

  let pts: { x: number; y: number }[] = [];
  let basePts: { x: number; y: number }[] = [];
  let bad = false;
  try {
    pts = sample(curve);
    if (baseline) basePts = sample(baseline);
  } catch {
    bad = true;
  }

  if (bad || pts.length < 2 || pts.some((p) => !Number.isFinite(p.y))) {
    return (
      <div className="curvechart">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
          <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={16} fontStyle="italic" fill="var(--warn)">
            invalid curve — check the formula
          </text>
        </svg>
      </div>
    );
  }

  const allY = [...pts, ...basePts].map((p) => p.y);
  const rawMax = Math.max(...allY, 0);
  const rawMin = Math.min(...allY, 0);
  const yMax = rawMax === rawMin ? rawMax + 1 : rawMax + (rawMax - rawMin) * 0.1;
  const yMin = rawMin - (rawMax - rawMin) * 0.06;

  const x = (v: number) => PAD.l + ((v - xMin) / Math.max(1e-9, xMax - xMin)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - ((v - yMin) / Math.max(1e-9, yMax - yMin)) * (H - PAD.t - PAD.b);
  const line = (p: { x: number; y: number }[]) =>
    p.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.x).toFixed(1)},${y(d.y).toFixed(1)}`).join(" ");
  const path = line(pts);
  const area = `${path} L${x(xMax).toFixed(1)},${y(Math.max(0, yMin))} L${x(xMin).toFixed(1)},${y(Math.max(0, yMin))} Z`;

  // 4 horizontal gridlines with value labels
  const gridYs = [0.2, 0.4, 0.6, 0.8, 1].map((f) => yMin + (yMax - yMin) * f);
  // ~5 x-axis ticks
  const nTicks = Math.min(6, xs.length);
  const xTicks = Array.from({ length: nTicks }, (_, i) => xMin + ((xMax - xMin) * i) / (nTicks - 1));

  const last = pts[pts.length - 1];
  const first = pts[0];
  const gid = `cc-${Math.round(x(0) + yMax + H)}`;

  return (
    <div className="curvechart">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.32} />
            <stop offset="100%" stopColor={color} stopOpacity={0.03} />
          </linearGradient>
        </defs>

        {/* axes */}
        <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={H - PAD.b} stroke="var(--border-light)" strokeWidth={1.2} />
        <line x1={PAD.l} y1={H - PAD.b} x2={W - PAD.r} y2={H - PAD.b} stroke="var(--border-light)" strokeWidth={1.2} />

        {gridYs.map((gy, i) => (
          <g key={i}>
            <line x1={PAD.l} y1={y(gy)} x2={W - PAD.r} y2={y(gy)} stroke="var(--border-light)" strokeDasharray="2 5" strokeWidth={0.7} />
            <text x={PAD.l - 9} y={y(gy) + 4} textAnchor="end" fontSize={12.5} fill="var(--ink-soft)">
              {fmt(gy)}
            </text>
          </g>
        ))}

        {xTicks.map((tx, i) => (
          <text key={i} x={x(tx)} y={H - PAD.b + 20} textAnchor="middle" fontSize={12.5} fill="var(--ink-soft)">
            {fmt(tx)}
          </text>
        ))}

        {/* baseline ghost (the default), if given and different */}
        {basePts.length > 1 && (
          <path d={line(basePts)} fill="none" stroke="var(--ink-soft)" strokeWidth={1.6} strokeDasharray="4 4" opacity={0.55} />
        )}

        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth={2.8} strokeLinejoin="round" strokeLinecap="round" />

        {/* endpoint markers */}
        <circle cx={x(first.x)} cy={y(first.y)} r={3.6} fill={color} />
        <circle cx={x(last.x)} cy={y(last.y)} r={4.4} fill={color} stroke="var(--input-bg)" strokeWidth={1.8} />
        <text x={x(last.x)} y={y(last.y) - 11} textAnchor="end" fontSize={14} fontWeight="bold" fill={color}>
          {fmt(last.y)}
        </text>

        {/* axis titles */}
        {xLabel && (
          <text x={(PAD.l + W - PAD.r) / 2} y={H - 8} textAnchor="middle" fontSize={12.5} fontStyle="italic" fill="var(--ink-soft)">
            {xLabel} →
          </text>
        )}
        {yUnit && (
          <text x={PAD.l - 9} y={PAD.t - 10} textAnchor="start" fontSize={12} fontStyle="italic" fill="var(--ink-soft)">
            {yUnit}
          </text>
        )}
      </svg>
    </div>
  );
}
