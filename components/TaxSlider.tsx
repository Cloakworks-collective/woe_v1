"use client";

import { Btn } from "./Btn";
import { useState } from "react";
import { ReqTip } from "./CostTip";

/**
 * Tax dial as a live slider. Lives inside the setTax CmdForm (the hidden
 * __cmd/__path inputs come from CmdForm); submits the same `rate` field.
 * Shows the gold/production trade-off as you drag, and submits on release.
 */
export function TaxSlider({
  taxRate,
  civilians,
  rate: controlled,
  onRate,
}: {
  taxRate: number;
  civilians: number;
  /** Controlled mode: the owner holds the rate so other figures can move with
   *  it (see TaxAndRates). Left out, the slider keeps its own. */
  rate?: number;
  onRate?: (r: number) => void;
}) {
  const [own, setOwn] = useState(taxRate);
  const rate = controlled ?? own;
  const setRate = (r: number) => (onRate ? onRate(r) : setOwn(r));
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
        <ReqTip
          heading="Decree the tax rate"
          body={`Set tax to ${Math.round(rate * 100)}% — the crown skims about ${goldPerTurn}🪙/turn from your people, but producers work at ${outputPct}% output. Higher tax, more gold, less production.`}
          note={changed ? undefined : "Drag the slider to a new rate first — this applies the shown value."}
        >
          <Btn className="btn" style={{ opacity: changed ? 1 : 0.6 }}>
            Decree
          </Btn>
        </ReqTip>
      </div>
    </div>
  );
}
