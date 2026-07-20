import { describe, expect, it } from "vitest";
import { processDailyReset, popPerDay, rawGrowthPerDay } from "./dailyReset";
import { newEmpire } from "./newEmpire";
import { CIVILIAN_LEVELLED_IDS } from "../constants";
import type { Player } from "./types";

function fresh(): Player {
  return newEmpire({ id: "t", name: "Test", race: "human" });
}

describe("daily reset — recruitment", () => {
  it("fresh empire gets 4 peasants/day (5 starting storage levels)", () => {
    // 1 + 99 × (5/130) = 4.8 → floor 4
    const { player, events } = processDailyReset(fresh());
    expect(player.idlePeasants).toBe(84);
    expect(events).toContainEqual({ type: "dailyRecruitment", arrived: 4, turnedAway: 0 });
  });

  it("all 13 civilian buildings at 10 → 100/day", () => {
    const p = fresh();
    for (const id of CIVILIAN_LEVELLED_IDS) p.buildings[id] = 10;
    expect(rawGrowthPerDay(p)).toBe(100);
  });

  it("rubbled walls halve the daily rate", () => {
    const p = fresh();
    for (const id of CIVILIAN_LEVELLED_IDS) p.buildings[id] = 10;
    p.buildings.walls = 3;
    p.wallIntegrity = 0; // fully damaged
    expect(popPerDay(p)).toBe(50);
  });

  it("arrivals beyond vacant housing are lost, not queued", () => {
    const p = fresh();
    for (const id of CIVILIAN_LEVELLED_IDS) p.buildings[id] = 10; // 100/day
    p.buildings.hearthstead = 9; // 90 beds, 80 civilians → 10 vacant
    const { player, events } = processDailyReset(p);
    expect(player.idlePeasants).toBe(90);
    expect(events).toContainEqual({ type: "dailyRecruitment", arrived: 10, turnedAway: 90 });
  });

  it("no recruitment while starving", () => {
    const p = fresh();
    p.starving = true;
    const { player } = processDailyReset(p);
    expect(player.idlePeasants).toBe(80);
  });
});

describe("daily reset — scattering", () => {
  it("scatters down to the 30% line, idle first", () => {
    const p = fresh();
    p.buildings.hearthstead = 200;
    p.idlePeasants = 500;
    p.workers.farmers = 496; // civilians = 996 + 4 arrivals = 1,000
    p.army.footmen.light = 100; // military 100 < 0.3 × 1,000
    const { player, events } = processDailyReset(p);
    // keep = floor(100 / 0.3) = 333 civilians
    const scattered = events.find((e) => e.type === "scattering");
    expect(scattered).toEqual({ type: "scattering", lost: 667 });
    expect(player.idlePeasants).toBe(0); // idle bled first (504 incl. arrivals)
    expect(player.workers.farmers).toBe(333);
  });

  it("empires below 500 total population never scatter", () => {
    const p = fresh();
    p.buildings.hearthstead = 50;
    p.idlePeasants = 380; // civilians ≈ 381 after arrival, military 20 → way under 30%
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
