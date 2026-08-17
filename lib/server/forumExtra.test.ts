import { describe, expect, it } from "vitest";
import { getReadMap, getThreadExtra, markRead, mutateThreadExtra, toggleReaction } from "./forumExtra";

// File mode throughout — tests never carry Supabase env. The ids are
// UUID-shaped because anything else is refused before it reaches a row id.
const T = "11111111-2222-3333-4444-555555555555";
const P = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const ME = "99999999-8888-7777-6666-555555555555";

describe("the forum's side store", () => {
  it("toggles a reaction on and off again", async () => {
    await toggleReaction(T, P, "⚔️", ME);
    expect((await getThreadExtra(T)).posts[P].reactions?.["⚔️"]).toEqual([ME]);
    await toggleReaction(T, P, "⚔️", ME);
    // An empty set is removed outright, so a post nobody reacts to carries no
    // reactions key at all.
    expect((await getThreadExtra(T)).posts[P].reactions?.["⚔️"]).toBeUndefined();
  });

  it("keeps reply links and edit stamps beside the reactions", async () => {
    await mutateThreadExtra(T, (x) => {
      (x.posts[P] ??= {}).replyTo = { postId: "x", n: 4, handle: "Keyholder" };
      x.posts[P].editedAt = "2026-08-16T00:00:00.000Z";
      return x;
    });
    const x = await getThreadExtra(T);
    expect(x.posts[P].replyTo?.n).toBe(4);
    expect(x.posts[P].editedAt).toBeTruthy();
  });

  it("read markers only ever move forward", async () => {
    await markRead(ME, T, "2026-08-16T10:00:00.000Z");
    // A stale render arriving late must not un-read the thread.
    await markRead(ME, T, "2026-08-16T09:00:00.000Z");
    expect((await getReadMap(ME))[T]).toBe("2026-08-16T10:00:00.000Z");
  });

  it("refuses ids that could not be ours", async () => {
    const before = JSON.stringify(await getThreadExtra(T));
    await toggleReaction("../../etc/passwd", P, "⚔️", ME);
    expect(JSON.stringify(await getThreadExtra(T))).toBe(before);
    expect(await getThreadExtra("../weird")).toEqual({ posts: {} });
  });
});
