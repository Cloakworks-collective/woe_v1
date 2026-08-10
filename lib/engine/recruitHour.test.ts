import { describe, expect, it } from "vitest";
import { TURNS_PER_DAY } from "../constants";
import { setRecruitHour } from "./commands";
import { newEmpire } from "./newEmpire";
import type { Player } from "./types";

const at = (tick: number, hourTicks: number, p: Player) => setRecruitHour(p, hourTicks, tick).player;

describe("moving your dawn", () => {
  it("schedules the next occurrence of the chosen slot", () => {
    const p = newEmpire({ id: "a", name: "a", race: "human" });
    // Currently tick 1,000 → today's slot 40 was at 1,000 - 136 + 40. Next is
    // the following day's.
    const next = at(1000, 40, p).nextRecruitAtTick!;
    expect(next % TURNS_PER_DAY).toBe(40);
    expect(next).toBeGreaterThan(1000);
    expect(next - 1000).toBeLessThanOrEqual(TURNS_PER_DAY);
  });

  it("cannot bring a payout forward — the 24h floor pushes it out", () => {
    // THE exploit: collect at dawn, then move the clock a few hours later and
    // collect again the same day.
    const p = newEmpire({ id: "a", name: "a", race: "human" });
    p.lastRecruitAtTick = 1000; // just collected
    const next = at(1002, 38, p).nextRecruitAtTick!; // slot ~6 hours away
    expect(next).toBeGreaterThanOrEqual(1000 + TURNS_PER_DAY);
    expect(next % TURNS_PER_DAY).toBe(38); // still lands on the hour they chose
  });

  it("never yields two payouts inside a day, at any hour", () => {
    for (let hour = 0; hour < TURNS_PER_DAY; hour++) {
      const p = newEmpire({ id: "a", name: "a", race: "human" });
      p.lastRecruitAtTick = 5000;
      const next = at(5001, hour, p).nextRecruitAtTick!;
      expect(next - 5000, `hour ${hour}`).toBeGreaterThanOrEqual(TURNS_PER_DAY);
    }
  });

  it("is allowed once an era", () => {
    const p = newEmpire({ id: "a", name: "a", race: "human" });
    const moved = at(1000, 40, p);
    expect(moved.recruitHourChanged).toBe(true);
    expect(() => setRecruitHour(moved, 60, 1100)).toThrowError(/once/i);
  });

  it("rejects an hour outside the day", () => {
    const p = newEmpire({ id: "a", name: "a", race: "human" });
    expect(() => setRecruitHour(p, -1, 100)).toThrowError();
    expect(() => setRecruitHour(p, TURNS_PER_DAY, 100)).toThrowError();
  });
});
