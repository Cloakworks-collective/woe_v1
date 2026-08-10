import { describe, expect, it } from "vitest";
import { applyOneCommand } from "./pipeline";
import { runDueTicks, seedWorld, ticksDue, tickHealth } from "./world";
import { newEmpire } from "../engine";
import type { World } from "./store";

// Winning ENDS the game. Not "announces a winner and lets play continue" —
// the banner tells everyone the ladder is final, so it has to actually be final.

function wonWorld(): World {
  const w = seedWorld();
  w.players = { A: newEmpire({ id: "A", name: "Alpha", race: "human" }) };
  w.clans = {};
  w.meta.winner = { kind: "overlord", id: "A", name: "Alpha", atTick: w.meta.tickNumber };
  return w;
}

const run = (w: World, name: string, args: Record<string, unknown> = {}) =>
  applyOneCommand(w, "A", name, args).result;

describe("a won age is frozen", () => {
  it("refuses the commands that could move the ladder", () => {
    const w = wonWorld();
    for (const cmd of ["attack", "build", "trainTroops", "marketBuy", "clanCreate", "covert"]) {
      const r = run(w, cmd, { id: "hearthstead" });
      expect(r.ok, `${cmd} should be refused`).toBe(false);
      expect(r.message).toMatch(/age has ended/i);
    }
  });

  it("still allows housekeeping, payment and talk", () => {
    const w = wonWorld();
    // syncPlayer especially: §14.2 page loads go through it, so blocking it
    // would lock players out of even LOOKING at the finished age.
    expect(run(w, "syncPlayer").ok).toBe(true);
    expect(run(w, "grantCharter").ok).toBe(true);
    expect(run(w, "chat", { channel: "era", body: "well played" }).ok).toBe(true);
  });

  it("blocks by default — a new command is frozen unless allowlisted", () => {
    // The gate is an allowlist precisely so this holds without anyone
    // remembering to update it.
    expect(run(wonWorld(), "someCommandAddedNextYear").ok).toBe(false);
  });

  it("stops the world clock, so nothing grows after the bell", () => {
    const w = wonWorld();
    const before = JSON.stringify(w.players);
    const later = new Date(Date.parse(w.meta.lastTickAt) + 6 * 60 * 60 * 1000); // 6h on
    expect(ticksDue(w, later)).toBe(0);
    expect(runDueTicks(w, later)).toBe(0);
    expect(JSON.stringify(w.players)).toBe(before);
  });

  it("reads as healthy to the heartbeat monitor, not as a dead clock", () => {
    const w = wonWorld();
    const later = new Date(Date.parse(w.meta.lastTickAt) + 30 * 24 * 60 * 60 * 1000); // a month
    const h = tickHealth(w, later);
    expect(h.eraOver).toBe(true);
    expect(h.behind).toBe(0); // otherwise the dead-man switch pages someone nightly
    expect(h.losingTime).toBe(false);
  });

  it("an unwon world is unaffected — ticks and commands run as normal", () => {
    const w = seedWorld();
    w.players = { A: newEmpire({ id: "A", name: "Alpha", race: "human" }) };
    w.clans = {};
    const later = new Date(Date.parse(w.meta.lastTickAt) + 60 * 60 * 1000);
    expect(ticksDue(w, later)).toBe(6);
    expect(run(w, "setTax", { rate: 0.4 }).ok).toBe(true);
  });
});
