import { describe, expect, it } from "vitest";
import { VACATION_TICKS_PER_ERA, VACATION_REATTACK_COOLDOWN_TICKS } from "../constants";
import { validateAttack, type AttackContext } from "./combat";
import { newEmpire } from "./newEmpire";
import { processTurnTick } from "./tick";
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
  it("halves production while away", () => {
    const build = () => {
      const p = fresh();
      p.buildings.grange = 1; // 20 slots
      p.workers.farmers = 20;
      p.idlePeasants = 60;
      return p;
    };
    const normal = processTurnTick(build()).player;
    const onVacation = build();
    onVacation.onVacation = true;
    const flagged = processTurnTick(onVacation).player;
    // Normal produces 20 × (50 × 1 × (1−0.5 tax)) × 1.25 human = 625 food;
    // vacation halves the production to 312.5 (upkeep, a flat 10, is the same).
    const normalGain = normal.resources.food - 1000; // 625 − 10 upkeep = 615
    // Vacation halves 625 to 312.5, floored to 312 (stocks are whole), − 10 upkeep.
    const flaggedGain = flagged.resources.food - 1000;
    expect(normalGain).toBe(615);
    expect(flaggedGain).toBe(302);
    expect(normalGain - flaggedGain).toBe(313); // half the production, ±the floored unit
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
