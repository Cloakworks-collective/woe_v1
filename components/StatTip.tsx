import type { ReactNode } from "react";

export type StatTipRow = {
  label: string;
  /** Already formatted — the caller decides on "+" and thousands separators. */
  value: string;
  /** The figures that produced it, in one short phrase. */
  detail?: string;
};

/**
 * A hover bubble that breaks a headline figure into its parts.
 *
 * It uses the shared `.tip` / `.tip-pop` popover machinery (CSS-only, so a
 * server component can render it) but NOT the `costtip` table. That table is
 * built for a three-column need-vs-have list of short labels, and a nine-row
 * breakdown carrying a sentence of explanation per row came out as a cramped
 * grey wall. This lays the same data out as rows: name and points on one line,
 * the reason beneath in small type, a rule between each, and a total at the
 * foot.
 *
 * Rows worth nothing are dimmed rather than dropped. "Research: +0" is a real
 * answer to "why is my score low" — arguably the most useful line in the list —
 * and hiding it would leave the reader wondering whether it counted at all.
 */
export function StatTip({
  heading,
  total,
  rows,
  note,
  down = true,
  children,
}: {
  heading: string;
  /** The figure the parts add up to, shown in the foot. */
  total?: string;
  rows: StatTipRow[];
  note?: ReactNode;
  /** Drop below the trigger. Default, since these sit near the top of a page. */
  down?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`tip${down ? " tip-down" : ""} stat-tip`} tabIndex={0}>
      {children}
      <span className="tip-pop stat-tip-pop" role="tooltip">
        <b className="stat-tip-head">{heading}</b>
        <span className="stat-tip-rows">
          {rows.map((r, i) => (
            <span className={`stat-tip-row${r.value.endsWith("0") && /^\+?0$/.test(r.value) ? " is-nil" : ""}`} key={i}>
              <span className="stat-tip-line">
                <span className="stat-tip-label">{r.label}</span>
                <span className="stat-tip-value">{r.value}</span>
              </span>
              {r.detail && <span className="stat-tip-detail">{r.detail}</span>}
            </span>
          ))}
        </span>
        {total && (
          <span className="stat-tip-total">
            <span>Total</span>
            <span>{total}</span>
          </span>
        )}
        {note && <span className="stat-tip-note">{note}</span>}
      </span>
    </span>
  );
}
