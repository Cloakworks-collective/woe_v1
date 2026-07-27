"use client";

import { useEffect, useState } from "react";

/**
 * A live mm:ss countdown to the next game turn, seeded from the last tick's
 * wall-clock time. The world ticks lazily (on the next request after the
 * 10 minutes elapse), so at zero it reads "any moment" rather than lying
 * with negative time.
 */
export function TickCountdown({ lastTickAt, turnMinutes = 10 }: { lastTickAt: string; turnMinutes?: number }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now()); // render nothing on the server / first paint — no hydration mismatch
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (now === null) return null;
  const next = new Date(lastTickAt).getTime() + turnMinutes * 60 * 1000;
  const left = Math.floor((next - now) / 1000);
  if (Number.isNaN(next)) return null;
  if (left <= 0) return <span className="tick-count"> · next turn any moment</span>;
  const m = Math.floor(left / 60);
  const s = left % 60;
  return (
    <span className="tick-count">
      {" "}
      · next turn in {m}:{String(s).padStart(2, "0")}
    </span>
  );
}
