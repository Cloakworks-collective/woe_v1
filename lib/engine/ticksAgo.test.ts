// "3h ago" from a turn number.
//
// Worth pinning because every chat line, letter and battle row runs through it,
// and because a turn is ten minutes — an off-by-one in that conversion is
// invisible in a screenshot and wrong by six hours a day.

import { describe, expect, it } from "vitest";
import { TICKS_PER_HOUR, TURN_MINUTES } from "../constants";
import { ticksAgo } from "./reports";

const HOUR = TICKS_PER_HOUR;
const DAY = 24 * HOUR;

describe("ticksAgo", () => {
  it("reads in the unit a player would say out loud", () => {
    const now = 100_000;
    expect(ticksAgo(now, now)).toBe("just now");
    expect(ticksAgo(now - 3, now)).toBe("30m ago");
    expect(ticksAgo(now - HOUR, now)).toBe("1h ago");
    expect(ticksAgo(now - 5 * HOUR, now)).toBe("5h ago");
    expect(ticksAgo(now - 2 * DAY, now)).toBe("2d ago");
    expect(ticksAgo(now - 10 * DAY, now)).toBe("1w ago");
    expect(ticksAgo(now - 60 * DAY, now)).toBe("2mo ago");
    expect(ticksAgo(now - 400 * DAY, now)).toBe("1y ago");
  });

  it("uses the real turn length, not a guessed one", () => {
    // One turn under an hour must still read in minutes.
    expect(ticksAgo(0, HOUR - 1)).toBe(`${60 - TURN_MINUTES}m ago`);
  });

  it("never says a message arrives from the future", () => {
    // Ticks can run ahead of a stamped row during a catch-up burst; a negative
    // age must degrade to "just now", not "-4h ago".
    expect(ticksAgo(500, 100)).toBe("just now");
  });

  it("changes unit exactly at the boundary", () => {
    expect(ticksAgo(0, HOUR - 1)).toContain("m ago");
    expect(ticksAgo(0, HOUR)).toBe("1h ago");
    expect(ticksAgo(0, DAY - 1)).toBe("23h ago");
    expect(ticksAgo(0, DAY)).toBe("1d ago");
    expect(ticksAgo(0, 7 * DAY - 1)).toBe("6d ago");
    expect(ticksAgo(0, 7 * DAY)).toBe("1w ago");
  });
});
