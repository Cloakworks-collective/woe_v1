"use client";

import { useEffect } from "react";

type Snap = { playerId: string; tick: number } & Record<"gold" | "food" | "wood" | "stone" | "ore" | "turns", number>;

const KEYS = ["gold", "food", "wood", "stone", "ore", "turns"] as const;
const fmt = (n: number) => Math.floor(Math.abs(n)).toLocaleString("en-US");

/**
 * D13 — resource tick feedback. On a fresh load, diffs the current top-bar
 * figures against a per-player snapshot in localStorage; for every value that
 * moved since the previous TICK, floats a "+1,250 / −40" chip up from that
 * resource cell (and a brief gold glint on a gold gain). Renders nothing itself
 * — the chips are appended imperatively to the `[data-res]` cells the server
 * already drew, so the numbers are never hidden behind an animation.
 */
export function ResourceDeltas(snap: Snap) {
  useEffect(() => {
    const key = `woe_res_${snap.playerId}`;
    let prev: Snap | null = null;
    try {
      const raw = localStorage.getItem(key);
      if (raw) prev = JSON.parse(raw) as Snap;
      localStorage.setItem(key, JSON.stringify(snap));
    } catch {
      return; // no storage → no deltas, and definitely no crash
    }

    // Only celebrate real between-tick change; skip first-ever load and
    // same-tick navigations, and respect reduced-motion.
    if (!prev || prev.tick === snap.tick) return;
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const k of KEYS) {
      const d = snap[k] - (prev[k] ?? snap[k]);
      if (!d) continue;
      const cell = document.querySelector<HTMLElement>(`[data-res="${k}"]`);
      if (!cell) continue;

      const chip = document.createElement("span");
      chip.className = `res-delta ${d > 0 ? "res-delta-up" : "res-delta-down"}`;
      chip.textContent = `${d > 0 ? "+" : "−"}${fmt(d)}`;
      chip.setAttribute("aria-hidden", "true");
      cell.appendChild(chip);
      chip.addEventListener("animationend", () => chip.remove(), { once: true });
      // Safety net if animationend never fires (tab backgrounded, etc.).
      timers.push(setTimeout(() => chip.remove(), 2600));

      if (k === "gold" && d > 0) {
        cell.classList.add("res-glint");
        timers.push(setTimeout(() => cell.classList.remove("res-glint"), 1200));
      }
    }
    return () => timers.forEach(clearTimeout);
    // Snapshot values are the whole identity of this effect run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
