import { describe, expect, it } from "vitest";
import { newEmpire } from "./newEmpire";
import { rankingScore } from "./score";
import type { Player } from "./types";

// A score must never be NaN. The Records page filters on `rankingScore(p) > 0`
// and NaN > 0 is false, so one legacy empire with a missing field emptied the
// whole Greatest Rulers table and printed "NaN pts" on the dashboard.
const PATHS = [
  "wallIntegrity", "army.experience", "army.scouts", "army.spies",
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
