import type { PricePoint } from "@/lib/server/store";

/** A parchment-styled SVG line chart of hourly market prices. */
export function PriceChart({
  title,
  series,
  color = "var(--green)",
}: {
  title: string;
  series: PricePoint[];
  color?: string;
}) {
  const W = 420;
  const H = 168;
  const PAD = { l: 40, r: 46, t: 22, b: 22 };
  const points = series.filter((s) => s.p !== null) as { t: number; p: number }[];
  const gid = `pc-${title.replace(/[^a-z]/gi, "")}`;

  let body: React.ReactNode;
  if (points.length < 2) {
    body = (
      <text x={W / 2} y={H / 2} textAnchor="middle" fontSize={12} fontStyle="italic" fill="var(--ink-soft)">
        awaiting caravans…
      </text>
    );
  } else {
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    const rawMax = Math.max(...points.map((d) => d.p));
    const rawMin = Math.min(...points.map((d) => d.p));
    const pMax = rawMax * 1.15;
    const pMin = Math.max(0, rawMin - (rawMax - rawMin) * 0.15);
    const x = (t: number) =>
      PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (p: number) =>
      H - PAD.b - ((p - pMin) / Math.max(1e-9, pMax - pMin)) * (H - PAD.t - PAD.b);
    const path = points.map((d, i) => `${i === 0 ? "M" : "L"}${x(d.t).toFixed(1)},${y(d.p).toFixed(1)}`).join(" ");
    const area = `${path} L${x(t1).toFixed(1)},${H - PAD.b} L${x(t0).toFixed(1)},${H - PAD.b} Z`;
    const last = points[points.length - 1];
    const first = points[0];
    const hi = points.reduce((a, d) => (d.p > a.p ? d : a), points[0]);
    const lo = points.reduce((a, d) => (d.p < a.p ? d : a), points[0]);

    const gridPrices = [pMin + (pMax - pMin) * 0.75, pMin + (pMax - pMin) * 0.5, pMin + (pMax - pMin) * 0.25];
    // Prices are whole gold per unit (2–50) — never show a decimal.
    const fnum = (n: number) => Math.round(n).toString();

    // Trend since the first recorded point.
    const delta = last.p - first.p;
    const pct = first.p > 0 ? (delta / first.p) * 100 : 0;
    const up = delta >= 0;
    const trendColor = up ? "var(--green-dark)" : "var(--red)";

    body = (
      <>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.34} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* horizontal gridlines + y labels */}
        {gridPrices.map((gp) => (
          <g key={gp}>
            <line x1={PAD.l} y1={y(gp)} x2={W - PAD.r} y2={y(gp)} stroke="var(--border-light)" strokeDasharray="2 4" strokeWidth={0.7} />
            <text x={PAD.l - 5} y={y(gp) + 3.5} textAnchor="end" fontSize={9.5} fill="var(--ink-soft)">
              {fnum(gp)}
            </text>
          </g>
        ))}

        {/* area + line */}
        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

        {/* high / low markers */}
        <circle cx={x(hi.t)} cy={y(hi.p)} r={2.6} fill="none" stroke={color} strokeWidth={1.2} />
        <text x={x(hi.t)} y={y(hi.p) - 6} textAnchor="middle" fontSize={9} fontWeight="bold" fill={color}>
          ▲{fnum(hi.p)}
        </text>
        {lo.t !== hi.t && (
          <>
            <circle cx={x(lo.t)} cy={y(lo.p)} r={2.6} fill="none" stroke="var(--ink-soft)" strokeWidth={1.2} />
            <text x={x(lo.t)} y={y(lo.p) + 13} textAnchor="middle" fontSize={9} fill="var(--ink-soft)">
              ▼{fnum(lo.p)}
            </text>
          </>
        )}

        {/* current price marker + pill */}
        <line x1={x(last.t)} y1={PAD.t} x2={x(last.t)} y2={H - PAD.b} stroke={color} strokeDasharray="1 3" strokeWidth={0.7} opacity={0.5} />
        <circle cx={x(last.t)} cy={y(last.p)} r={3.4} fill={color} stroke="var(--input-bg)" strokeWidth={1.5} />
        <g>
          <rect x={W - PAD.r + 2} y={y(last.p) - 9} width={PAD.r - 4} height={18} rx={3} fill={color} />
          <text x={W - 2} y={y(last.p) + 3.5} textAnchor="end" fontSize={10.5} fontWeight="bold" fill="#fff">
            {fnum(last.p)}
          </text>
        </g>

        {/* x-axis turn labels */}
        <text x={PAD.l} y={H - 6} fontSize={9.5} fill="var(--ink-soft)">
          turn {t0}
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize={9.5} fill="var(--ink-soft)">
          turn {t1}
        </text>

        {/* trend badge, top-right */}
        <text x={W - PAD.r} y={PAD.t - 8} textAnchor="end" fontSize={11} fontWeight="bold" fill={trendColor}>
          {up ? "▲" : "▼"} {up ? "+" : ""}{fnum(pct)}%
        </text>
      </>
    );
  }

  return (
    <div className="pricechart">
      <div className="pricechart-title">{title}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
        {body}
      </svg>
    </div>
  );
}
