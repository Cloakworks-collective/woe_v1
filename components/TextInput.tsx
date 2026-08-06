"use client";

import { useEffect, useState } from "react";
import { useFormReset } from "@/components/CmdForm";

/**
 * A free-text field for command forms that empties itself once the command
 * lands. Commands no longer navigate, so a sent message would otherwise stay
 * in the box as though it still needed sending. Opt-in on purpose: radio pills
 * and selects keep the choice you made, which a blanket form.reset() would lose.
 */
export function TextInput({
  name,
  ariaLabel,
  placeholder,
  maxLength,
  width = 320,
}: {
  name: string;
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  width?: number | string;
}) {
  const [value, setValue] = useState("");
  const doneCount = useFormReset();

  useEffect(() => {
    if (doneCount > 0) setValue("");
  }, [doneCount]);

  return (
    <input
      name={name}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      aria-label={ariaLabel}
      maxLength={maxLength}
      autoComplete="off"
      style={{ font: "14.5px Verdana", padding: 3, width, maxWidth: "100%" }}
    />
  );
}
