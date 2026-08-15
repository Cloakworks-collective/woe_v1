import { describe, expect, it } from "vitest";
import { applyOneCommand } from "./pipeline";
import { seedWorld } from "./world";
import { newEmpire } from "../engine";
import {
  VACATION_RETURN_SHIELD_MIN_TICKS,
  VACATION_RETURN_SHIELD_TICKS,
} from "../constants";
import type { World } from "./store";

// The coming-home shield, through the REAL command path rather than the engine
// helper alone — because the thing that can silently break is the wiring, not
// the arithmetic. The helper is unit-tested in lib/engine/vacation.test.ts.

function worldWithPlayer(): World {
  const w = seedWorld();
  w.players = { A: newEmpire({ id: "A", name: "Alpha", race: "human" }) };
  w.clans = {};
  w.players.A.shieldUntilTick = 0; // the newcomer shield is not what we are testing
  return w;
}

const run = (w: World, args: Record<string, unknown>) =>
  applyOneCommand(w, "A", "vacation", args).result;

describe("cmd:vacation — the coming-home shield", () => {
  it("stamps the start of the absence on departure", () => {
    const w = worldWithPlayer();
    expect(run(w, { away: "1" }).ok).toBe(true);
    expect(w.players.A.onVacation).toBe(true);
    expect(w.players.A.vacationStartedAtTick).toBe(w.meta.tickNumber);
  });

  it("shields a ruler home from a real absence, and says so", () => {
    const w = worldWithPlayer();
    run(w, { away: "1" });
    // Backdate the departure rather than advancing the clock: the tick number is
    // derived from wall-clock time, so it cannot be fast-forwarded here.
    w.players.A.vacationStartedAtTick = w.meta.tickNumber - VACATION_RETURN_SHIELD_MIN_TICKS;

    const r = run(w, { away: "" });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/shield/i);
    expect(r.message).not.toMatch(/NO shield/);
    expect(w.players.A.onVacation).toBe(false);
    expect(w.players.A.shieldUntilTick).toBe(w.meta.tickNumber + VACATION_RETURN_SHIELD_TICKS);
    expect(w.players.A.vacationEndedAtTick).toBe(w.meta.tickNumber);
  });

  it("warns in plain words when the hop was too short to earn one", () => {
    const w = worldWithPlayer();
    run(w, { away: "1" });
    w.players.A.vacationStartedAtTick = w.meta.tickNumber - (VACATION_RETURN_SHIELD_MIN_TICKS - 1);

    const r = run(w, { away: "" });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/NO shield/);
    expect(w.players.A.shieldUntilTick).toBe(0);
  });

  it("shuts the door on rangers and spies, not only the army", () => {
    // An empty town cannot catch anybody, so covert work against a departed
    // ruler would be a free reading at no risk. The pipeline is the authority
    // here — lib/constants/attackGating only makes the console agree with it.
    const w = worldWithPlayer();
    w.players.B = newEmpire({ id: "B", name: "Beta", race: "human" });
    w.players.B.shieldUntilTick = 0;
    w.players.B.onVacation = true;
    w.meta.eraStartedAtTick = -100_000; // the era peace is not what we are testing

    for (const op of ["map_siege", "torch_stores"]) {
      const r = applyOneCommand(w, "A", "covert", { targetId: "B", op, agents: 5 }).result;
      expect(r.ok, op).toBe(false);
      expect(r.message, op).toMatch(/away from the world/i);
    }
  });

  it("cancelling a QUEUED departure is not a return — no shield, no cooldown", () => {
    const w = worldWithPlayer();
    w.players.A.vacationQueued = true;
    const r = run(w, { away: "" });
    expect(r.message).toMatch(/called off/i);
    expect(w.players.A.vacationQueued).toBe(false);
    expect(w.players.A.shieldUntilTick).toBe(0);
    expect(w.players.A.vacationEndedAtTick).toBeUndefined();
  });
});
