import { describe, expect, it } from "vitest";
import { MS_PER_HOUR, overlordHold, seedWorld, updateCrown } from "./world";
import { newEmpire, type Player } from "../engine";
import { ARMY_FLOORS, HOLD_CLOCKS } from "../constants";
import type { World } from "./store";
import type { BuildingId } from "../constants/buildings";

// A fresh world containing exactly the given players and no clans/bots.
function worldWith(...players: Player[]): World {
  const w = seedWorld();
  w.players = {};
  for (const p of players) w.players[p.id] = p;
  w.clans = {};
  return w;
}

// Eligible for the solo crown: a real army (ARMY_FLOORS.INDIVIDUAL regulars),
// never clanned, and the top score by a mile.
const bigPop = (id: string) => {
  const p = newEmpire({ id, name: id, race: "human" });
  p.idlePeasants = 30_000; // the top score
  p.army.footmen.light = ARMY_FLOORS.INDIVIDUAL; // clears the army floor
  return p;
};

describe("§14.3 — event-driven, ms-accurate hold clocks", () => {
  it("credits the #1 by exact elapsed ms while above the floor", () => {
    const a = bigPop("A");
    const w = worldWith(a, newEmpire({ id: "B", name: "B", race: "human" }));

    updateCrown(w, 1_000); // A takes the crown
    expect(w.meta.crownHolderId).toBe("A");
    expect(w.meta.overlordAccruing?.id).toBe("A");

    updateCrown(w, 4_000); // still A, 3s later
    const h = overlordHold(w, 4_000);
    expect(h.holderId).toBe("A");
    expect(h.cumMs).toBe(3_000);
    expect(h.streakMs).toBe(3_000);
  });

  it("a crown that flips inside one tick credits each holder for exactly their moment", () => {
    const a = bigPop("A");
    const b = bigPop("B"); // both army-eligible — this is about the clock, not the floor
    b.idlePeasants = 100;
    const w = worldWith(a, b);

    updateCrown(w, 0); // A crowned at t0
    updateCrown(w, 3_000); // A still #1

    b.idlePeasants = 60_000; // B overtakes
    updateCrown(w, 3_000); // close A's 3s, open B
    expect(w.meta.overlordClocksMs["A"]).toBe(3_000);
    expect(w.meta.overlordAccruing?.id).toBe("B");

    updateCrown(w, 5_000); // B has held 2s
    a.idlePeasants = 90_000; // A retakes
    updateCrown(w, 6_000); // close B's 3s (3000→6000), reopen A
    expect(w.meta.overlordClocksMs["B"]).toBe(3_000);

    const ha = overlordHold(w, 7_000); // A: 3s banked + 1s open
    expect(ha.holderId).toBe("A");
    expect(ha.cumMs).toBe(4_000);
    expect(ha.streakMs).toBe(1_000); // streak reset when knocked off and back
  });

  it("freezes the clock while the #1 is below the ARMY floor", () => {
    // A is #1 by buildings but fields almost no regulars → no accrual.
    const a = newEmpire({ id: "A", name: "A", race: "human" });
    a.idlePeasants = 100;
    const all: BuildingId[] = [
      "grange", "masons_quarry", "deepvein_mine", "sawyers_mill", "granary", "timberyard",
      "masons_yard", "ironhold", "counting_house", "market_square", "collegium", "shadow_guild",
      "rangers_lodge", "drill_yard", "fletchers_range", "knights_stables", "forge", "war_foundry", "walls",
    ];
    for (const id of all) a.buildings[id] = 10;
    const b = newEmpire({ id: "B", name: "B", race: "human" });
    b.idlePeasants = 50;
    const w = worldWith(a, b);

    updateCrown(w, 0);
    expect(w.meta.crownHolderId).toBe("A"); // still recognised as #1 for the Annals
    expect(w.meta.overlordAccruing).toBeNull(); // …but nothing accrues
    updateCrown(w, 10_000);
    expect(overlordHold(w, 10_000).cumMs).toBe(0);
  });

  it("logs a Chronicle tiding when a ruler's Grand Overlord clock starts and stops", () => {
    const a = bigPop("A");
    const b = bigPop("B"); // also army-eligible, so the clock can pass to them
    b.idlePeasants = 100;
    const w = worldWith(a, b);

    updateCrown(w, 0); // A becomes the eligible #1 → clock starts
    const gained = (w.inbox["A"] ?? []).some(
      (i) => i.event.type === "crownClock" && i.event.scope === "overlord" && i.event.gained,
    );
    expect(gained).toBe(true);

    b.idlePeasants = 60_000; // B overtakes A
    updateCrown(w, 1_000);
    expect((w.inbox["A"] ?? []).some((i) => i.event.type === "crownClock" && !i.event.gained)).toBe(true);
    expect((w.inbox["B"] ?? []).some((i) => i.event.type === "crownClock" && i.event.gained)).toBe(true);
  });

  it("declares a winner once cumulative AND streak thresholds are met", () => {
    const a = bigPop("A");
    const w = worldWith(a, newEmpire({ id: "B", name: "B", race: "human" }));

    updateCrown(w, 0);
    expect(w.meta.winner).toBeUndefined();
    // Held continuously for the full cumulative window (so streak is also full).
    updateCrown(w, HOLD_CLOCKS.CUMULATIVE_HOURS * MS_PER_HOUR);
    expect(w.meta.winner?.kind).toBe("overlord");
    expect(w.meta.winner?.id).toBe("A");
  });
});
