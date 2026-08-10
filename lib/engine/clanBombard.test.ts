import { describe, expect, it } from "vitest";
import { resolveClanBombard, validateAttack, type AttackContext } from "./combat";
import { newClan } from "./clanOps";
import { newEmpire } from "./newEmpire";
import { seededRng } from "./rng";
import type { Clan, Player } from "./types";

function gunner(id: string): Player {
  // A regent with crewed trebuchets ready to fire.
  const p = newEmpire({ id, name: id, race: "human" });
  p.army.siegeGear.trebuchets = 10;
  p.army.siegeEngineers = 100; // plenty of crew
  return p;
}

function enemyClan(): Clan {
  const c = newClan("enemy", "Rival Banner", newEmpire({ id: "e-lead", name: "e-lead", race: "human" }));
  c.members = ["e-lead", "e2"];
  c.buildings.storageLevel = 5;
  c.buildings.hallLevel = 3;
  c.buildings.wonderLevel = 2;
  return c;
}

const OPTS = { battleId: "b1", tick: 1000, rng: seededRng(3) };

describe("clan-building bombardment", () => {
  it("grinds the chosen structure's integrity toward the 50% floor", () => {
    const out = resolveClanBombard(gunner("A"), enemyClan(), "wonder", OPTS);
    expect(out.integrityLost).toBeGreaterThan(0);
    expect(out.clan.buildings.integrity.wonder).toBeGreaterThanOrEqual(0.5);
    expect(out.clan.buildings.integrity.wonder).toBeLessThan(1);
    // Untargeted structures are untouched.
    expect(out.clan.buildings.integrity.storage).toBe(1);
    expect(out.clan.buildings.integrity.hall).toBe(1);
  });

  it("never breaks a structure below the 50% floor, however long the barrage", () => {
    const heavy = gunner("A");
    heavy.army.siegeGear.trebuchets = 1000;
    const out = resolveClanBombard(heavy, enemyClan(), "storage", OPTS);
    expect(out.clan.buildings.integrity.storage).toBeGreaterThanOrEqual(0.5);
  });

  it("does nothing without crewed trebuchets", () => {
    const unarmed = newEmpire({ id: "A", name: "A", race: "human" });
    const out = resolveClanBombard(unarmed, enemyClan(), "hall", OPTS);
    expect(out.integrityLost).toBe(0);
    expect(out.clan.buildings.integrity.hall).toBe(1);
  });
});

describe("clan-bombardment revenge authorization", () => {
  const base: AttackContext = {
    currentTick: 1000,
    eraStartedAtTick: 0,
    eraPeaceTicks: 720,
    revengeWindowTicks: 108,
    clanWar: true,
  };

  it("authorizes a revenge with no personal window when the clan window is open", () => {
    // A far-stronger defender would normally be untouchable — clan revenge
    // overrides the refusal band and the yield like any revenge. (Vacation is
    // no longer among them: nobody may depart while owing revenge, so the
    // queue is the guard rather than a special case in combat.)
    const attacker = newEmpire({ id: "A", name: "A", race: "human" });
    const defender = newEmpire({ id: "D", name: "D", race: "human" });
    
    defender.buildings.walls = 10;
    defender.army.footmen.heavy = 100000; // dwarfs the attacker's score

    const blocked = validateAttack(attacker, defender, "revenge", base);
    expect(blocked).toMatch(/no revenge window/i);

    const allowed = validateAttack(attacker, defender, "revenge", {
      ...base,
      clanRevengeAuthorized: true,
    });
    expect(allowed).toBeNull();
  });
});
