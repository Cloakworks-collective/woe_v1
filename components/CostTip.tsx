import type { ReactNode } from "react";
import { ResIcon } from "./ResIcon";

type CostKey = "wood" | "stone" | "ore" | "gold";

/**
 * A hover/focus tooltip that lays a requirement out as a small table — what a
 * click needs, the amount, and how much you have — with the rows you're short
 * on turned red. Wraps a button (or any trigger); reuses the shared
 * `.tip`/`.tip-pop` popover machinery. Pairs with the green/red
 * (affordable/can't-afford) buttons.
 *
 * `ReqTip` is the general form — each row carries its own icon, so it handles
 * peasants, beds, and muster slots as well as gold/wood/stone/ore. `CostTip` is
 * the convenience wrapper for a plain four-resource cost.
 */
type Cost = { gold: number; wood: number; stone: number; ore: number };

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

/** One thing a click needs: an icon, a label, the amount, and what you hold. */
export type Req = { icon: ReactNode; label: string; need: number; have: number };

export function ReqTip({
  heading,
  body,
  rows,
  note,
  disabledReason,
  down,
  children,
}: {
  heading?: string;
  /** What the click does — a line of prose above the cost table. */
  body?: ReactNode;
  /** The need-vs-have table. Omit for an action with no measurable cost. */
  rows?: Req[];
  /** Small print under the table — e.g. "× the number you enter". */
  note?: ReactNode;
  /** When the button is disabled, why — rendered as a red callout. */
  disabledReason?: ReactNode;
  /** Open below the trigger instead of above (for top-of-page bars). */
  down?: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`tip${down ? " tip-down" : ""}`} tabIndex={0}>
      {children}
      <span className="tip-pop costtip" role="tooltip">
        {heading && <b>{heading}</b>}
        {body && <span className="costtip-body">{body}</span>}
        {rows && rows.length > 0 && (
          <table className="costtip-tbl">
            <thead>
              <tr>
                <th>Needs</th>
                <th className="num">Need</th>
                <th className="num">You have</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={r.have < r.need ? "short" : ""}>
                  <td>
                    {r.icon} {r.label}
                  </td>
                  <td className="num">{fmt(r.need)}</td>
                  <td className="num">{fmt(r.have)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {note && <span className="costtip-note">{note}</span>}
        {disabledReason && (
          <span className="costtip-blocked">
            <span aria-hidden="true">🔒</span> {disabledReason}
          </span>
        )}
      </span>
    </span>
  );
}

export function CostTip({
  heading,
  body,
  cost,
  have,
  note,
  disabledReason,
  children,
}: {
  heading?: string;
  body?: ReactNode;
  cost: Cost;
  have: Cost;
  note?: ReactNode;
  disabledReason?: ReactNode;
  children: ReactNode;
}) {
  const order: [CostKey, string][] = [
    ["wood", "Wood"],
    ["stone", "Stone"],
    ["ore", "Ore"],
    ["gold", "Gold"],
  ];
  const rows: Req[] = order
    .filter(([k]) => cost[k] > 0)
    .map(([k, label]) => ({
      icon: <ResIcon kind={k} size={16} />,
      label,
      need: cost[k],
      have: have[k],
    }));

  return (
    <ReqTip heading={heading} body={body} rows={rows} note={note} disabledReason={disabledReason}>
      {children}
    </ReqTip>
  );
}
