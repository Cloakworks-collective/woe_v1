import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIES, CURVES, SCALARS } from "./catalog";

// ONE SLIDER PER CONSTANT.
//
// The workbench diffs edits by key and emits JSON for a human to paste back into
// balance.ts. Two entries reading the same constant break that quietly: you move
// one slider, the other still shows the old value, and the diff carries two
// names for one number — so whoever applies it has to guess which wins. This is
// the same failure that had SPY_TURNS.PER_GAME_TURN and SPY_TURNS.CAP tuned from
// two tabs at once, and the same shape as the duplicate MERC_CAP_RATIO key.
//
// It cannot be caught from the exported objects: by then every entry is just a
// number, and two constants that happen to be equal are indistinguishable from
// one constant listed twice. So this reads the SOURCE and checks which constant
// each entry actually points at. No annotation to keep in sync, and it sees new
// entries the day they are written.

const SRC = readFileSync(path.join(__dirname, "catalog.ts"), "utf8");

/** Every `value: C.SOME.PATH` in the SCALARS array, paired with its key. */
function scalarSources(): { key: string; source: string }[] {
  const body = SRC.slice(SRC.indexOf("export const SCALARS"));
  const re = /\{\s*key:\s*"([^"]+)"[\s\S]*?value:\s*(C\.[A-Za-z0-9_.]+)/g;
  const out: { key: string; source: string }[] = [];
  for (let m = re.exec(body); m; m = re.exec(body)) out.push({ key: m[1], source: m[2] });
  return out;
}

describe("the balance catalog", () => {
  it("never points two sliders at the same constant", () => {
    const bySource = new Map<string, string[]>();
    for (const { key, source } of scalarSources()) {
      const keys = bySource.get(source) ?? [];
      keys.push(key);
      bySource.set(source, keys);
    }
    const dupes = [...bySource.entries()]
      .filter(([, keys]) => keys.length > 1)
      .map(([source, keys]) => `${source} is tuned by ${keys.join(" and ")}`);
    expect(dupes).toEqual([]);
  });

  it("finds a constant behind every scalar it lists", () => {
    // Guards the regex above: if the catalog's shape changes so that entries stop
    // matching, this test would silently pass on an empty set.
    expect(scalarSources().length).toBe(SCALARS.length);
  });

  it("has unique keys across scalars and curves", () => {
    const keys = [...SCALARS.map((s) => s.key), ...CURVES.map((c) => c.key)];
    expect(keys.length).toBe(new Set(keys).size);
  });

  /** Every `export const NAME: Curve` across the tuning files. Curves live in
   *  balance.ts AND battleBalance.ts — scanning only the first is how
   *  WALL_HP_CURVE looked like a ghost. */
  function declaredCurves(): string[] {
    const files = ["balance.ts", "battleBalance.ts", "covertBalance.ts"];
    return files.flatMap((f) => {
      const src = readFileSync(path.join(__dirname, "..", "constants", f), "utf8");
      return [...src.matchAll(/export const ([A-Z_0-9]+): Curve/g)].map((m) => m[1]);
    });
  }

  it("charts EVERY curve declared in the tuning files", () => {
    // The Codex and the Workbench both render from CURVES, so a curve missing
    // here is a curve no reader can see and no admin can tune. Ten were missing
    // at once after the 2026-08 pass — every new cost ladder plus the scholar
    // output line — which is exactly the drift this catches. Reads the SOURCE,
    // so it sees a new curve the day it is written and needs no annotation.
    const declared = declaredCurves();
    expect(declared.length, "found no curves — have the tuning files changed shape?").toBeGreaterThan(10);
    const charted = new Set(CURVES.map((c) => c.key));
    const missing = declared.filter((k) => !charted.has(k));
    expect(missing, `not in the Codex: ${missing.join(", ")}`).toEqual([]);
  });

  it("charts no curve the tuning files no longer declare", () => {
    const declared = new Set(declaredCurves());
    const ghosts = CURVES.map((c) => c.key).filter((k) => !declared.has(k));
    expect(ghosts, `charted but gone from the constants: ${ghosts.join(", ")}`).toEqual([]);
  });

  it("files every entry under a group that a category claims", () => {
    // An entry whose group no category lists renders on no tab — present in the
    // data, invisible on both pages.
    const claimed = new Set(CATEGORIES.flatMap((c) => c.groups));
    const orphans = [
      ...SCALARS.map((s) => ({ key: s.key, group: s.group })),
      ...CURVES.map((c) => ({ key: c.key, group: c.group })),
    ].filter((e) => !claimed.has(e.group));
    expect(
      orphans.map((o) => `${o.key} (group "${o.group}")`),
      "these appear on no tab",
    ).toEqual([]);
  });

  it("keeps the Black Market's spread straddling the player band", () => {
    // The invariant the fence's safety rests on: every round trip through it
    // must lose money, or it becomes an arbitrage loop. These are separate
    // sliders in the workbench, so nothing but this stops them crossing.
    const at = (key: string) => SCALARS.find((s) => s.key === key)!.value;
    expect(at("BLACK_MARKET_SELL_PRICE")).toBeLessThan(at("MARKET_PRICE_MIN"));
    expect(at("MARKET_PRICE_MAX")).toBeLessThan(at("BLACK_MARKET_BUY_PRICE"));
  });
});
