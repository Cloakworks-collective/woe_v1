"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CmdResult } from "@/app/actions";

/**
 * The herald, decoupled from the URL.
 *
 * Commands used to announce themselves by redirecting with ?ok/?err, which
 * meant every action was a navigation — and a navigation resets scroll. Now a
 * command returns its outcome, any CmdForm hands it to this provider, and the
 * banner appears pinned to the viewport wherever the reader happens to be.
 */
const FlashCtx = createContext<(r: CmdResult) => void>(() => {});

export function useFlash() {
  return useContext(FlashCtx);
}

export function FlashProvider({ children }: { children: ReactNode }) {
  const [flash, setFlash] = useState<CmdResult>(null);
  const notify = useCallback((r: CmdResult) => setFlash(r), []);

  // Good news withdraws on its own; a warning stays until dismissed.
  useEffect(() => {
    if (!flash || !flash.ok) return;
    const t = setTimeout(() => setFlash(null), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <FlashCtx.Provider value={notify}>
      {children}
      {flash?.message && (
        <div className="flash-dock">
          <div className={`flash ${flash.ok ? "flash-ok" : "flash-err"}`} role={flash.ok ? "status" : "alert"}>
            <span className="flash-icon" aria-hidden="true">
              {flash.ok ? "✓" : "⚠"}
            </span>
            <span className="flash-body">{flash.message}</span>
            <button type="button" className="flash-x" aria-label="Dismiss" onClick={() => setFlash(null)}>
              ✕
            </button>
          </div>
        </div>
      )}
    </FlashCtx.Provider>
  );
}
