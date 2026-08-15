import type { ReactNode } from "react";
import { glyphs } from "./Glyph";

/** A framed icon + label + value tile — the visual replacement for rows of
 * `dl.kv` stat text. Group several inside a `.stat-grid`. */
export function StatTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "good" | "warn" | "bad";
}) {
  // A tile that needs explaining is wrapped in <StatTip>, which renders a real
  // styled bubble. A native `title` was tried and is not good enough for a
  // multi-row breakdown — see the note in StatTip.
  return (
    <div className={`stat-tile${tone ? ` ${tone}` : ""}`}>
      {icon != null && <span className="stat-icon">{glyphs(icon)}</span>}
      <span className="stat-body">
        <span className="stat-label">{glyphs(label)}</span>
        <span className="stat-value">{value}</span>
        {sub != null && <span className="stat-sub">{sub}</span>}
      </span>
    </div>
  );
}
