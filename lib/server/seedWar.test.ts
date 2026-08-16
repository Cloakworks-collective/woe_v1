// The war-seeder's load-bearing assumption, pinned.
//
// `adminSeedWar` fills a world by pushing orders through `applyOneCommand` —
// the same path a player's click takes — rather than by writing battle reports
// and covert records by hand. That is deliberate: seeded data made by faking
// the outputs teaches you nothing about the outputs. But it means the seeder is
// only as good as its PREPARATION: every gate that would refuse a real player
// refuses the seeder too, so if it forgets to lift a shield, open the era, or
// grant spy turns, the script runs to completion and quietly produces nothing.
//
// These cases are the guard against exactly that silent-nothing failure.

import { describe, expect, it } from "vitest";
import { applyOneCommand } from "./pipeline";
import { ERA_PEACE_TICKS, seedWorld } from "./world";
import type { World } from "./store";

/** The same preparation `adminSeedWar` does, in miniature. */
function readyWorld(): World {
  const world = seedWorld();
  world.meta.eraStartedAtTick = world.meta.tickNumber - ERA_PEACE_TICKS - 1;
  for (const p of Object.values(world.players)) {
    p.shieldUntilTick = 0;
    p.onVacation = false;
    p.turnsAvailable = 400;
    p.spyTurnsAvailable = 200;
    p.army.stamina = 100;
    // Enough knives that a raid clears REFUSAL_RATE against a 60-ranger
    // watch — the guild declines anything hopeless, and 6 against 60 is.
    p.army.spies = Math.max(p.army.spies, 200);
    p.army.scouts = Math.max(p.army.scouts, 60);
    p.buildings.shadow_guild = 5;
    p.buildings.rangers_lodge = 5;
  }
  return world;
}

const A = "bot-karakdun";
const B = "bot-eldervale";

describe("the war seeder's preparation", () => {
  it("an attack lands and is recorded as a battle", () => {
    const world = readyWorld();
    const r = applyOneCommand(world, A, "attack", { targetId: B, mode: "raid" });
    expect(r.result.ok, r.result.message).toBe(true);
    expect(world.battles.length).toBe(1);
    expect(world.battles[0].mode).toBe("raid");
  });

  it("every attack mode the seeder uses is accepted", () => {
    const world = readyWorld();
    for (const mode of ["raid", "siege", "bombard"] as const) {
      const r = applyOneCommand(world, A, "attack", { targetId: B, mode });
      expect(r.result.ok, `${mode}: ${r.result.message}`).toBe(true);
    }
    // Revenge needs a window, which the three blows above have now opened.
    const rev = applyOneCommand(world, B, "attack", { targetId: A, mode: "revenge" });
    expect(rev.result.ok, rev.result.message).toBe(true);
    expect(world.battles.map((b) => b.mode).sort()).toEqual(
      ["bombard", "raid", "revenge", "siege"].sort(),
    );
  });

  it("covert ops land and are FILED to the attacker's log", () => {
    const world = readyWorld();
    const r = applyOneCommand(world, A, "covert", {
      targetId: B,
      op: "survey_coffers",
      agents: 8,
    });
    expect(r.result.ok, r.result.message).toBe(true);
    const log = world.players[A].covertLog ?? [];
    expect(log).toHaveLength(1);
    expect(log[0].opId).toBe("survey_coffers");
    expect(log[0].targetName).toBe(world.players[B].name);
    expect(log[0].detail.length).toBeGreaterThan(0);
  });

  it("both arms file, newest first", () => {
    const world = readyWorld();
    applyOneCommand(world, A, "covert", { targetId: B, op: "survey_coffers", agents: 8 });
    applyOneCommand(world, A, "covert", { targetId: B, op: "torch_stores", agents: 60 });
    const log = world.players[A].covertLog ?? [];
    expect(log).toHaveLength(2);
    expect(log[0].arm).toBe("spy"); // newest first
    expect(log[1].arm).toBe("scout");
  });

  it("the era peace WOULD refuse everything — which is why the seeder opens it", () => {
    const world = readyWorld();
    world.meta.eraStartedAtTick = world.meta.tickNumber; // slam the peace shut
    const atk = applyOneCommand(world, A, "attack", { targetId: B, mode: "raid" });
    const spy = applyOneCommand(world, A, "covert", { targetId: B, op: "survey_coffers", agents: 8 });
    expect(atk.result.ok).toBe(false);
    expect(spy.result.ok).toBe(false);
    expect(world.battles).toHaveLength(0);
    expect(world.players[A].covertLog ?? []).toHaveLength(0);
  });
});
