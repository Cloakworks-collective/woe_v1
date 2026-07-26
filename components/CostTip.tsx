import type { ReactNode } from "react";
import { ResIcon } from "./ResIcon";

type CostKey = "wood" | "stone" | "ore" | "gold";

/**
 * A hover/focus tooltip that lays a cost out as a small table — resource, the
 * amount needed, and how much you have — with the rows you're short on turned
 * red. Wraps a button (or any trigger); reuses the shared `.tip`/`.tip-pop`
 * popover machinery. Pairs with the green/red (affordable/can't-afford) buttons.
 */
type Cost = { gold: number; wood: number; stone: number; ore: number };

const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

export function CostTip({
  heading,
  cost,
  have,
  children,
}: {
  heading?: string;
  cost: Cost;
  have: Cost;
  children: ReactNode;
}) {
  const order: [CostKey, string][] = [
    ["wood", "Wood"],
    ["stone", "Stone"],
    ["ore", "Ore"],
    ["gold", "Gold"],
  ];
  const rows = order
    .filter(([k]) => cost[k] > 0)
    .map(([k, label]) => ({ kind: k, label, need: cost[k], got: have[k] }));

  return (
    <span className="tip" tabIndex={0}>
      {children}
      <span className="tip-pop costtip" role="tooltip">
        {heading && <b>{heading}</b>}
        <table className="costtip-tbl">
          <thead>
            <tr>
              <th>Cost</th>
              <th className="num">Need</th>
              <th className="num">You have</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.kind} className={r.got < r.need ? "short" : ""}>
                <td>
                  <ResIcon kind={r.kind} size={16} /> {r.label}
                </td>
                <td className="num">{fmt(r.need)}</td>
                <td className="num">{fmt(r.got)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </span>
    </span>
  );
}
