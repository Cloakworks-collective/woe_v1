import { describe, expect, it, vi } from "vitest";
import { commitWithRetry } from "./world";
import { WorldConflictError, type World } from "./store";

// Minimal stand-in worlds — commitWithRetry only hands them to our test apply.
const fakeWorld = (tag: string) => ({ tag } as unknown as World);
const tagOf = (w: World) => (w as unknown as { tag: string }).tag;

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
      { load, save },
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
      commitWithRetry(() => ({ result: 1, dirty: true }), { load, save, maxAttempts: 3 }),
    ).rejects.toBeInstanceOf(WorldConflictError);
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("propagates a non-conflict save error immediately (no retry)", async () => {
    const load = vi.fn(async () => fakeWorld("w"));
    const save = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(
      commitWithRetry(() => ({ result: 1, dirty: true }), { load, save }),
    ).rejects.toThrow(/db down/);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
