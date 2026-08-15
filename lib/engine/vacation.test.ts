import { describe, expect, it } from "vitest";
import {
  VACATION_TICKS_PER_ERA,
  VACATION_REATTACK_COOLDOWN_TICKS,
  VACATION_RETURN_SHIELD_MIN_TICKS,
  VACATION_RETURN_SHIELD_TICKS,
} from "../constants";
import { validateAttack, type AttackContext } from "./combat";
import { newEmpire } from "./newEmpire";
import { processTurnTick } from "./tick";
import { processDailyReset, sampleGrowth } from "./dailyReset";
import { departOnVacation, returnFromVacation, vacationAwayTicks } from "./vacation";
import type { Player } from "./types";

function fresh(): Player {
  return newEmpire({ id: "t", name: "Test", race: "human" });
}

const CTX: AttackContext = {
  currentTick: 100000,
  eraStartedAtTick: 0,
  eraPeaceTicks: 720,
  revengeWindowTicks: 108,
  clanWar: false,
  vacationReattackCooldownTicks: VACATION_REATTACK_COOLDOWN_TICKS,
};

describe("vacation — production penalty", () => {
  it("cuts production to a fifth while away", () => {
    const build = () => {
      const p = fresh();
      p.buildings.grange = 1;
      p.workers.farmers = 20;
      p.idlePeasants = 60;
      return p;
    };
    const normal = processTurnTick(build()).player;
    const onVacation = build();
    onVacation.onVacation = true;
    const flagged = processTurnTick(onVacation).player;
    // Normal produces 20 × (10 × 1 × (1−0.5 tax)) × 1.25 human = 125 food.
    // The vacation factor is folded into the PER-WORKER rate, exactly as the
    // tick does it: 20 × (10 × 0.5 × 0.2) × 1.25 = 25. Upkeep is the same
    // either way: 10 for the people + 20 workers × 5 rations = 110.
    const normalGain = normal.resources.food - 1000; // 125 − 110 = 15
    const flaggedGain = flagged.resources.food - 1000; // 25 − 110 = −85
    expect(normalGain).toBe(15);
    expect(flaggedGain).toBe(-85);
  });

  it("cuts research by seven tenths, not eight — the Collegium reads on", () => {
    const build = () => {
      const p = fresh();
      p.buildings.collegium = 1;
      p.workers.researchers = 20;
      p.research.activeField = "art_of_war";
      return p;
    };
    const normal = processTurnTick(build()).player;
    const away = build();
    away.onVacation = true;
    const flagged = processTurnTick(away).player;

    const normalRp = normal.research.banked.art_of_war ?? 0;
    const awayRp = flagged.research.banked.art_of_war ?? 0;
    expect(normalRp).toBeGreaterThan(0);
    // 30% of normal — and strictly MORE than the 20% the yards get, which is
    // the whole point of splitting the two dials.
    expect(awayRp).toBe(Math.floor(normalRp * 0.3));
    expect(awayRp).toBeGreaterThan(Math.floor(normalRp * 0.2));
  });

  it("stops research entirely when the food runs out, away or not", () => {
    const p = fresh();
    p.buildings.collegium = 1;
    p.workers.researchers = 20;
    p.research.activeField = "art_of_war";
    p.onVacation = true;
    p.resources.food = 0;
    p.bankedResources = { food: 0, wood: 0, stone: 0, ore: 0 };
    const { player } = processTurnTick(p);
    expect(player.starving).toBe(true);
    expect(player.research.banked.art_of_war ?? 0).toBe(0);
  });
});

describe("vacation — recruitment is untouched", () => {
  it("takes the same settlers away as at home, given beds to put them in", () => {
    const build = () => {
      const p = fresh();
      p.buildings.hearthstead = 200; // plenty of empty beds
      return p;
    };
    const run = (away: boolean) => {
      const p = build();
      p.onVacation = away;
      for (let i = 0; i < 144; i++) sampleGrowth(p, i);
      return processDailyReset(p, 144).player.idlePeasants;
    };
    const home = run(false);
    const gone = run(true);
    expect(home).toBeGreaterThan(0);
    expect(gone).toBe(home);
  });

  it("still stops at the beds — a full town takes nobody, home or away", () => {
    const p = fresh();
    p.buildings.hearthstead = 0; // no beds built at all
    p.onVacation = true;
    for (let i = 0; i < 144; i++) sampleGrowth(p, i);
    const after = processDailyReset(p, 144).player;
    expect(after.idlePeasants).toBe(p.idlePeasants);
  });
});

describe("vacation — the era budget", () => {
  it("spends a turn of the allowance each tick while away", () => {
    const p = fresh();
    p.onVacation = true;
    const { player } = processTurnTick(p);
    expect(player.vacationTicksUsed).toBe(1);
  });

  it("ends on its own once the allowance is spent", () => {
    const p = fresh();
    p.onVacation = true;
    p.vacationTicksUsed = VACATION_TICKS_PER_ERA - 1; // one turn left
    const { player, events } = processTurnTick(p);
    expect(player.onVacation).toBe(false);
    expect(player.vacationEndedAtTick).toBeDefined();
    expect(events.some((e) => e.type === "info")).toBe(true);
  });
});

describe("vacation — the coming-home shield", () => {
  it("grants an hour of shield after a real absence", () => {
    const p = fresh();
    p.shieldUntilTick = 0;
    departOnVacation(p, 1000);
    const { awayTicks, shieldedUntilTick } = returnFromVacation(
      p,
      1000 + VACATION_RETURN_SHIELD_MIN_TICKS,
    );
    expect(awayTicks).toBe(VACATION_RETURN_SHIELD_MIN_TICKS);
    expect(shieldedUntilTick).toBe(
      1000 + VACATION_RETURN_SHIELD_MIN_TICKS + VACATION_RETURN_SHIELD_TICKS,
    );
    expect(p.onVacation).toBe(false);
    expect(p.vacationEndedAtTick).toBe(1000 + VACATION_RETURN_SHIELD_MIN_TICKS);
  });

  it("grants nothing for a hop out and straight back", () => {
    const p = fresh();
    p.shieldUntilTick = 0;
    departOnVacation(p, 1000);
    const { shieldedUntilTick } = returnFromVacation(p, 1000 + VACATION_RETURN_SHIELD_MIN_TICKS - 1);
    expect(shieldedUntilTick).toBeNull();
    expect(p.shieldUntilTick).toBe(0);
  });

  it("never shortens a longer shield already running", () => {
    const p = fresh();
    p.shieldUntilTick = 99_999; // newcomer shield, days to run
    departOnVacation(p, 1000);
    returnFromVacation(p, 1000 + VACATION_RETURN_SHIELD_MIN_TICKS);
    expect(p.shieldUntilTick).toBe(99_999);
  });

  it("shields the ruler the era budget shoves back into the world", () => {
    const p = fresh();
    p.shieldUntilTick = 0;
    p.onVacation = true;
    p.vacationStartedAtTick = 0;
    p.vacationTicksUsed = VACATION_TICKS_PER_ERA - 1;
    const { player } = processTurnTick(p, { currentTick: VACATION_TICKS_PER_ERA });
    expect(player.onVacation).toBe(false);
    expect(player.shieldUntilTick).toBe(VACATION_TICKS_PER_ERA + VACATION_RETURN_SHIELD_TICKS);
  });

  it("measures only the CURRENT trip, not the era's spent budget", () => {
    const p = fresh();
    p.vacationTicksUsed = 5000; // a long history of holidays this age
    departOnVacation(p, 1000);
    expect(vacationAwayTicks(p, 1010)).toBe(10);
  });

  it("falls back to the era budget on saves written before the start stamp", () => {
    const p = fresh();
    p.onVacation = true;
    p.vacationStartedAtTick = undefined;
    p.vacationTicksUsed = 200;
    expect(vacationAwayTicks(p, 100_000)).toBe(200);
  });
});

describe("vacation — the re-attack cooldown", () => {
  it("blocks a raid right after returning", () => {
    const a = fresh();
    const d = fresh();
    d.id = "d";
    a.vacationEndedAtTick = CTX.currentTick - 1; // just got back
    expect(validateAttack(a, d, "raid", CTX)).toMatch(/still mustering/i);
  });

  it("clears once the cooldown has elapsed", () => {
    const a = fresh();
    const d = fresh();
    d.id = "d";
    a.vacationEndedAtTick = CTX.currentTick - VACATION_REATTACK_COOLDOWN_TICKS;
    expect(validateAttack(a, d, "raid", CTX)).toBeNull();
  });

  it("never blocks a revenge (revenge is exempt)", () => {
    const a = fresh();
    const d = fresh();
    d.id = "d";
    a.vacationEndedAtTick = CTX.currentTick - 1;
    a.recentAttackers = [{ playerId: "d", tick: CTX.currentTick - 10 }]; // open window
    expect(validateAttack(a, d, "revenge", CTX)).toBeNull();
  });
});
