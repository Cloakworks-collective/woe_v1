"use client";

import { useEffect } from "react";

/**
 * Keep hover tooltips on screen.
 *
 * `.tip-pop` is centred on its anchor and can be 340px wide, so one hanging
 * off a control near the right edge used to widen the page — the document now
 * clips that instead, which only turns "the page scrolls sideways" into "the
 * tooltip is cut in half". CSS can't measure the distance to the viewport
 * edge, and the `:first-child` / `:last-child` anchors only catch tooltips at
 * the ends of a row, not one sitting mid-paragraph in a right-hand column.
 *
 * So nudge it: on hover or focus, measure the popover and give it just enough
 * margin to sit inside the viewport. This composes with whichever anchoring
 * rule applies rather than replacing it, and is mounted once for the whole
 * app — no per-tooltip wiring, and server components keep rendering plain
 * markup.
 */
const EDGE = 8;

export function TipNudge() {
  useEffect(() => {
    const nudge = (e: Event) => {
      const tip = (e.target as Element | null)?.closest?.(".tip");
      if (!tip) return;
      const pop = tip.querySelector<HTMLElement>(".tip-pop");
      if (!pop) return;

      // Clear last time's nudge before measuring, or each hover compounds.
      pop.style.left = "";
      pop.style.right = "";
      const r = pop.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const delta = r.right > vw - EDGE ? vw - EDGE - r.right : r.left < EDGE ? EDGE - r.left : 0;
      if (!delta) return;

      // The anchoring rules set `left` and `right` together, which stretches
      // the box between the two and swallows any margin you give it. Pin one
      // edge and drive the other, so the shift actually lands.
      const from = parseFloat(getComputedStyle(pop).left) || 0;
      pop.style.right = "auto";
      pop.style.left = `${from + delta}px`;
    };
    // Capture, because `pointerover`/`focusin` bubble but the popover may be
    // rebuilt by a re-render between hovers.
    document.addEventListener("pointerover", nudge, true);
    document.addEventListener("focusin", nudge, true);
    return () => {
      document.removeEventListener("pointerover", nudge, true);
      document.removeEventListener("focusin", nudge, true);
    };
  }, []);
  return null;
}
