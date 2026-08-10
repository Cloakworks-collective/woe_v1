import type { ReactNode } from "react";
import { glyphs } from "@/components/Glyph";

/** A labeled pixel-fill meter — the visual replacement for bare numbers like
 * stamina, army experience, food balance, or population vs housing. */
export function Meter({
  label,
  value,
  max,
  display,
  icon,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  display?: ReactNode; // overrides the "value / max" readout
  icon?: ReactNode;
  tone?: "good" | "warn" | "bad";
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, Math.round((value / max) * 100))) : 0;
  const state = tone ?? (pct >= 66 ? "good" : pct >= 33 ? "warn" : "bad");
  return (
    <div className="meter">
      <div className="meter-head">
        <span className="meter-label">
          {icon != null && <span className="meter-icon">{glyphs(icon)}</span>}
          {glyphs(label)}
        </span>
        <span className="meter-num">
          {display ?? `${value.toLocaleString("en-US")} / ${max.toLocaleString("en-US")}`}
        </span>
      </div>
      <span className={`bar meter-track ${state}`}>
        <i style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}
