import { describe, expect, it } from "vitest";
import { newEmpire } from "./newEmpire";
import { rankingBreakdown, rankingScore } from "./score";
import type { Player } from "./types";

// A score must never be NaN. The Records page filters on `rankingScore(p) > 0`
// and NaN > 0 is false, so one legacy empire with a missing field emptied the
// whole Greatest Rulers table and printed "NaN pts" on the dashboard.
const PATHS = [
  "wallIntegrity", "army.experiencePoints", "army.scouts", "army.spies",
  "army.siegeEngineers", "army.mercenaries.engineers", "army.siegeCounters",
  "army.mercenaries.footmen", "army.mercenaries", "idlePeasants", "workers",
  "research.levels", "research", "army.footmen", "army.archers", "army.cavalry",
  "buildings", "army",
];

function without(path: string): Player {
  const p = structuredClone(newEmpire({ id: "a", name: "a", race: "human" })) as unknown as Record<string, unknown>;
  const parts = path.split(".");
  let o = p as Record<string, unknown>;
  for (const k of parts.slice(0, -1)) o = o[k] as Record<string, unknown>;
  delete o[parts[parts.length - 1]];
  return p as unknown as Player;
}

describe("rankingScore survives legacy saves", () => {
  it.each(PATHS)("returns a finite score with %s missing", (path) => {
    const s = rankingScore(without(path));
    expect(Number.isFinite(s), `${path} produced ${s}`).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
  });

  it("survives an unknown race", () => {
    const p = newEmpire({ id: "a", name: "a", race: "human" });
    (p as unknown as { race: string }).race = "wyvern";
    expect(Number.isFinite(rankingScore(p))).toBe(true);
  });

  it("still scores a healthy empire the same way", () => {
    const p = newEmpire({ id: "a", name: "a", race: "human" });
    p.army.footmen = { light: 100, medium: 0, heavy: 0 };
    expect(rankingScore(p)).toBeGreaterThan(0);
  });
});

// The tooltip on the Command View quotes these parts beside the total. If they
// ever stop adding up to it, the panel is lying about the player's own number.
describe("rankingBreakdown adds up to rankingScore", () => {
  const cases: [string, (p: Player) => void][] = [
    ["a fresh empire", () => {}],
    ["a big army", (p) => {
      p.army.footmen.heavy = 500;
      p.army.archers.medium = 300;
      p.army.cavalry.light = 120;
    }],
    ["sellswords and engineers", (p) => {
      p.army.footmen.light = 300;
      p.army.mercenaries.footmen.light = 90;
      p.army.siegeEngineers = 40;
      p.army.mercenaries.engineers = 10;
    }],
    ["walls and counters", (p) => {
      p.buildings.walls = 8;
      p.wallIntegrity = 0.7;
      p.army.siegeEngineers = 60;
      p.army.siegeCounters.counter_engine = 6;
      p.army.footmen.heavy = 900;
    }],
    ["veterancy and research", (p) => {
      p.army.experiencePoints = 3_650_000;
      p.research.levels.art_of_war = 5;
      p.research.levels.siegecraft = 3;
      p.research.levels.tradecraft = 5; // unranked — must NOT show up
    }],
  ];

  for (const [name, setup] of cases) {
    it(name, () => {
      const p = newEmpire({ id: "x", name: "x", race: "human" });
      setup(p);
      const parts = rankingBreakdown(p);
      const summed = parts.reduce((t, part) => t + part.points, 0);
      expect(Math.round(summed)).toBe(rankingScore(p));
      expect(parts.length).toBeGreaterThan(0);
    });
  }

  it("holds for every race", () => {
    for (const race of ["human", "elf", "dwarf", "orc", "troll", "gnoll"] as const) {
      const p = newEmpire({ id: "x", name: "x", race });
      p.army.cavalry.heavy = 200;
      p.buildings.walls = 5;
      p.army.footmen.heavy = 1000;
      const summed = rankingBreakdown(p).reduce((t, part) => t + part.points, 0);
      expect(Math.round(summed), race).toBe(rankingScore(p));
    }
  });
});
