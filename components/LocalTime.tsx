"use client";

import { useEffect, useState } from "react";

/**
 * An instant, told in the reader's own clock.
 *
 * The server cannot know the reader's timezone, so this renders on the client
 * only: until it mounts it shows the relative form ("in 9.3 hours"), which is
 * true everywhere and identical on both sides of hydration. Rendering the local
 * form during SSR would be a guaranteed mismatch — the server would print the
 * host's timezone and React would warn on every page load.
 */
export function LocalTime({ atMs }: { atMs: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    // The realm moves in ten-minute turns; a minute is plenty fine-grained to
    // keep "in 3.2 hours" honest without re-rendering the panel constantly.
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const hours = Math.max(0, (atMs - (now ?? atMs)) / 3_600_000);
  const relative = now === null ? "" : hours < 1 ? `in ${Math.round(hours * 60)} min` : `in ${hours.toFixed(1)} h`;

  if (now === null) return <span suppressHydrationWarning>soon</span>;

  const d = new Date(atMs);
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const tomorrow = d.getDate() !== new Date(now).getDate();

  return (
    <span suppressHydrationWarning>
      {relative} — {hhmm}
      {tomorrow ? " tomorrow" : ""} <span className="dawn-lt">Local Time</span>
    </span>
  );
}
