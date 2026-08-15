import { describe, expect, it } from "vitest";
import { TURNS_PER_DAY, TURN_MINUTES } from "./constants";
import { clockGap, dawnChoices, hhmm, offsetFromStatedTime } from "./localClock";

// The settler hour is set ONCE an age, in the reader's own clock, from numbers
// this module computes. Everything here is what the confirmation dialog quotes.

describe("hhmm — the reader's clock", () => {
  const noonUtc = Date.UTC(2026, 7, 13, 12, 0);

  it("shifts by the zone, wrapping the day", () => {
    expect(hhmm(noonUtc, 0)).toBe("12:00");
    expect(hhmm(noonUtc, 330)).toBe("17:30"); // India, +5:30
    expect(hhmm(noonUtc, -480)).toBe("04:00"); // US Pacific
    expect(hhmm(noonUtc, 780)).toBe("01:00"); // Kiribati, +13 — next day
  });

  it("pads both halves", () => {
    expect(hhmm(Date.UTC(2026, 7, 13, 5, 7), 0)).toBe("05:07");
  });
});

describe("clockGap — the short way round midnight", () => {
  it("does not treat 23:58 as 1,438 minutes from midnight", () => {
    expect(clockGap(23 * 60 + 58, 0)).toBe(2);
    expect(clockGap(0, 23 * 60 + 58)).toBe(2);
    expect(clockGap(60, 120)).toBe(60);
  });
});

describe("dawnChoices — a slot for every local hour", () => {
  // A world whose day boundary is deliberately NOT on the hour, which is the
  // normal case: the realm started whenever it started.
  const base = {
    currentTick: 5_000,
    lastTickAtMs: Date.UTC(2026, 7, 13, 14, 37),
    turnMinutes: TURN_MINUTES,
    turnsPerDay: TURNS_PER_DAY,
  };

  it("offers 24 options, one per local hour, each a real slot", () => {
    const c = dawnChoices({ ...base, zoneMins: 0 });
    expect(c).toHaveLength(24);
    expect(c.map((x) => x.hour)).toEqual([...Array(24).keys()]);
    for (const x of c) {
      expect(Number.isInteger(x.offset)).toBe(true);
      expect(x.offset).toBeGreaterThanOrEqual(0);
      expect(x.offset).toBeLessThan(TURNS_PER_DAY);
    }
  });

  it("lands within five minutes of the hour asked for — the slot granularity", () => {
    for (const zoneMins of [0, 330, -480, 780, -210]) {
      for (const c of dawnChoices({ ...base, zoneMins })) {
        const [h, m] = c.hhmm.split(":").map(Number);
        expect(clockGap(h * 60 + m, c.hour * 60), `${zoneMins} @ ${c.hour}`).toBeLessThanOrEqual(5);
      }
    }
  });

  it("labels each option with the time it TRULY lands at, not the round hour", () => {
    // The anchor above is at :37, so with whole-hour zones the slots cannot sit
    // exactly on the hour — the label has to admit that rather than round.
    const c = dawnChoices({ ...base, zoneMins: 0 });
    expect(c.some((x) => !x.hhmm.endsWith(":00"))).toBe(true);
  });

  it("gives distinct slots to distinct hours", () => {
    const c = dawnChoices({ ...base, zoneMins: 0 });
    expect(new Set(c.map((x) => x.offset)).size).toBe(24);
  });

  it("re-labels everything when the zone moves", () => {
    const utc = dawnChoices({ ...base, zoneMins: 0 });
    const ist = dawnChoices({ ...base, zoneMins: 330 });
    // Same local hour, different realm slot — that is the whole point.
    expect(ist[7].offset).not.toBe(utc[7].offset);
  });
});

describe("offsetFromStatedTime — correcting a browser that lies", () => {
  const nowMs = Date.UTC(2026, 7, 13, 12, 0); // 12:00 UTC

  it("derives the offset from the time the player says it is", () => {
    expect(offsetFromStatedTime("12:00", nowMs)).toBe(0);
    expect(offsetFromStatedTime("17:30", nowMs)).toBe(330); // +5:30
    expect(offsetFromStatedTime("04:00", nowMs)).toBe(-480); // −8
  });

  it("always lands inside the range real zones occupy", () => {
    for (const t of ["01:00", "23:00", "00:00", "13:00", "06:30"]) {
      for (const hint of [-720, -300, 0, 330, 780]) {
        const off = offsetFromStatedTime(t, nowMs, hint)!;
        expect(off, `${t} @ ${hint}`).toBeGreaterThan(-720);
        expect(off, `${t} @ ${hint}`).toBeLessThanOrEqual(840);
      }
    }
  });

  it("settles the today/tomorrow ambiguity toward the browser's guess", () => {
    // 01:00 when it is 12:00 UTC reads as both UTC−11 and UTC+13. The clock
    // face is identical either way, so we follow whichever the browser thought
    // rather than flinging the player across the date line.
    expect(offsetFromStatedTime("01:00", nowMs, 780)).toBe(780);
    expect(offsetFromStatedTime("01:00", nowMs, -660)).toBe(-660);
    // And a small correction never changes hemisphere.
    expect(offsetFromStatedTime("18:30", nowMs, 330)).toBe(390);
  });

  it("snaps to a quarter hour — every real zone is one", () => {
    expect(offsetFromStatedTime("17:33", nowMs)).toBe(330);
    expect(offsetFromStatedTime("17:28", nowMs)).toBe(330);
    expect(offsetFromStatedTime("17:45", nowMs)).toBe(345); // Nepal-shaped
  });

  it("refuses nonsense instead of guessing", () => {
    for (const bad of ["", "noon", "25:00", "12:99", "1200", "12", "-1:00"]) {
      expect(offsetFromStatedTime(bad, nowMs), bad).toBeNull();
    }
  });

  it("round-trips: state a time, and the clock then reads it back", () => {
    for (const t of ["00:00", "06:15", "12:00", "17:30", "23:45"]) {
      const off = offsetFromStatedTime(t, nowMs)!;
      expect(hhmm(nowMs, off), t).toBe(t);
    }
  });
});
