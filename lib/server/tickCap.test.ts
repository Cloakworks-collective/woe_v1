import { describe, expect, it } from "vitest";
import { REQUEST_CATCH_UP_CAP, runDueTicks, seedWorld } from "./world";

describe("a request absorbs a hiccup; the cron runs the marathon", () => {
  const behind = (ticks: number) => {
    const w = seedWorld();
    w.meta.lastTickAt = new Date(Date.now() - ticks * 10 * 60 * 1000 - 30_000).toISOString();
    return w;
  };

  it("the request cap processes only its share and leaves the rest DUE", () => {
    const w = behind(REQUEST_CATCH_UP_CAP + 20);
    const processed = runDueTicks(w, new Date(), REQUEST_CATCH_UP_CAP);
    expect(processed).toBe(REQUEST_CATCH_UP_CAP);
    // lastTickAt advanced only over what actually ran — the remainder is still
    // owed and the next pass (or the cron) collects it. Capping must defer,
    // never discard: discarding is the 2,016 deep-cap's job alone.
    const again = runDueTicks(w, new Date(), REQUEST_CATCH_UP_CAP);
    expect(again).toBe(REQUEST_CATCH_UP_CAP);
  });

  it("uncapped, the same world catches up in one pass", () => {
    const w = behind(REQUEST_CATCH_UP_CAP + 20);
    expect(runDueTicks(w)).toBe(REQUEST_CATCH_UP_CAP + 20);
  });
});
