import { describe, expect, it } from "vitest";
import {
  allModesBlocked,
  covertBlocked,
  defaultMode,
  modeBlocked,
  type AttackMode,
} from "./attackGating";

const ALL: AttackMode[] = ["raid", "siege", "revenge", "bombard"];

// Both consoles gate on this one function. If it disagrees with validateAttack
// the UI lies; if the two consoles gated separately they would drift.
describe("attack gating", () => {
  it("the newcomer shield stops everything, including covert work", () => {
    const t = { shielded: true, revengeOpen: true };
    for (const m of ALL) expect(modeBlocked(m, t), m).toMatch(/shield/i);
    expect(allModesBlocked(t)).toMatch(/shield/i);
    expect(covertBlocked(t)).toMatch(/shield/i);
  });

  it("vacation stops everything EXCEPT an open revenge", () => {
    const t = { onVacation: true, revengeOpen: true };
    expect(modeBlocked("revenge", t)).toBeNull();
    for (const m of ["raid", "siege", "bombard"] as AttackMode[]) {
      expect(modeBlocked(m, t), m).toMatch(/vacation/i);
    }
    expect(allModesBlocked(t)).toBeNull(); // revenge is still live
    expect(defaultMode(t)).toBe("revenge");
  });

  it("vacation with no revenge window blocks the lot", () => {
    const t = { onVacation: true };
    expect(allModesBlocked(t)).toMatch(/vacation/i);
  });

  it("revenge needs an open window", () => {
    expect(modeBlocked("revenge", {})).toMatch(/revenge/i);
    expect(modeBlocked("revenge", { revengeOpen: true })).toBeNull();
  });

  it("scouting is not stopped by their vacation — only by the shield", () => {
    expect(covertBlocked({ onVacation: true })).toBeNull();
    expect(covertBlocked({})).toBeNull();
    expect(covertBlocked({ shielded: true })).not.toBeNull();
  });

  it("never opens on a mode nobody can pick", () => {
    for (const t of [{}, { revengeOpen: true }, { onVacation: true, revengeOpen: true }]) {
      const opened = defaultMode(t);
      if (allModesBlocked(t) === null) expect(modeBlocked(opened, t), JSON.stringify(t)).toBeNull();
    }
  });
});
