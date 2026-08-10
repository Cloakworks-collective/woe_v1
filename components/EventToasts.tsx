"use client";

import { useEffect, useState } from "react";
import { Glyph, glyphs } from "@/components/Glyph";

export interface ToastItem {
  tick: number;
  tone: string;
  glyph: string | null; // /art/tones/<tone>.png when the tone has a sprite
  line: string;
}

const GLYPH_TONES = new Set(["war", "shadow", "danger", "growth", "trade", "clan", "info"]);
// Weightier tidings linger; routine ones fade fast.
const LINGER: Record<string, number> = { war: 11000, danger: 11000, shadow: 9000, crown: 9000, clan: 8000 };

/**
 * D14 — event toasts. New tidings since the reader last loaded a page slide in
 * (newest first, capped) with their tone sprite, then withdraw on their own.
 * Purely additive over the Chronicle, which still holds the full record;
 * localStorage remembers the last tick toasted so nothing repeats.
 */
export function EventToasts({ playerId, items }: { playerId: string; items: ToastItem[] }) {
  const [shown, setShown] = useState<ToastItem[]>([]);
  const [exiting, setExiting] = useState<Set<ToastItem>>(new Set());

  const dismiss = (t: ToastItem) => {
    setExiting((e) => new Set(e).add(t));
    setTimeout(() => {
      setShown((s) => s.filter((x) => x !== t));
      setExiting((e) => {
        const n = new Set(e);
        n.delete(t);
        return n;
      });
    }, 380); // match the CSS toast-out duration
  };

  useEffect(() => {
    if (!items.length) return;
    const key = `woe_seen_${playerId}`;
    let lastSeen: number | null = null;
    try {
      const raw = localStorage.getItem(key);
      lastSeen = raw === null ? null : Number(raw);
    } catch {
      return;
    }
    const maxTick = items.reduce((m, i) => Math.max(m, i.tick), lastSeen ?? 0);
    try {
      localStorage.setItem(key, String(maxTick));
    } catch {
      /* ignore */
    }
    if (lastSeen === null) return; // first load establishes a baseline — no wall of toasts
    if (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const fresh = items.filter((i) => i.tick > lastSeen!).slice(0, 4);
    if (fresh.length) setShown(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!shown.length) return;
    const timers = shown.map((t, i) => setTimeout(() => dismiss(t), (LINGER[t.tone] ?? 7000) + i * 400));
    return () => timers.forEach(clearTimeout);
  }, [shown]);

  if (!shown.length) return null;

  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {shown.map((t, i) => (
        <div key={`${t.tick}-${i}`} className={`toast toast-${t.tone}${exiting.has(t) ? " toast-exit" : ""}`}>
          {t.glyph && GLYPH_TONES.has(t.tone) ? (
            <img className="toast-glyph" src={t.glyph} alt="" width={26} height={26} />
          ) : (
            <span className="toast-glyph toast-glyph-emoji" aria-hidden="true"><Glyph char="👑" /></span>
          )}
          <span className="toast-body">{glyphs(t.line)}</span>
          <button type="button" className="toast-x" aria-label="Dismiss" onClick={() => dismiss(t)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
