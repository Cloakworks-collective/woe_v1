"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import { glyphs } from "@/components/Glyph";

/**
 * A submit button that knows its form is in flight. While the server action
 * runs it disables itself and shows a spinning hourglass (the action-turns
 * glyph) so every command click gives instant feedback. Drop-in replacement
 * for <button> inside any CmdForm / server-action form.
 */
export function Btn({
  children,
  className = "btn",
  disabled,
  confirmText,
  onClick,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Ask before submitting. For the handful of PERMANENT buttons — discharge
   *  and dismissal have no refund and no undo — where the tooltip explains the
   *  price but a stray tap on a phone would still pay it. */
  confirmText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      {...rest}
      onClick={(e) => {
        if (confirmText && !window.confirm(confirmText)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      className={`${className}${pending ? " btn-pending" : ""}`}
      disabled={disabled || pending}
    >
      {pending && (
        <span className="btn-hourglass" aria-hidden="true">
          ⌛
        </span>
      )}
      {glyphs(children)}
    </button>
  );
}
