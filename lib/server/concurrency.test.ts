import { describe, expect, it, vi } from "vitest";
import { commitWithRetry, retryDelayMs } from "./world";
import { carryWorldVersion, cloneWorld, worldVersion, WorldConflictError, type World } from "./store";

// Minimal stand-in worlds — commitWithRetry only hands them to our test apply.
const fakeWorld = (tag: string) => ({ tag } as unknown as World);
const tagOf = (w: World) => (w as unknown as { tag: string }).tag;

// Don't spend the real backoff in tests.
const noSleep = async () => {};

// A counter world, for the isolation tests below.
const counter = (n = 0) => ({ n } as unknown as World);
const countOf = (w: World) => (w as unknown as { n: number }).n;
const bump = (w: World) => {
  (w as unknown as { n: number }).n += 1;
  return { result: "ok", dirty: true };
};

describe("commitWithRetry — optimistic concurrency (§14.1)", () => {
  it("a read-only pass (dirty:false) never saves", async () => {
    const save = vi.fn(async () => {});
    const load = vi.fn(async () => fakeWorld("w"));
    const r = await commitWithRetry(() => ({ result: 42, dirty: false }), { load, save });
    expect(r).toBe(42);
    expect(save).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("commits on the first try when there is no conflict", async () => {
    const save = vi.fn(async () => {});
    const load = vi.fn(async () => fakeWorld("w"));
    let applies = 0;
    const r = await commitWithRetry(
      () => {
        applies++;
        return { result: "ok", dirty: true };
      },
      { load, save },
    );
    expect(r).toBe("ok");
    expect(applies).toBe(1);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("reloads a FRESH world and replays apply after a conflict, then commits", async () => {
    const load = vi.fn(async (force: boolean) => fakeWorld(force ? "fresh" : "stale"));
    let saveAttempt = 0;
    const save = vi.fn(async () => {
      if (++saveAttempt === 1) throw new WorldConflictError();
    });
    const appliedAgainst: string[] = [];
    const r = await commitWithRetry(
      (w) => {
        appliedAgainst.push(tagOf(w));
        return { result: "done", dirty: true };
      },
      { load, save, sleep: noSleep },
    );
    expect(r).toBe("done");
    expect(save).toHaveBeenCalledTimes(2);
    // First attempt: cached load (force=false); retry: forced fresh reload.
    expect(load).toHaveBeenNthCalledWith(1, false);
    expect(load).toHaveBeenNthCalledWith(2, true);
    expect(appliedAgainst).toEqual(["stale", "fresh"]); // replayed on the winner's state
  });

  it("gives up with a WorldConflictError after maxAttempts", async () => {
    const load = vi.fn(async () => fakeWorld("w"));
    const save = vi.fn(async () => {
      throw new WorldConflictError();
    });
    await expect(
      commitWithRetry(() => ({ result: 1, dirty: true }), {
        load,
        save,
        maxAttempts: 3,
        sleep: noSleep,
      }),
    ).rejects.toBeInstanceOf(WorldConflictError);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("propagates a non-conflict save error immediately (no retry)", async () => {
    const load = vi.fn(async () => fakeWorld("w"));
    const save = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(
      commitWithRetry(() => ({ result: 1, dirty: true }), { load, save, sleep: noSleep }),
    ).rejects.toThrow(/db down/);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

// `getWorld` hands back the SHARED cached object, and under Fluid Compute
// concurrent requests share one Node instance. These pin the isolation that
// makes replay safe rather than cumulative.
describe("commitWithRetry — draft isolation", () => {
  it("apply mutates a private copy, never the shared cached world", async () => {
    const shared = counter(0); // what getWorld() keeps handing out
    const saved: number[] = [];
    await commitWithRetry(bump, {
      load: async () => shared,
      save: async (w) => void saved.push(countOf(w)),
      sleep: noSleep,
    });
    expect(saved).toEqual([1]);
    expect(countOf(shared)).toBe(0); // the cache was not touched
  });

  it("a replay after a lost CAS applies ONCE, not on top of the last attempt", async () => {
    // The regression: with load() returning the shared object and no copy, the
    // first attempt's +1 stayed on it, so the replay saved 2 — the command
    // counted twice. Gold spent twice, a battle resolved twice.
    const shared = counter(0);
    const saved: number[] = [];
    let attempts = 0;
    await commitWithRetry(bump, {
      load: async () => shared,
      save: async (w) => {
        saved.push(countOf(w));
        if (++attempts === 1) throw new WorldConflictError();
      },
      sleep: noSleep,
    });
    expect(saved).toEqual([1, 1]);
  });

  it("backs off between attempts and not before the first", async () => {
    const waits: number[] = [];
    let attempts = 0;
    await commitWithRetry(bump, {
      load: async () => counter(0),
      save: async () => {
        if (++attempts === 1) throw new WorldConflictError();
      },
      sleep: async (ms) => void waits.push(ms),
    });
    expect(waits).toHaveLength(1); // one retry, one wait
  });
});

describe("retryDelayMs — full jitter", () => {
  it("grows exponentially and stays inside the cap", () => {
    // rand()=1 is the ceiling of the jitter window for that attempt.
    expect(retryDelayMs(1, () => 0.999_999)).toBe(24); // ~25ms
    expect(retryDelayMs(2, () => 0.999_999)).toBe(49); // ~50ms
    expect(retryDelayMs(3, () => 0.999_999)).toBe(99); // ~100ms
    expect(retryDelayMs(9, () => 0.999_999)).toBe(399); // capped at 400ms
  });

  it("jitters down to zero — the point is decorrelating the herd", () => {
    expect(retryDelayMs(4, () => 0)).toBe(0);
  });
});

describe("world version tagging", () => {
  it("a clone carries the version it was loaded at", () => {
    const w = fakeWorld("w");
    carryWorldVersion(counter(0), w); // untagged source leaves it untagged
    expect(worldVersion(w)).toBeUndefined();

    const loaded = fakeWorld("loaded");
    carryWorldVersion(w, loaded);
    expect(worldVersion(loaded)).toBeUndefined();
  });

  it("cloneWorld deep-copies and preserves the tag", () => {
    const original = { meta: { tickNumber: 3 } } as unknown as World;
    const copy = cloneWorld(original);
    (copy as unknown as { meta: { tickNumber: number } }).meta.tickNumber = 99;
    expect((original as unknown as { meta: { tickNumber: number } }).meta.tickNumber).toBe(3);
    expect(worldVersion(copy)).toBe(worldVersion(original));
  });
});
