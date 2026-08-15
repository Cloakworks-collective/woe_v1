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

  it("vacation stops everything — revenge included", () => {
    // Even holding an open window. validateAttack has always refused a revenge
    // against a departed ruler; this is the console agreeing with it. The pair
    // barely arises anyway, since nobody may depart while owing revenge.
    const t = { onVacation: true, revengeOpen: true };
    for (const m of ALL) expect(modeBlocked(m, t), m).toMatch(/away from the world/i);
    expect(allModesBlocked(t)).toMatch(/vacation/i);
  });

  it("vacation with no revenge window blocks the lot", () => {
    const t = { onVacation: true };
    expect(allModesBlocked(t)).toMatch(/vacation/i);
  });

  it("revenge needs an open window", () => {
    expect(modeBlocked("revenge", {})).toMatch(/revenge/i);
    expect(modeBlocked("revenge", { revengeOpen: true })).toBeNull();
  });

  it("their vacation stops rangers and spies too, not just the army", () => {
    expect(covertBlocked({ onVacation: true })).toMatch(/vacation/i);
    expect(covertBlocked({ shielded: true })).toMatch(/shield/i);
    expect(covertBlocked({})).toBeNull();
  });

  it("no friendly fire — your own banner is closed to everything", () => {
    const t = { sameClan: true, revengeOpen: true };
    for (const m of ALL) expect(modeBlocked(m, t), m).toMatch(/own banner/i);
    expect(allModesBlocked(t)).toMatch(/own banner/i);
    expect(covertBlocked(t)).toMatch(/own banner/i);
  });

  it("your own seat offers nothing at all", () => {
    const t = { isSelf: true, revengeOpen: true };
    for (const m of ALL) expect(modeBlocked(m, t), m).toMatch(/your own empire/i);
    expect(allModesBlocked(t)).not.toBeNull();
    expect(covertBlocked(t)).not.toBeNull();
  });

  it("never opens on a mode nobody can pick", () => {
    for (const t of [
      {},
      { revengeOpen: true },
      { onVacation: true, revengeOpen: true },
      { sameClan: true, revengeOpen: true },
      { isSelf: true },
    ]) {
      const opened = defaultMode(t);
      if (allModesBlocked(t) === null) expect(modeBlocked(opened, t), JSON.stringify(t)).toBeNull();
    }
  });
});
