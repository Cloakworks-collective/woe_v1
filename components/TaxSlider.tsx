"use client";

import { useState } from "react";

/**
 * Tax dial as a live slider. Lives inside the setTax CmdForm (the hidden
 * __cmd/__path inputs come from CmdForm); submits the same `rate` field.
 * Shows the gold/production trade-off as you drag, and submits on release.
 */
export function TaxSlider({ taxRate, civilians }: { taxRate: number; civilians: number }) {
  const [rate, setRate] = useState(taxRate);
  const goldPerTurn = Math.round(civilians * 0.4 * rate * 10) / 10;
  const outputPct = Math.round((1 - rate) * 100);
  const changed = Math.abs(rate - taxRate) > 1e-9;

  return (
    <div className="slider-wrap">
      <div className="slider-readout">
        Tax <span style={{ color: "var(--heading)" }}>{Math.round(rate * 100)}%</span>{" "}
        <span className="muted">
          → +{goldPerTurn}🪙/turn · producers at {outputPct}% output
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="range"
          name="rate"
          min={0}
          max={1}
          step={0.05}
          value={rate}
          aria-label="Tax rate"
          onChange={(e) => setRate(Number(e.target.value))}
          onPointerUp={(e) => e.currentTarget.form?.requestSubmit()}
          onKeyUp={(e) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button className="btn" style={{ opacity: changed ? 1 : 0.6 }}>
          Decree
        </button>
      </div>
    </div>
  );
}
