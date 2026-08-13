// The shape every harness shares.
//
// Three rules hold across all of them, and the types exist to make the first
// two hard to break:
//
//   1. NO PARALLEL MATH. A harness imports the real engine and the real
//      constants. If it recomputes a formula "close enough for a simulation",
//      it is measuring a game nobody plays and it will drift within weeks.
//      That is why nothing here takes raw numbers as input — harnesses are
//      handed engine functions and constants, never copies of them.
//
//   2. A HARNESS ADVISES. It returns a Report. It never writes to the world,
//      never edits a constant, and cannot fail a build. Balance is a judgement;
//      these are the numbers to judge from.
//
//   3. ONE MORE IS EASY. Implement `Harness`, add it to the registry, done.
//      See simulations/README.md.

export interface Cell {
  /** Rendered as-is. Numbers are formatted by the report layer, not here. */
  value: string | number;
  /** Draws the eye without asserting anything — "look at this row". */
  flag?: "good" | "warn" | "bad";
}

export type Row = (string | number | Cell)[];

export interface Table {
  columns: string[];
  rows: Row[];
  /** Columns rendered right-aligned. Defaults to any column whose every value
   *  is a number. */
  numeric?: number[];
  note?: string;
}

export interface Section {
  heading: string;
  /** What this section is asking. Printed above the table. */
  question?: string;
  body?: string;
  table?: Table;
  /**
   * Observations worth a human's attention — NOT failures.
   *
   * A finding is "payback on Ironhold L9 is 4,100 turns, which is 28 days";
   * it is never "this is wrong". The harness has no opinion about what the
   * game should be, only about what it currently is.
   */
  findings?: string[];
}

export interface Report {
  id: string;
  title: string;
  /** The question this harness exists to answer, in one line. */
  question: string;
  sections: Section[];
  /** Flat key → number, for the baseline diff. Only stable, meaningful
   *  headline figures belong here — not every cell of every table. */
  metrics: Record<string, number>;
}

export interface RunContext {
  /**
   * Seeds for harnesses that need rolls. A FIXED GRID, not true Monte Carlo:
   * the same grid every run, so two runs are comparable and a diff means
   * something. Harnesses that are pure functions of the constants ignore this.
   */
  seeds: number[];
  /** Restrict a race sweep, e.g. ["human"] while iterating. */
  races?: string[];
}

export interface Harness {
  id: string;
  title: string;
  question: string;
  /** Why you would run this one. Shown in `pnpm sim --list`. */
  about: string;
  run(ctx: RunContext): Report;
}
