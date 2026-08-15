// MEDICINE — the field hospital.
//
// The rules that carry the design are the RESTRICTIONS, so that is what these
// pin: defender only, sellswords only, never past the cap, and paid for in food.

import { describe, expect, it } from "vitest";
import { MAX_FIELD_LEVEL, MEDICINE } from "../constants";
import { fieldHospital, noMercFallen, type MercFallen } from "./combat/model";
import { newEmpire } from "./newEmpire";
import { resolveBattle } from "./combat/battle";
import { seededRng } from "./rng";
import { mercTotal, troopTotal } from "./types";
import type { Player } from "./types";

const fresh = (): Player => newEmpire({ id: "t", name: "T", race: "human" });

/** An empire with regulars enough to command sellswords, and food to treat them. */
function host(): Player {
  const p = fresh();
  p.army.footmen.light = 300;
  p.army.cavalry.heavy = 300;
  p.army.siegeEngineers = 300;
  p.resources.food = 1_000_000;
  return p;
}

const fell = (line: MercFallen["line"], engineers = 0): MercFallen => ({ line, engineers });

describe("fieldHospital — how many come back", () => {
  it("does nothing at level 0", () => {
    const p = host();
    const r = fieldHospital(p, fell({ footman: { light: 100, medium: 0, heavy: 0 } }), 0);
    expect(r.recovered).toBe(0);
    expect(r.foodSpent).toBe(0);
  });

  it("recovers the per-level share of the fallen", () => {
    const p = host();
    // 100 dead at level 5 → 4% × 5 = 20%.
    const r = fieldHospital(p, fell({ footman: { light: 100, medium: 0, heavy: 0 } }), 5);
    expect(r.recovered).toBe(20);
    expect(p.army.mercenaries.footmen.light).toBe(20);
  });

  it("guarantees a head per level, so a small skirmish still shows something", () => {
    const p = host();
    // 4 dead at level 3: the share rounds to 0, the floor gives 3.
    const r = fieldHospital(p, fell({ footman: { light: 4, medium: 0, heavy: 0 } }), 3);
    expect(Math.round(4 * MEDICINE.RECOVER_PER_LEVEL * 3)).toBe(0);
    expect(r.recovered).toBe(MEDICINE.MIN_PER_LEVEL * 3);
  });

  it("never recovers more than actually fell", () => {
    const p = host();
    const r = fieldHospital(p, fell({ footman: { light: 2, medium: 0, heavy: 0 } }), MAX_FIELD_LEVEL);
    expect(r.recovered).toBe(2);
  });

  it("saves the dearest contracts first", () => {
    const p = host();
    // 100 dead at level 1 → 4% = 4 saved, and all four should be the heavy
    // horsemen rather than the light foot who died in front of them.
    const r = fieldHospital(
      p,
      fell({ footman: { light: 50, medium: 0, heavy: 0 }, cavalry: { light: 0, medium: 0, heavy: 50 } }),
      1,
    );
    expect(r.recovered).toBe(4);
    expect(p.army.mercenaries.cavalry.heavy).toBe(4);
    expect(p.army.mercenaries.footmen.light).toBe(0);
  });
});

describe("fieldHospital — what it costs", () => {
  it("spends food per head", () => {
    const p = host();
    const before = p.resources.food;
    const r = fieldHospital(p, fell({ footman: { light: 100, medium: 0, heavy: 0 } }), 5);
    expect(r.foodSpent).toBe(r.recovered * MEDICINE.FOOD_PER_RECOVERY);
    expect(p.resources.food).toBe(before - r.foodSpent);
  });

  it("treats partially when the granary is short", () => {
    const p = host();
    p.resources.food = MEDICINE.FOOD_PER_RECOVERY * 3; // enough for three
    p.bankedResources = { food: 0, wood: 0, stone: 0, ore: 0 };
    const r = fieldHospital(p, fell({ footman: { light: 100, medium: 0, heavy: 0 } }), 5);
    expect(r.recovered).toBe(3);
  });

  it("may open the vault — nobody dies beside a full granary", () => {
    const p = host();
    p.resources.food = 0;
    p.bankedResources = { food: MEDICINE.FOOD_PER_RECOVERY * 5, wood: 0, stone: 0, ore: 0 };
    const r = fieldHospital(p, fell({ footman: { light: 100, medium: 0, heavy: 0 } }), 5);
    expect(r.recovered).toBe(5);
    expect(p.bankedResources.food).toBe(0);
  });

  it("saves nobody with no food at all", () => {
    const p = host();
    p.resources.food = 0;
    p.bankedResources = { food: 0, wood: 0, stone: 0, ore: 0 };
    expect(fieldHospital(p, fell({ footman: { light: 100, medium: 0, heavy: 0 } }), 5).recovered).toBe(0);
  });
});

describe("fieldHospital — the cap still rules", () => {
  it("will not revive a sellsword there are no regulars to command", () => {
    const p = fresh();
    p.resources.food = 1_000_000;
    p.army.footmen.light = 0; // no regulars of that arm at all
    const r = fieldHospital(p, fell({ footman: { light: 100, medium: 0, heavy: 0 } }), 5);
    expect(r.recovered).toBe(0);
    expect(r.foodSpent).toBe(0);
  });

  it("fills only the room the cap leaves", () => {
    const p = fresh();
    p.resources.food = 1_000_000;
    p.army.footmen.light = 30; // cap = 10
    p.army.mercenaries.footmen.light = 8; // room for 2
    const r = fieldHospital(p, fell({ footman: { light: 100, medium: 0, heavy: 0 } }), 5);
    expect(r.recovered).toBe(2);
    expect(p.army.mercenaries.footmen.light).toBe(10);
  });
});

describe("in a real battle", () => {
  const opts = { rng: seededRng(7), battleId: "b", tick: 1000 };

  /** Evenly matched on purpose: a lopsided raid ends in a YIELD, where almost
   *  nobody dies and there is nothing for the surgeons to do. */
  function pair(): { a: Player; d: Player } {
    const a = fresh();
    a.id = "A";
    a.army.footmen.heavy = 400;
    a.army.cavalry.heavy = 100;
    a.shieldUntilTick = 0;
    const d = fresh();
    d.id = "D";
    d.army.footmen.heavy = 400;
    d.army.cavalry.heavy = 100;
    d.army.mercenaries.footmen.heavy = 100;
    d.resources.food = 1_000_000;
    d.shieldUntilTick = 0;
    return { a, d };
  }

  it("gives the DEFENDER back sellswords, and reports it", () => {
    const { a, d } = pair();
    d.research.levels.medicine = MAX_FIELD_LEVEL;
    const plain = resolveBattle(a, { ...structuredClone(d), research: { ...d.research, levels: {} } }, "raid", { ...opts, rng: seededRng(7) });
    const healed = resolveBattle(a, d, "raid", { ...opts, rng: seededRng(7) });
    expect(healed.report.mercsRecovered ?? 0).toBeGreaterThan(0);
    expect(mercTotal(healed.defender.army.mercenaries)).toBeGreaterThan(
      mercTotal(plain.defender.army.mercenaries),
    );
  });

  it("does NOT help the attacker — it is a hospital, not a baggage train", () => {
    const { a, d } = pair();
    a.army.mercenaries.footmen.heavy = 100;
    a.research.levels.medicine = MAX_FIELD_LEVEL;
    a.resources.food = 1_000_000;
    const out = resolveBattle(a, d, "raid", { ...opts, rng: seededRng(11) });
    expect(out.report.mercsRecovered ?? 0).toBe(0);
  });

  it("never touches the defender's own regular dead", () => {
    const { a, d } = pair();
    // Count the WHOLE arm, not one tier: newEmpire seeds a light levy on top of
    // whatever the test sets, and casualties drain light before heavy.
    const startFoot = troopTotal(d.army.footmen);
    d.research.levels.medicine = MAX_FIELD_LEVEL;
    const out = resolveBattle(a, d, "raid", { ...opts, rng: seededRng(7) });
    const lost = out.report.defenderLosses;
    expect(lost.footmen + lost.archers + lost.cavalry).toBeGreaterThan(0);
    expect(out.report.mercsRecovered ?? 0).toBeGreaterThan(0);
    // Regulars on the books = start − reported losses, with nothing added back.
    expect(troopTotal(out.defender.army.footmen)).toBe(startFoot - lost.footmen);
  });
});
