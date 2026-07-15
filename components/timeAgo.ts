import type { WorldMeta } from "@/lib/server/store";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Anything with a tick, and optionally a wall-clock stamp (inbox items, battles). */
type Stamped = { tick: number; at?: string };

/**
 * Real elapsed time since a tiding was recorded. Prefers the wall-clock stamp
 * (`at`); for older events that predate it, falls back to game-time from the
 * tick delta (one turn = 10 minutes) plus the real time since the last tick.
 */
export function eventAgeMs(item: Stamped, meta: WorldMeta): number {
  if (item.at) return Math.max(0, Date.now() - new Date(item.at).getTime());
  const turnsAgo = Math.max(0, meta.tickNumber - item.tick);
  let ms = turnsAgo * 10 * MIN;
  if (meta.lastTickAt) ms += Math.max(0, Date.now() - new Date(meta.lastTickAt).getTime());
  return ms;
}

/** "just now" · "42s ago" · "18m ago" · "3h 20m ago" · "2d 4h ago". */
export function timeAgo(item: Stamped, meta: WorldMeta): string {
  const ms = eventAgeMs(item, meta);
  const s = Math.floor(ms / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(ms / MIN);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(ms / HOUR);
  if (h < 24) {
    const rm = Math.floor((ms % HOUR) / MIN);
    return rm ? `${h}h ${rm}m ago` : `${h}h ago`;
  }
  const d = Math.floor(ms / DAY);
  const rh = Math.floor((ms % DAY) / HOUR);
  return rh ? `${d}d ${rh}h ago` : `${d}d ago`;
}
