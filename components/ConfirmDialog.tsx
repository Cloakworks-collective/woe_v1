"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Btn } from "@/components/Btn";
import { CmdForm } from "@/components/CmdForm";

/**
 * A briefing that has to be read before an irreversible order fires.
 *
 * The game has a handful of moves you get once — moving your dawn, stepping out
 * of the age — and a plain button is the wrong control for any of them: the
 * cost is never on the button, and by the time the herald explains it the thing
 * is done. This gathers the order, states its price in the player's own numbers,
 * and only then submits it.
 *
 * TWO DETAILS THAT ARE EASY TO GET WRONG, and are the reason this is shared
 * rather than copied per caller:
 *
 *   · The confirm button is the submit button of a server-action form living
 *     INSIDE the dialog. Closing on click would unmount that form mid-flight
 *     and throw away the result the herald is waiting to announce. So we close
 *     when the order LANDS — `settledKey` changes — not when it is clicked.
 *   · A command that FAILS leaves the dialog open, which is where the player
 *     wants to be: the reason is in the banner and their choices are still on
 *     screen.
 */
export function ConfirmDialog({
  label,
  buttonClassName = "btn",
  disabled,
  title,
  children,
  confirmLabel,
  confirmClassName = "btn cdlg-go",
  cancelLabel = "Not yet",
  cmd,
  settledKey,
}: {
  /** The trigger button's text. */
  label: ReactNode;
  buttonClassName?: string;
  disabled?: boolean;
  title: ReactNode;
  /** The briefing itself. */
  children: ReactNode;
  confirmLabel: ReactNode;
  confirmClassName?: string;
  cancelLabel?: string;
  /** The command the confirm button submits. `fields` are read at render, so a
   *  caller may compute them from its own state right up until the click. */
  cmd: { name: string; path: string; fields?: Record<string, string> };
  /** Any value that CHANGES once the server has applied the order. When it
   *  changes while the dialog is open, the dialog closes itself. */
  settledKey: string | number | boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const openedWith = useRef(settledKey);

  // Escape closes, and focus lands inside so the dialog is reachable by
  // keyboard alone. The scrim closes on click for the same reason.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close when the order lands — see the note at the top of this file.
  useEffect(() => {
    if (open && openedWith.current !== settledKey) setOpen(false);
  }, [open, settledKey]);

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        disabled={disabled}
        onClick={() => {
          openedWith.current = settledKey;
          setOpen(true);
        }}
        aria-haspopup="dialog"
      >
        {label}
      </button>

      {open && (
        <div className="cdlg-scrim" onClick={() => setOpen(false)} role="presentation">
          <div
            className="cdlg"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cdlg-title"
            tabIndex={-1}
            ref={panelRef}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="cdlg-title" className="cdlg-title">
              {title}
            </h3>
            {children}
            <div className="cdlg-actions">
              <button type="button" className="btn btn-no" onClick={() => setOpen(false)}>
                {cancelLabel}
              </button>
              <CmdForm name={cmd.name} path={cmd.path}>
                {Object.entries(cmd.fields ?? {}).map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}
                <Btn className={confirmClassName}>{confirmLabel}</Btn>
              </CmdForm>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
