import { describe, expect, it } from "vitest";
import * as C from "@/lib/constants";

// Constants written as arithmetic pick up binary-float dust: WARWORKS_COST.RATE
// - 0.1 evaluates to 1.5999999999999999, and that reached both the Codex and a
// Workbench slider before anyone noticed. The fix is to write the literal and
// say why — this is what makes forgetting to loud.
//
// NOT a rule against float arithmetic generally. The engine multiplies floats
// constantly and must: a bonus pool of 1.35, a delivery gate of 0.3, a race
// modifier of 1.25. Rounding those would destroy the model. The rule is about
// TUNABLES — numbers a human reads off a page or types into a slider.

/** Numbers a person is meant to read should not carry more than this many
 *  decimals. 0.05, 1.25 and 2.4 are fine; 1.5999999999999999 is dust. */
const MAX_DECIMALS = 6;

/**
 * Values that are genuinely repeating and MUST stay as arithmetic.
 *
 * A third is a third. Writing 0.3333 would be less correct, not more — the dust
 * is inherent to representing 1/3 in binary and there is no literal that beats
 * it. Anything on this list should be a fraction a human would recognise, with
 * the reason stated; it is not a place to park a number nobody wants to fix.
 */
const EXACT_FRACTIONS = new Set([
  "MERCENARIES.CAP_RATIO", // 1/3 — a 75/25 army at full strength
  "SIEGE_REPAIR_COST_FACTOR", // 1/3 — building anew is 3× repairing
]);

const dusty = (n: number): boolean => {
  if (!Number.isFinite(n) || Number.isInteger(n)) return false;
  const s = String(n);
  if (s.includes("e")) return true; // 5e-17 and friends
  return (s.split(".")[1] ?? "").length > MAX_DECIMALS;
};

/** Walk a constant, reporting the path of every dusty number inside it. */
function dust(value: unknown, path: string, out: string[], seen = new Set<unknown>()): void {
  if (typeof value === "number") {
    if (dusty(value)) out.push(`${path} = ${value}`);
    return;
  }
  if (typeof value === "string") {
    // expr curve formulas carry their numbers as text.
    const m = value.match(/\d+\.\d{7,}/);
    if (m) out.push(`${path} = "${value}"`);
    return;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    dust(v, `${path}.${k}`, out, seen);
  }
}

describe("tunables carry no float dust", () => {
  it("no exported constant holds a number with binary-float noise", () => {
    const out: string[] = [];
    for (const [key, value] of Object.entries(C)) {
      if (typeof value === "function") continue;
      dust(value, key, out);
    }
    const unexplained = out.filter((line) => !EXACT_FRACTIONS.has(line.split(" = ")[0]!));
    expect(
      unexplained,
      `write these as literals and say why, or add to EXACT_FRACTIONS if they are genuinely repeating:\n  ${unexplained.join("\n  ")}`,
    ).toEqual([]);
  });

  it("finds constants at all — guards the walk itself", () => {
    // If the export shape changed so nothing were scanned, the test above would
    // pass on an empty set and stop meaning anything.
    const out: string[] = [];
    dust({ a: 1.5999999999999999, b: { c: "1.5999999999999999 ^ x" } }, "probe", out);
    expect(out).toHaveLength(2);
    expect(Object.keys(C).length).toBeGreaterThan(50);
  });

  it("every EXACT_FRACTIONS entry is still dusty, so the list cannot rot", () => {
    // If one of these is later written as a clean literal, its exemption is
    // dead weight and should go.
    const out: string[] = [];
    for (const [key, value] of Object.entries(C)) {
      if (typeof value === "function") continue;
      dust(value, key, out);
    }
    const found = new Set(out.map((l) => l.split(" = ")[0]!));
    for (const k of EXACT_FRACTIONS) {
      expect(found.has(k), `${k} is no longer dusty — drop its exemption`).toBe(true);
    }
  });
});
