import { describe, expect, it } from "vitest";
import { runDueTicks, tickHealth } from "./world";
import { seedWorld } from "./world";

/** The heartbeat's contract is that it is safe to fire twice, late, or never.
 *  These pin that down, because a cron that is not idempotent is worse than no
 *  cron at all — it corrupts quietly and only under load. */
describe("the tick heartbeat is idempotent", () => {
  const at = (iso: string) => new Date(iso);

  function world(lastTickAt: string) {
    const w = seedWorld();
    w.meta.lastTickAt = lastTickAt;
    w.meta.tickNumber = 0;
    return w;
  }

  it("pays exactly what is owed, and a second immediate call does nothing", () => {
    const w = world("2026-01-01T00:00:00.000Z");
    const first = runDueTicks(w, at("2026-01-01T01:00:00.000Z")); // 60 min = 6 ticks
    expect(first).toBe(6);
    expect(w.meta.tickNumber).toBe(6);

    // Firing again at the same instant finds nothing due. This is the whole
    // safety property: there is no cursor to double-advance.
    const second = runDueTicks(w, at("2026-01-01T01:00:00.000Z"));
    expect(second).toBe(0);
    expect(w.meta.tickNumber).toBe(6);
  });

  it("a late run catches up to exactly the same place as many punctual ones", () => {
    const punctual = world("2026-01-01T00:00:00.000Z");
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    for (let i = 1; i <= 6; i++) {
      runDueTicks(punctual, new Date(start + i * 10 * 60_000));
    }
    const late = world("2026-01-01T00:00:00.000Z");
    runDueTicks(late, at("2026-01-01T01:00:00.000Z"));

    expect(late.meta.tickNumber).toBe(punctual.meta.tickNumber);
    expect(late.meta.lastTickAt).toBe(punctual.meta.lastTickAt);
  });

  it("reports how far behind the clock is, so a dead cron is visible", () => {
    const w = world("2026-01-01T00:00:00.000Z");
    const h = tickHealth(w, at("2026-01-01T02:00:00.000Z"));
    expect(h.behind).toBe(12);
    expect(h.minutesBehind).toBe(120);
    expect(h.losingTime).toBe(false);
  });

  it("flags when the backlog has passed the cap and time is being lost for good", () => {
    const w = world("2026-01-01T00:00:00.000Z");
    // Three weeks of silence — past the 2,016-tick (two-week) replay cap.
    const h = tickHealth(w, at("2026-01-22T00:00:00.000Z"));
    expect(h.losingTime).toBe(true);
  });
});
