import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BOMBARDABLE } from "./battleBalance";
import { artStage, type BuildingId } from "./buildings";

// The damaged sprites (`<stage>-hurt.png` / `<stage>-wreck.png`) are drawn a
// structure at a time, and DamagedArt falls back a band at a time when one is
// missing. These guard the rollout: a half-drawn structure must degrade to the
// band below rather than snapping back to a pristine picture of a wrecked store.

const ART = join(process.cwd(), "public", "art", "buildings");
const has = (id: string, file: string) => existsSync(join(ART, id, `${file}.png`));

/** The reachable art stages of a 1–10 ladder — every bombardable is one. */
const STAGES = [1, 2, 3];

/** Structures whose damaged art is finished: every stage, both bands. */
const COMPLETE: BuildingId[] = [
  "walls",
  // stores
  "granary", "timberyard", "masons_yard", "ironhold", "counting_house",
  // producers
  "grange", "masons_quarry", "deepvein_mine", "sawyers_mill",
  // knowledge
  "collegium",
  // roofs
  "hearthstead", "muster_hall",
  // trade
  "market_square",
];

/**
 * Known, deliberate gaps — sprites not yet drawn.
 *
 * Empty as of 2026-08-13: every bombard target has both damage bands at every
 * stage. Keep the map (and this comment) rather than deleting it — the next
 * structure added to BOMBARDABLE will arrive undrawn, and a named gap here is
 * a decision somebody wrote down instead of a sprite that quietly never got
 * drawn. DamagedArt steps DOWN a band when one is missing, so a listed gap
 * degrades to the band below rather than snapping back to a pristine picture.
 */
const MISSING: Record<string, string[]> = {};

describe("damaged building art", () => {
  it("covers every stage and band for the structures declared complete", () => {
    const missing: string[] = [];
    for (const id of COMPLETE) {
      for (const stage of STAGES) {
        for (const band of ["-hurt", "-wreck"]) {
          if (!has(id, `${stage}${band}`)) missing.push(`${id}/${stage}${band}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("gives every bombard target at least a -hurt sprite at every stage", () => {
    // This is the floor: with the band fallback, a `-hurt` sprite means a
    // shelled building ALWAYS looks shelled, whatever its integrity.
    const undrawn: string[] = [];
    for (const { id } of BOMBARDABLE) {
      for (const stage of STAGES) {
        if (!has(id, `${stage}-hurt`)) undrawn.push(`${id}/${stage}-hurt`);
      }
    }
    expect(undrawn).toEqual([]);
  });

  it("has no undocumented gaps", () => {
    // Anything missing must be listed in MISSING above, so a gap is a decision
    // somebody wrote down rather than a sprite that quietly never got drawn.
    const gaps: string[] = [];
    for (const { id } of BOMBARDABLE) {
      for (const stage of STAGES) {
        for (const band of ["-hurt", "-wreck"]) {
          const file = `${stage}${band}`;
          if (!has(id, file) && !(MISSING[id] ?? []).includes(file)) {
            gaps.push(`${id}/${file}`);
          }
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it("never has a wreck sprite without the hurt sprite below it", () => {
    // DamagedArt steps DOWN a band, so a -wreck with no -hurt would leave the
    // 70–100% band showing pristine art.
    const orphans: string[] = [];
    for (const { id } of BOMBARDABLE) {
      for (const stage of STAGES) {
        if (has(id, `${stage}-wreck`) && !has(id, `${stage}-hurt`)) {
          orphans.push(`${id}/${stage}`);
        }
      }
    }
    expect(orphans).toEqual([]);
  });

  it("agrees with artStage about which stages are reachable", () => {
    // If the stage mapping ever grows a fourth form, the sprites above are
    // silently incomplete — this is the tripwire.
    const reached = new Set(Array.from({ length: 10 }, (_, i) => artStage("granary", i + 1)));
    expect([...reached].sort()).toEqual(STAGES);
  });
});
