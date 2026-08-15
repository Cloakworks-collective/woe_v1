import { describe, expect, it } from "vitest";
import {
  growthBreakdown,
  popPerDay,
  sampleGrowth,
  processDailyReset,
  prosperityGrowth,
  safetyGrowth,
  wallManning,
  wallsGrowth,
} from "./dailyReset";
import { newEmpire } from "./newEmpire";
import { bareArms } from "./reports";
import { POP_GROWTH, RESOURCE_BUILDING_IDS, SCORE } from "../constants";
import type { Player } from "./types";

function fresh(): Player {
  return newEmpire({ id: "t", name: "Test", race: "human" });
}

/** Stand in for a day of ticks that each sampled `rate` settlers. */
function withDay(p: Player, rate: number, samples = 144): Player {
  p.growthSum = rate * samples;
  p.growthSamples = samples;
  return p;
}

// per day = BASE(10) + safety(≤10) + prosperity(≤40) + walls(≤40), clamped
// to [10, 100], then gated by vacant beds.

describe("daily settler intake — the four terms", () => {
  it("a fresh empire gets the base 10 and nothing else", () => {
    const p = fresh();
    // 20 light footmen guarding 80 civilians = 25% → safety already pays.
    expect(prosperityGrowth(p)).toBe(0); // no resource buildings at founding
    expect(wallsGrowth(p)).toBe(0); // no walls
    const g = growthBreakdown(p);
    expect(g.base).toBe(POP_GROWTH.BASE);
    expect(g.total).toBe(g.base + g.safety);
  });

  it("safety pays in cumulative steps off the guard ratio", () => {
    const p = fresh();
    p.buildings.hearthstead = 100;
    p.idlePeasants = 1000; // 1,000 civilians
    const at = (guards: number) => {
      p.army.footmen.light = guards;
      return safetyGrowth(p);
    };
    expect(at(190)).toBe(0); // 19% — below the first step
    expect(at(200)).toBe(4); // 20%
    expect(at(250)).toBe(8); // 25%
    expect(at(300)).toBe(10); // 30% — the cap
    expect(at(900)).toBe(10); // no more beyond it
  });

  it("prosperity counts the four resource buildings and ignores storage", () => {
    const p = fresh();
    for (const id of RESOURCE_BUILDING_IDS) p.buildings[id] = 10;
    expect(prosperityGrowth(p)).toBe(POP_GROWTH.PROSPERITY_MAX); // 4 × 10 = 40
    const storageOnly = fresh();
    storageOnly.buildings.granary = 10;
    storageOnly.buildings.counting_house = 10;
    expect(prosperityGrowth(storageOnly)).toBe(0); // a full granary is not a job
  });

  it("walls pay 4 a level, scaled by integrity — when they are HELD", () => {
    const p = fresh();
    p.buildings.walls = 10;
    p.army.footmen.light = 10 * SCORE.WALL_TROOPS_PER_LEVEL; // fully manned
    expect(wallsGrowth(p)).toBe(40);
    p.wallIntegrity = 0.5;
    expect(wallsGrowth(p)).toBe(20);
    p.wallIntegrity = 0; // rubble reassures nobody
    expect(wallsGrowth(p)).toBe(0);
  });

  it("an EMPTY wall draws nobody — settlers pay for stone they can stand behind", () => {
    const p = fresh();
    p.buildings.walls = 10;
    p.army.footmen = { light: 0, medium: 0, heavy: 0 };
    p.army.siegeEngineers = 0;
    expect(wallManning(p)).toBe(0);
    expect(wallsGrowth(p)).toBe(0);
  });

  it("credits a half-held wall pro rata", () => {
    const p = fresh();
    p.buildings.walls = 10;
    p.army.footmen.light = 5 * SCORE.WALL_TROOPS_PER_LEVEL; // half the garrison
    expect(wallManning(p)).toBeCloseTo(0.5, 6);
    expect(wallsGrowth(p)).toBe(20);
  });

  it("counts REGULARS only — a sellsword watches, it does not hold", () => {
    const p = fresh();
    p.buildings.walls = 5;
    p.army.footmen = { light: 0, medium: 0, heavy: 0 };
    p.army.siegeEngineers = 0;
    p.army.mercenaries.footmen.light = 5 * SCORE.WALL_TROOPS_PER_LEVEL;
    expect(wallsGrowth(p)).toBe(0);
  });

  it("never over-credits past a full garrison", () => {
    const p = fresh();
    p.buildings.walls = 2;
    p.army.footmen.light = 99_999;
    expect(wallManning(p)).toBe(1);
    expect(wallsGrowth(p)).toBe(2 * POP_GROWTH.WALLS_PER_LEVEL);
  });

  it("a maxed empire lands exactly on 100/day, and never above", () => {
    const p = fresh();
    p.buildings.hearthstead = 500;
    p.idlePeasants = 1000;
    // Enough regulars to both clear the safety cap AND hold a level-10 wall.
    p.army.footmen.light = 10 * SCORE.WALL_TROOPS_PER_LEVEL;
    for (const id of RESOURCE_BUILDING_IDS) p.buildings[id] = 10;
    p.buildings.walls = 10;
    const g = growthBreakdown(p);
    expect([g.base, g.safety, g.prosperity, g.walls]).toEqual([10, 10, 40, 40]);
    expect(g.total).toBe(POP_GROWTH.MAX);
  });

  it("never drops below the floor of 10", () => {
    const p = fresh();
    p.army.footmen = { light: 0, medium: 0, heavy: 0 }; // no guard at all
    expect(popPerDay(p)).toBe(POP_GROWTH.MIN);
  });
});

describe("daily reset — recruitment", () => {
  it("arrivals beyond vacant housing are lost, not queued", () => {
    const p = fresh();
    for (const id of RESOURCE_BUILDING_IDS) p.buildings[id] = 10; // +40
    p.buildings.walls = 10; // +40
    p.buildings.hearthstead = 9; // 90 beds, 80 civilians → 10 vacant
    const perDay = popPerDay(p);
    withDay(p, perDay); // a whole day at full rate, unconstrained
    const { player, events } = processDailyReset(p);
    expect(player.idlePeasants).toBe(90); // only 10 beds to land in
    expect(events).toContainEqual({
      type: "dailyRecruitment",
      arrived: 10,
      turnedAway: perDay - 10,
    });
  });

  it("no recruitment while starving", () => {
    const p = fresh();
    p.starving = true;
    withDay(p, 0); // a starving day samples zero, every tick
    const { player } = processDailyReset(p);
    expect(player.idlePeasants).toBe(80);
  });
});

// The whole reason recruitment is averaged: paying on a single dawn reading
// makes the last minute before dawn the only minute that matters.
describe("recruitment is a 24-hour average of CAPPED samples", () => {
  it("pays the mean of the day, not the rate at dawn", () => {
    const p = fresh();
    p.buildings.hearthstead = 500;
    p.growthSamples = 144;
    p.growthSum = 0 * 72 + 100 * 72; // idle half the day, full the other half
    const { events } = processDailyReset(p);
    expect(events).toContainEqual(
      expect.objectContaining({ type: "dailyRecruitment", arrived: 50 }),
    );
  });

  it("rounds the average UP, so a trickle is never nothing", () => {
    const p = fresh();
    p.buildings.hearthstead = 500;
    withDay(p, 0);
    p.growthSum = 1; // a single settler's worth across the whole day
    const { player } = processDailyReset(p);
    expect(player.idlePeasants).toBe(81); // ceil(1/144) = 1
  });

  it("a last-minute Hearthstead buys almost nothing today", () => {
    // Housing full all day → every sample capped to 0 → the beds bought at the
    // 144th tick cannot retroactively house a day of settlers.
    const p = fresh();
    p.buildings.hearthstead = 8; // exactly houses the 80 starting civilians
    for (let t = 1; t <= 143; t++) sampleGrowth(p, t);
    expect(p.growthSum).toBe(0);
    p.buildings.hearthstead = 500; // the 23:59 purchase
    sampleGrowth(p, 144);
    const { player, events } = processDailyReset(p);
    const arrived = (events.find((e) => e.type === "dailyRecruitment") as { arrived: number }).arrived;
    expect(arrived).toBeLessThanOrEqual(1); // ceil(oneSample / 144)
    expect(player.growthSamples).toBe(0); // ledger resets for the new day
    expect(player.growthSum).toBe(0);
  });

  it("an empire founded at dusk is not charged for the hours before it existed", () => {
    const p = fresh();
    p.buildings.hearthstead = 500;
    withDay(p, 60, 6); // only six ticks of life so far
    const { events } = processDailyReset(p);
    // Averaged over its OWN 6 samples, not over a flat 144.
    expect(events).toContainEqual(
      expect.objectContaining({ type: "dailyRecruitment", arrived: 60 }),
    );
  });
});

describe("daily reset — scattering", () => {
  it("scatters down to the 20% line, idle first", () => {
    const p = fresh();
    p.buildings.hearthstead = 200;
    p.idlePeasants = 500;
    p.workers.farmers = 496; // civilians = 996 + 4 arrivals = 1,000
    p.army.footmen.light = 100; // guard 100 < 0.2 × 1,000
    withDay(p, 10); // a day sampled at the base rate
    const { player, events } = processDailyReset(p);
    // 10 settlers arrive first (the averaged intake), so 1,006 civilians face a
    // 100-strong guard: keep = floor(100 / 0.2) = 500, and 506 walk away.
    const scattered = events.find((e) => e.type === "scattering");
    expect(scattered).toEqual({ type: "scattering", lost: 506 });
    expect(player.idlePeasants).toBe(4); // idle bled first, arrivals survive
    expect(player.workers.farmers).toBe(496);
  });

  it("empires below 500 total population never scatter", () => {
    const p = fresh();
    p.buildings.hearthstead = 50;
    p.idlePeasants = 380; // civilians ≈ 381 after arrival, military 20 → way under 30%
    withDay(p, 10);
    const { events } = processDailyReset(p);
    expect(events.some((e) => e.type === "scattering")).toBe(false);
  });

  it("a healthy garrison prevents scattering", () => {
    const p = fresh();
    p.buildings.hearthstead = 100;
    p.buildings.muster_hall = 40;
    p.idlePeasants = 700; // civilians ≈ 781
    p.army.footmen.light = 300; // 300 ≥ 0.3 × 781
    const { events } = processDailyReset(p);
    expect(events.some((e) => e.type === "scattering")).toBe(false);
  });
});

// A BARE arm is regulars with no sellswords of the same arm in front of them.
// Hired blades take the first 70% of every blow aimed at their arm, so a bare
// arm puts real population in the front rank — which is why the councillor
// raises it (see AdvisorAlerts) and the Census badges it.
describe("bare arms", () => {
  const p0 = () => {
    const p = newEmpire({ id: "b", name: "b", race: "human" });
    p.army.footmen = { light: 0, medium: 0, heavy: 0 };
    p.army.archers = { light: 0, medium: 0, heavy: 0 };
    p.army.cavalry = { light: 0, medium: 0, heavy: 0 };
    return p;
  };

  it("names an arm with regulars and no screen", () => {
    const p = p0();
    p.army.footmen.light = 100;
    expect(bareArms(p)).toEqual(["footmen"]);
  });

  it("says nothing about an arm that HAS a screen", () => {
    const p = p0();
    p.army.footmen.light = 100;
    p.army.mercenaries.footmen.light = 1;
    expect(bareArms(p)).toEqual([]);
  });

  it("ignores an arm you do not field at all — nothing to protect", () => {
    const p = p0();
    expect(bareArms(p)).toEqual([]);
  });

  it("does not let one arm's sellswords cover another", () => {
    const p = p0();
    p.army.cavalry.heavy = 50;
    p.army.mercenaries.footmen.light = 500; // wrong arm entirely
    expect(bareArms(p)).toEqual(["cavalry"]);
  });

  it("lists every bare arm", () => {
    const p = p0();
    p.army.footmen.light = 10;
    p.army.archers.light = 10;
    p.army.cavalry.light = 10;
    expect(bareArms(p)).toEqual(["footmen", "archers", "cavalry"]);
  });
});
