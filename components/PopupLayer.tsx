"use client";

import { useEffect } from "react";

/**
 * One rule for every popover in the game: only one open at a time, and a click
 * anywhere outside shuts it.
 *
 * The popovers are native `<details>` elements — chosen so the ladder's forty
 * rows need no client JS to work at all. The cost of that choice is that a
 * `<details>` only ever closes by clicking its own summary again: open the
 * Attack menu on one empire, then Spy on another, and you are left with two
 * menus hanging open over the table with no way to dismiss either except
 * retracing your clicks.
 *
 * `TopNav` already carried this logic for its own dropdowns. Mounting it once
 * here instead means every popover behaves the same way, and a new one gets the
 * behaviour by wearing a class rather than by remembering to copy an effect.
 *
 * MANAGED CLASSES ARE AN ALLOWLIST, on purpose. Some `<details>` in the app are
 * deliberate accordions, not popovers — the calculators' "show the workings"
 * sections (`calc-more`) and the magic-key reveal — and auto-closing those when
 * a player clicks elsewhere on the page would be actively hostile. A popover is
 * transient and floats over content; an accordion is part of the page.
 */
const POPOVERS = ["act", "aid", "wc-confirm", "topnav-dd"] as const;
const SELECTOR = POPOVERS.map((c) => `details.${c}[open]`).join(", ");

export function PopupLayer() {
  useEffect(() => {
    const open = () => Array.from(document.querySelectorAll<HTMLDetailsElement>(SELECTOR));

    /**
     * One at a time. `toggle` does not bubble, but it still has a capture
     * phase, so a single capturing listener on the document sees every one —
     * which is what lets this work for popovers rendered long after mount.
     */
    const onToggle = (e: Event) => {
      const el = e.target as HTMLDetailsElement | null;
      if (!el || el.tagName !== "DETAILS" || !el.open) return;
      if (!POPOVERS.some((c) => el.classList.contains(c))) return;
      for (const d of open()) if (d !== el) d.open = false;
    };

    /** Click outside — anything not inside the open popover itself. */
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node | null;
      for (const d of open()) if (!t || !d.contains(t)) d.open = false;
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      for (const d of open()) d.open = false;
    };

    document.addEventListener("toggle", onToggle, true);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("toggle", onToggle, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return null;
}
