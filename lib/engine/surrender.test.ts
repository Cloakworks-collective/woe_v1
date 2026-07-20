import { describe, expect, it } from "vitest";
import { SURRENDER_TICKS_PER_ERA, SURRENDER_REATTACK_COOLDOWN_TICKS } from "../constants";
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
  surrenderReattackCooldownTicks: SURRENDER_REATTACK_COOLDOWN_TICKS,
};

describe("surrender — production penalty", () => {
  it("halves production while the white flag flies", () => {
    const build = () => {
      const p = fresh();
      p.buildings.grange = 1; // 20 slots
      p.workers.farmers = 20;
      p.idlePeasants = 60;
      return p;
    };
    const normal = processTurnTick(build()).player;
    const surrendered = build();
    surrendered.surrendered = true;
    const flagged = processTurnTick(surrendered).player;
    // Normal produces 20 × 20 × (1−0.5 tax) × 1.25 human = 250 food; surrender
    // halves the production to 125 (upkeep, a flat 10, is the same for both).
    const normalGain = normal.resources.food - 1000; // 250 − 10 upkeep = 240
    const flaggedGain = flagged.resources.food - 1000; // 125 − 10 upkeep = 115
    expect(normalGain).toBe(240);
    expect(flaggedGain).toBe(115);
    expect(normalGain - flaggedGain).toBe(125); // exactly half the production
  });
});

describe("surrender — the era budget", () => {
  it("spends a turn of the allowance each tick under the flag", () => {
    const p = fresh();
    p.surrendered = true;
    const { player } = processTurnTick(p);
    expect(player.surrenderTicksUsed).toBe(1);
  });

  it("lowers the flag on its own once the allowance is spent", () => {
    const p = fresh();
    p.surrendered = true;
    p.surrenderTicksUsed = SURRENDER_TICKS_PER_ERA - 1; // one turn left
    const { player, events } = processTurnTick(p);
    expect(player.surrendered).toBe(false);
    expect(player.surrenderLiftedAtTick).toBeDefined();
    expect(events.some((e) => e.type === "info")).toBe(true);
  });
});

describe("surrender — the re-attack cooldown", () => {
  it("blocks a raid right after lowering the flag", () => {
    const a = fresh();
    const d = fresh();
    d.id = "d";
    a.surrenderLiftedAtTick = CTX.currentTick - 1; // just lowered
    expect(validateAttack(a, d, "raid", CTX)).toMatch(/standing down/i);
  });

  it("clears once the cooldown has elapsed", () => {
    const a = fresh();
    const d = fresh();
    d.id = "d";
    a.surrenderLiftedAtTick = CTX.currentTick - SURRENDER_REATTACK_COOLDOWN_TICKS;
    expect(validateAttack(a, d, "raid", CTX)).toBeNull();
  });

  it("never blocks a revenge (revenge is exempt)", () => {
    const a = fresh();
    const d = fresh();
    d.id = "d";
    a.surrenderLiftedAtTick = CTX.currentTick - 1;
    a.recentAttackers = [{ playerId: "d", tick: CTX.currentTick - 10 }]; // open window
    expect(validateAttack(a, d, "revenge", CTX)).toBeNull();
  });
});
