import { describe, expect, it } from "vitest";
import { TICKS_PER_HOUR, WAR } from "../constants";
import { declareWar, lapseStaleWar, recordWarKills } from "./clanOps";
import { newClan } from "./clanOps";
import { newEmpire } from "./newEmpire";
import type { Clan } from "./types";

const STALE = WAR.STALE_HOURS * TICKS_PER_HOUR;

function pair(): { a: Clan; b: Clan } {
  const a = newClan("a", "Iron Pact", newEmpire({ id: "la", name: "la", race: "human" }));
  const b = newClan("b", "Ash Banner", newEmpire({ id: "lb", name: "lb", race: "orc" }));
  const d = declareWar(a, b, 1000); // one declaration now arms BOTH sides
  return { a: d.clan, b: d.target };
}

describe("a war nobody fights lapses", () => {
  it("holds while the quiet is shorter than the stale window", () => {
    const { a, b } = pair();
    const r = lapseStaleWar(a, b, 1000 + STALE - 1);
    expect(r.lapsed).toBe(false);
    expect(r.a.wars).toHaveLength(1);
  });

  it("ends with NO winner when no blood was ever drawn", () => {
    const { a, b } = pair();
    const r = lapseStaleWar(a, b, 1000 + STALE);

    expect(r.lapsed).toBe(true);
    expect(r.winner).toBeUndefined();
    expect(r.a.wars).toHaveLength(0);
    expect(r.b.wars).toHaveLength(0);
    // Nothing on either record, and no truce to serve.
    expect(r.a.warRecord).toEqual({ wins: 0, losses: 0 });
    expect(r.b.warRecord).toEqual({ wins: 0, losses: 0 });
    expect(r.b.clockFrozenUntilTick).toBeUndefined();
  });

  it("ends with no winner when the tally is dead even", () => {
    let { a, b } = pair();
    ({ ours: a, theirs: b } = recordWarKills(a, b, 40, 40, 1100));
    const r = lapseStaleWar(a, b, 1100 + STALE);
    expect(r.lapsed).toBe(true);
    expect(r.winner).toBeUndefined();
    expect(r.a.warRecord.wins).toBe(0);
  });

  it("awards the record to whoever led on net kills", () => {
    let { a, b } = pair();
    ({ ours: a, theirs: b } = recordWarKills(a, b, 60, 10, 1100)); // a is +50
    const at = 1100 + STALE;
    const r = lapseStaleWar(a, b, at);

    expect(r.lapsed).toBe(true);
    expect(r.winner).toBe("a");
    expect(r.a.warRecord).toEqual({ wins: 1, losses: 0 });
    expect(r.b.warRecord).toEqual({ wins: 0, losses: 1 });
    // The loser serves the usual truce and frozen clocks…
    expect(r.b.clockFrozenUntilTick).toBe(at + WAR.TRUCE_HOURS * TICKS_PER_HOUR);
    expect(r.a.truceWithUntilTick.b).toBe(at + WAR.TRUCE_HOURS * TICKS_PER_HOUR);
    // …but a lapsed war pays no tribute — that is a decisive victory's prize.
    expect(r.b.tribute).toBeUndefined();
  });

  it("fresh blood restarts the clock", () => {
    let { a, b } = pair();
    const late = 1000 + STALE - 10;
    ({ ours: a, theirs: b } = recordWarKills(a, b, 5, 0, late));
    // The declaration is now ancient, but the fighting is recent.
    expect(lapseStaleWar(a, b, 1000 + STALE + 5).lapsed).toBe(false);
    expect(lapseStaleWar(a, b, late + STALE).lapsed).toBe(true);
  });

  it("is a no-op for clans that are not at war", () => {
    const a = newClan("a", "Iron Pact", newEmpire({ id: "la", name: "la", race: "human" }));
    const b = newClan("b", "Ash Banner", newEmpire({ id: "lb", name: "lb", race: "orc" }));
    expect(lapseStaleWar(a, b, 999_999).lapsed).toBe(false);
  });
});
