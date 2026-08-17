"use client";

import { useEffect, useState } from "react";
import { useFormReset } from "@/components/CmdForm";

/**
 * A count field for command forms: numeric keyboard on mobile, plus a Max chip
 * so large empires never type six digits by hand. `max` (when known) powers
 * that chip; the server still has the final word, so this is a convenience.
 *
 * Empties itself once its form's command succeeds — commands no longer navigate,
 * so nothing else would clear a spent amount out of the box.
 */
export function CountInput({
  name = "count",
  ariaLabel,
  // "qty", not "#": a lone hash mark was never a label, and it is the only
  // hint these boxes give — the aria-label serves screen readers but sighted
  // players got a glyph to guess at.
  placeholder = "qty",
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

  // Bumped by the enclosing CmdForm each time its command lands successfully.
  const doneCount = useFormReset();
  useEffect(() => {
    if (doneCount > 0) setValue("");
  }, [doneCount]);

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
      {chips && !disabled && cap !== undefined && cap > 0 && (
        <span className="countin-chips" aria-hidden="true">
          <button
            type="button"
            className="chip chip-max"
            tabIndex={-1}
            title={`Max: ${cap.toLocaleString("en-US")}`}
            onClick={() => setValue(String(cap))}
          >
            Max
          </button>
        </span>
      )}
    </span>
  );
}
