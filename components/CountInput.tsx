"use client";

import { useState } from "react";

/**
 * A count field for command forms: numeric keyboard on mobile, plus quick-fill
 * chips (+10 · +100 · Max) so large empires never type six digits by hand.
 * `max` (when known) powers the Max chip and caps the quick-adds; it's the
 * server that has the final word, so this is purely a convenience.
 */
export function CountInput({
  name = "count",
  ariaLabel,
  placeholder = "#",
  size = 4,
  max,
  form,
  disabled,
  chips = true,
}: {
  name?: string;
  ariaLabel: string;
  placeholder?: string;
  size?: number;
  /** Highest sensible value (affordable / available). Enables the Max chip. */
  max?: number;
  form?: string;
  disabled?: boolean;
  /** Set false for tight spots where the chips don't fit. */
  chips?: boolean;
}) {
  const [value, setValue] = useState("");
  const cap = max !== undefined && Number.isFinite(max) ? Math.max(0, Math.floor(max)) : undefined;
  const add = (n: number) => {
    const cur = parseInt(value, 10) || 0;
    const next = cap !== undefined ? Math.min(cur + n, cap) : cur + n;
    setValue(String(next));
  };
  return (
    <span className="countin">
      <input
        name={name}
        form={form}
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ""))}
        placeholder={placeholder}
        aria-label={ariaLabel}
        size={size}
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        className="countin-field"
      />
      {chips && !disabled && (
        <span className="countin-chips" aria-hidden="true">
          <button type="button" className="chip" tabIndex={-1} onClick={() => add(10)}>
            +10
          </button>
          <button type="button" className="chip" tabIndex={-1} onClick={() => add(100)}>
            +100
          </button>
          {cap !== undefined && cap > 0 && (
            <button type="button" className="chip chip-max" tabIndex={-1} title={`Max: ${cap.toLocaleString("en-US")}`} onClick={() => setValue(String(cap))}>
              Max
            </button>
          )}
        </span>
      )}
    </span>
  );
}
