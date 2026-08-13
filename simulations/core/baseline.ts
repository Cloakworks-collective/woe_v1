// The baseline, and the diff against it.
//
// This is the part that makes the harnesses useful rather than merely
// interesting. A wall of numbers is hard to read and harder to compare; a diff
// against a recorded baseline turns "I changed the cost curve and I think it
// feels better" into "payback on Grange L7 fell from 340 turns to 210, and
// nothing else moved."
//
// The baseline is committed on purpose. It is a record of what the game's
// numbers were on a given day, and a reviewer seeing it change in a diff is the
// point — not a nuisance.

import fs from "node:fs";
import path from "node:path";

const FILE = path.join(process.cwd(), "simulations", "reports", "baseline.json");

/** Below this, a change is noise from a rounding edge and not worth a line. */
const NOISE = 0.005; // 0.5%

export function loadBaseline(): Record<string, number> | null {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Record<string, number>;
  } catch {
    return null;
  }
}

export function writeBaseline(metrics: Record<string, number>): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  // Sorted keys so a diff shows what actually moved, not a reshuffle.
  const sorted = Object.fromEntries(Object.entries(metrics).sort(([a], [b]) => a.localeCompare(b)));
  fs.writeFileSync(FILE, JSON.stringify(sorted, null, 2) + "\n");
}

const pct = (from: number, to: number): string => {
  if (from === 0) return to === 0 ? "0%" : "new";
  return `${(((to - from) / Math.abs(from)) * 100).toFixed(1)}%`;
};

/**
 * What moved, in plain lines.
 *
 * Reports appearances and disappearances too: a metric that vanished usually
 * means a harness stopped measuring something, which is worth noticing before
 * you conclude the number is fine.
 */
export function diffBaseline(
  before: Record<string, number>,
  after: Record<string, number>,
  /** True when only some harnesses ran (SIM_ONLY). A metric the baseline has
   *  and this run does not is then simply one that was not measured, which is
   *  noise — not the "a harness stopped measuring something" signal it would be
   *  on a full run. */
  partial = false,
): string[] {
  const out: string[] = [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

  for (const k of keys) {
    const a = before[k];
    const b = after[k];
    if (a === undefined) {
      out.push(`+ ${k}: ${b} (new)`);
      continue;
    }
    if (b === undefined) {
      if (!partial) out.push(`- ${k}: was ${a} (no longer measured)`);
      continue;
    }
    if (a === b) continue;
    const rel = a === 0 ? Infinity : Math.abs((b - a) / a);
    if (rel < NOISE) continue;
    out.push(`~ ${k}: ${a} → ${b}  (${pct(a, b)})`);
  }
  return out;
}
