// Member-to-member aid, hall silences and the chat throttle.
//
// All three exist to make a specific abuse expensive, so the tests are written
// as the abuse rather than as the happy path: funnel everything to one empire,
// shout the room down, come back a minute after a silence expires.

import { describe, expect, it } from "vitest";
import { CHAT_LIMITS, CLAN_GIFT_TAX, CLAN_MUTE_DAYS, TICKS_PER_HOUR } from "../constants";
import {
  chatLimitProblem,
  clanMuted,
  muteClanMember,
  recentStamps,
  recordChat,
  unmuteClanMember,
} from "./chatLimits";
import { giftToMember, newClan } from "./clanOps";
import { newEmpire } from "./newEmpire";
import type { Player } from "./types";

const empire = (id: string): Player => newEmpire({ id, name: id, race: "human" });

function pair(): { a: Player; b: Player; clan: ReturnType<typeof newClan> } {
  const a = empire("giver");
  const b = empire("taker");
  const clan = newClan("c1", "Banner", a);
  clan.members.push(b.id);
  return { a, b, clan };
}

const MIN = 60_000;

describe("clan aid — member to member", () => {
  it("moves goods and burns the tax, never rounding for the giver", () => {
    const { a, b, clan } = pair();
    a.gold = 1000;
    const before = a.gold + b.gold;

    const r = giftToMember(a, b, clan, "gold", 101);

    // Ceil on the burn: 10.1 becomes 11, so the giver never profits by a coin.
    expect(r.taxed).toBe(Math.ceil(101 * CLAN_GIFT_TAX));
    expect(r.sent).toBe(101 - r.taxed);
    expect(r.sender.gold).toBe(1000 - 101);
    expect(r.recipient.gold).toBe(b.gold + r.sent);
    // Burned, not banked somewhere: the pair is poorer than it started.
    expect(r.sender.gold + r.recipient.gold).toBeLessThan(before);
  });

  it("makes a funnel cost real money — a hundred relayed gifts is not free", () => {
    const { a, b, clan } = pair();
    a.gold = 10_000;
    let sender = a;
    let recipient = b;
    let moved = 10_000;
    // Ten hops through the clan, as a ring of alts would do it.
    for (let i = 0; i < 10; i++) {
      const r = giftToMember({ ...sender, gold: moved }, { ...recipient, gold: 0 }, clan, "gold", moved);
      moved = r.sent;
      [sender, recipient] = [recipient, sender];
    }
    expect(moved).toBeLessThan(10_000 * 0.9 ** 10 + 1);
    expect(moved).toBeLessThan(3_500); // over a third of it gone
  });

  it("refuses outsiders, self-gifts, fractions and money you do not have", () => {
    const { a, b, clan } = pair();
    a.gold = 100;
    const outsider = empire("stranger");

    expect(() => giftToMember(a, outsider, clan, "gold", 10)).toThrow();
    expect(() => giftToMember(a, a, clan, "gold", 10)).toThrow();
    expect(() => giftToMember(a, b, clan, "gold", 10.5)).toThrow();
    expect(() => giftToMember(a, b, clan, "gold", 0)).toThrow();
    expect(() => giftToMember(a, b, clan, "gold", -50)).toThrow();
    expect(() => giftToMember(a, b, clan, "gold", 101)).toThrow();
  });

  it("does not mutate the players handed to it", () => {
    const { a, b, clan } = pair();
    a.gold = 500;
    giftToMember(a, b, clan, "gold", 100);
    expect(a.gold).toBe(500);
    expect(b.gold).toBe(empire("taker").gold);
  });

  it("moves resources as well as coin", () => {
    const { a, b, clan } = pair();
    a.resources.wood = 200;
    const r = giftToMember(a, b, clan, "wood", 200);
    expect(r.sender.resources.wood).toBe(0);
    expect(r.recipient.resources.wood).toBe(b.resources.wood + 180);
  });
});

describe("hall silences", () => {
  it("silences for the offered spans and then lifts itself", () => {
    const { b, clan } = pair();
    const days = CLAN_MUTE_DAYS[1];
    const muted = muteClanMember(clan, b.id, days, 1000);

    expect(clanMuted(muted, b.id, 1000)).toBe(true);
    expect(clanMuted(muted, b.id, 1000 + days * 24 * TICKS_PER_HOUR - 1)).toBe(true);
    // Expiry needs no sweep — it is a comparison, so a dead world cannot leave
    // someone silenced forever.
    expect(clanMuted(muted, b.id, 1000 + days * 24 * TICKS_PER_HOUR)).toBe(false);
  });

  it("only hands out the spans on offer", () => {
    const { b, clan } = pair();
    expect(() => muteClanMember(clan, b.id, 30, 0)).toThrow();
    expect(() => muteClanMember(clan, b.id, 0, 0)).toThrow();
  });

  it("lifts early, and leaves everyone else alone", () => {
    const { a, b, clan } = pair();
    const muted = muteClanMember(muteClanMember(clan, b.id, 1, 0), a.id, 1, 0);
    const lifted = unmuteClanMember(muted, b.id);
    expect(clanMuted(lifted, b.id, 10)).toBe(false);
    expect(clanMuted(lifted, a.id, 10)).toBe(true);
    // The input clan is untouched — these run inside a CAS retry.
    expect(clanMuted(muted, b.id, 10)).toBe(true);
  });
});

describe("chat throttle", () => {
  const speak = (p: Player, at: number) => {
    const stop = chatLimitProblem(p, at);
    if (stop) return stop;
    recordChat(p, at);
    return null;
  };

  it("lets a normal conversation through", () => {
    const p = empire("talker");
    // Three in five minutes is the burst cap — spaced out, this is fine.
    expect(speak(p, 0)).toBeNull();
    expect(speak(p, 3 * MIN)).toBeNull();
    expect(speak(p, 6 * MIN)).toBeNull();
    expect(speak(p, 9 * MIN)).toBeNull();
  });

  it("stops a burst, and forgives it once the window slides", () => {
    const p = empire("shouter");
    for (let i = 0; i < CHAT_LIMITS.BURST.messages; i++) expect(speak(p, i * 1000)).toBeNull();
    expect(speak(p, CHAT_LIMITS.BURST.messages * 1000)).toBeTruthy();
    // Just past the oldest stamp's window, one slot frees up.
    expect(speak(p, CHAT_LIMITS.BURST.minutes * MIN + 1)).toBeNull();
  });

  it("holds the hourly and daily ceilings against a paced spammer", () => {
    const p = empire("pacer");
    // Two minutes apart clears the burst rule forever, which is exactly the
    // hole the hourly cap exists to close.
    let at = 0;
    let sent = 0;
    for (let i = 0; i < 30; i++) {
      // 30 tries × 2 min = 58 minutes, all inside one hourly window.
      if (speak(p, at) === null) sent++;
      at += 2 * MIN;
    }
    expect(sent).toBe(CHAT_LIMITS.HOURLY.messages);
    // The window SLIDES rather than resetting on the hour — once the earliest
    // stamps age out, they speak again without a special case anywhere.
    expect(speak(p, CHAT_LIMITS.HOURLY.minutes * MIN + 1)).toBeNull();

    // Across a day, the daily cap is the binding one: ten minutes apart is
    // only six an hour, so nothing else can stop them.
    const q = empire("marathon");
    at = 0;
    sent = 0;
    for (let i = 0; i < 140; i++) {
      if (speak(q, at) === null) sent++;
      at += 10 * MIN;
    }
    expect(sent).toBe(CHAT_LIMITS.DAILY.messages);
  });

  it("keeps the stamp list bounded — it lives on the player forever", () => {
    const p = empire("longwinded");
    let at = 0;
    for (let i = 0; i < 500; i++) {
      speak(p, at);
      at += 20 * MIN;
    }
    // Anything older than the longest window is dead weight in the world blob.
    expect(recentStamps(p, at).length).toBeLessThanOrEqual(CHAT_LIMITS.DAILY.messages);
    expect((p.chatStamps ?? []).length).toBeLessThanOrEqual(CHAT_LIMITS.DAILY.messages);
  });
});
