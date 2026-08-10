import { describe, expect, it } from "vitest";
import { buildSpectatorSnapshot } from "./analytics";
import { seedWorld, updateCrown } from "./world";
import { newEmpire } from "../engine";
import { ARMY_FLOORS } from "../constants";

describe("§14.4 — buildSpectatorSnapshot (pure)", () => {
  it("builds a score-sorted top-N ladder with the live crown view", () => {
    const w = seedWorld();
    const a = newEmpire({ id: "A", name: "Alpha", race: "orc" });
    a.idlePeasants = 30_000; // top score
    a.army.footmen.light = ARMY_FLOORS.INDIVIDUAL; // and army-eligible for the crown
    const b = newEmpire({ id: "B", name: "Beta", race: "elf" });
    b.idlePeasants = 5_000;
    w.players = { A: a, B: b };
    w.clans = {};

    updateCrown(w, 1_000); // A takes the crown
    updateCrown(w, 4_000); // A holds 3s

    const snap = buildSpectatorSnapshot(w, 4_000);
    expect(snap.ladder.map((r) => r.id)).toEqual(["A", "B"]); // sorted by score
    expect(snap.ladder[0].name).toBe("Alpha");
    expect(snap.crown.overlord.holderId).toBe("A");
    expect(snap.crown.overlord.name).toBe("Alpha");
    expect(snap.crown.overlord.cumMs).toBe(3_000);
    expect(snap.crown.overlord.streakMs).toBe(3_000);
    expect(snap.eraName).toBe(w.meta.eraName);
    expect(snap.tick).toBe(w.meta.tickNumber);
  });
});
