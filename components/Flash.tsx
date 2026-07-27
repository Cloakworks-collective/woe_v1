"use client";

import { useEffect, useState } from "react";

/**
 * The herald's banner: command results delivered as a scroll that slides down,
 * then (for good news) quietly withdraws after a few breaths. Errors stay put
 * until dismissed. The ?ok/?err query is stripped from the URL on arrival so a
 * refresh doesn't re-announce old tidings.
 */
export function Flash({ err, ok }: { err?: string; ok?: string }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!err && !ok) return;
    // Old news shouldn't survive a refresh — drop the flash params, keep the rest.
    const url = new URL(window.location.href);
    if (url.searchParams.has("err") || url.searchParams.has("ok")) {
      url.searchParams.delete("err");
      url.searchParams.delete("ok");
      window.history.replaceState(null, "", url.toString());
    }
    if (ok && !err) {
      const t = setTimeout(() => setOpen(false), 6500);
      return () => clearTimeout(t);
    }
  }, [err, ok]);

  if ((!err && !ok) || !open) return null;
  return (
    <div className={`flash ${err ? "flash-err" : "flash-ok"}`} role={err ? "alert" : "status"}>
      <span className="flash-icon" aria-hidden="true">
        {err ? "⚠" : "✓"}
      </span>
      <span className="flash-body">{err ?? ok}</span>
      <button type="button" className="flash-x" aria-label="Dismiss" onClick={() => setOpen(false)}>
        ✕
      </button>
    </div>
  );
}
