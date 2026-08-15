"use client";

import { useEffect, useRef, useState } from "react";
import { useFormReset } from "@/components/CmdForm";

/**
 * The composing box for letters and the halls.
 *
 * A letter is not a chat line — people write paragraphs, quote terms, list
 * what they want for the ore. A one-line <input> made all of that invisible
 * while you typed it. This is the same auto-emptying field as TextInput (a
 * sent letter must not sit in the box looking unsent), grown to a real
 * textarea: Enter makes a newline, ⌘/Ctrl+Enter sends.
 */
export function TextArea({
  name,
  ariaLabel,
  placeholder,
  maxLength,
  rows = 4,
}: {
  name: string;
  ariaLabel: string;
  placeholder?: string;
  maxLength?: number;
  rows?: number;
}) {
  const [value, setValue] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const doneCount = useFormReset();

  useEffect(() => {
    if (doneCount > 0) setValue("");
  }, [doneCount]);

  return (
    <div className="comms-write">
      <textarea
        ref={ref}
        name={name}
        rows={rows}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            ref.current?.form?.requestSubmit();
          }
        }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        maxLength={maxLength}
        className="comms-write-box"
      />
      {maxLength && (
        <span className="comms-write-count">
          {value.length}/{maxLength} · ⌘/Ctrl+Enter sends
        </span>
      )}
    </div>
  );
}
