import { describe, expect, it } from "vitest";
import { CHAT } from "../constants";
import { pushMessage, type ForumMessage, type World } from "./store";

function world(): World {
  return { messages: [] } as unknown as World;
}

function say(w: World, channel: string, body: string): void {
  pushMessage(w, { id: body, channel, authorId: "a", authorName: "A", body, tick: 1 });
}

const inChannel = (w: World, ch: string): ForumMessage[] => w.messages.filter((m) => m.channel === ch);

describe("clan chat retention", () => {
  it("keeps only the last CLAN_HISTORY messages of a clan channel", () => {
    const w = world();
    const over = CHAT.CLAN_HISTORY + 50;
    for (let i = 0; i < over; i++) say(w, "clan:c1", `m${i}`);

    const kept = inChannel(w, "clan:c1");
    expect(kept).toHaveLength(CHAT.CLAN_HISTORY);
    // The OLDEST are the ones dropped; the newest survive in order.
    expect(kept[0].body).toBe(`m${over - CHAT.CLAN_HISTORY}`);
    expect(kept[kept.length - 1].body).toBe(`m${over - 1}`);
  });

  it("trims each clan independently and leaves other channels alone", () => {
    const w = world();
    say(w, "era", "hello");
    for (let i = 0; i < CHAT.CLAN_HISTORY + 10; i++) say(w, "clan:c1", `a${i}`);
    for (let i = 0; i < 5; i++) say(w, "clan:c2", `b${i}`);

    expect(inChannel(w, "clan:c1")).toHaveLength(CHAT.CLAN_HISTORY);
    expect(inChannel(w, "clan:c2")).toHaveLength(5); // untouched by c1's overflow
    expect(inChannel(w, "era")).toHaveLength(1); // era chat is not clan-capped
  });

  it("caps the whole board across channels", () => {
    const w = world();
    for (let i = 0; i < CHAT.TOTAL_HISTORY + 100; i++) say(w, "era", `e${i}`);
    expect(w.messages).toHaveLength(CHAT.TOTAL_HISTORY);
  });
});
