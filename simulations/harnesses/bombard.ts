// HARNESS B3 — Bombardment.
//
// The first harness that needs dice, and the one that finally tests a promise
// the codebase has been making without proof.
//
// `wallHealthAtLevel` carries the comment "the Citadel, the 10-bombard anchor",
// and `curves.test.ts` asserts the NUMBER (1,000,000) — but nobody has ever
// checked that ten bombardments actually breach a Citadel. Testing the constant
// is not testing the claim. This does the latter, by running real bombardments
// against a real wall until it falls.
//
// Sampling is deliberately cheap: a fixed seed grid, not true Monte Carlo, so
// two runs are comparable and a diff means something.

import { SIEGE_GEAR, WALL_BREACH_PIVOT, WALL_NAMES, wallHealthAtLevel } from "@/lib/constants";

import {
  EMPTY_ARMY,
  buildSandboxPlayer,
  resolveBombard,
  type SandboxArmy,
  type SiegeGearType,
} from "@/lib/engine";
import { ALL_RACES } from "../core/races";
import { num } from "../core/report";
import { rngFor, summarise } from "../core/stats";
import type { Harness, Report, Row, RunContext, Section } from "../core/types";

const TREBUCHET: SiegeGearType = "trebuchets";

/** Crew per trebuchet, read from the constants so a rebalance moves this too. */
const crewPer = (): number => (SIEGE_GEAR as Record<string, { crew: number }>)[TREBUCHET]?.crew ?? 5;

/** An attacker whose whole purpose is to knock a wall down. */
function besieger(engines: number, race = "human"): SandboxArmy {
  return {
    ...EMPTY_ARMY,
    name: "besieger",
    race: race as SandboxArmy["race"],
    // Engineers crew the engines; too few and most of the park never fires.
    engineers: engines * crewPer(),
    gear: { [TREBUCHET]: engines },
    peasants: 500,
  };
}

/** A defender who is nothing but a wall — so the wall is what is measured. */
function walled(level: number, race = "human"): SandboxArmy {
  return { ...EMPTY_ARMY, name: "walled", race: race as SandboxArmy["race"], wallLevel: level, peasants: 500 };
}

/**
 * Bombard repeatedly until the wall is BREACHED; return how many it took.
 *
 * "Breached" is `wallIntegrity <= WALL_BREACH_PIVOT` (0.5), not zero — and that
 * distinction cost this harness its first run. Bombardment deliberately never
 * takes a wall to nothing: once it drops past the pivot the engines stop
 * shooting at masonry and start shooting at the town behind it ("the fire
 * spills onto the town"). Asking for integrity 0 asks for something the game
 * will never do, and the first version of this file duly reported that the
 * 10-bombard anchor was broken when it was the harness that was wrong.
 *
 * Each pass carries the previous pass's damage forward, which is what a real
 * campaign does — a wall does not heal between assaults unless it is repaired.
 */
function bombardsToBreach(level: number, engines: number, seed: number, cap = 120): number {
  let defender = buildSandboxPlayer(walled(level), "def");
  const attacker = buildSandboxPlayer(besieger(engines), "atk");
  const rng = rngFor(seed);
  for (let i = 1; i <= cap; i++) {
    const out = resolveBombard(attacker, defender, { rng, battleId: `sim-${i}`, tick: 1000 + i });
    defender = out.defender;
    if ((defender.wallIntegrity ?? 0) <= WALL_BREACH_PIVOT) return i;
  }
  return Infinity;
}

/** The anchor: does a Citadel fall to ten bombardments? */
function anchorSection(seeds: number[]): Section {
  const rows: Row[] = [];
  const findings: string[] = [];
  const ENGINES = 10;

  for (let level = 1; level <= 10; level++) {
    const counts = seeds.slice(0, 40).map((s) => bombardsToBreach(level, ENGINES, s));
    const finite = counts.filter(Number.isFinite);
    const st = summarise(finite.length ? finite : [Infinity]);
    rows.push([
      `L${level} ${WALL_NAMES[level] ?? ""}`,
      num(wallHealthAtLevel(level)),
      finite.length ? st.min : "—",
      finite.length ? Math.round(st.mean) : "—",
      finite.length ? st.max : "—",
      finite.length === counts.length ? "always" : `${finite.length}/${counts.length}`,
    ]);
  }

  // THE ANCHOR. `wallHealthAtLevel` calls L10 "the 10-bombard anchor", and this
  // is the first time anything has measured whether that holds. It turns out
  // the claim is under-specified rather than wrong: ten bombardments of WHAT?
  const citadel = seeds.slice(0, 40).map((s) => bombardsToBreach(10, ENGINES, s)).filter(Number.isFinite);
  const st = summarise(citadel.length ? citadel : [Infinity]);
  // How big a train does it take to breach a Citadel in exactly ten passes?
  let trainForTen = 0;
  for (const n of [10, 20, 30, 40, 50, 60, 80, 100]) {
    const c = seeds.slice(0, 10).map((s) => bombardsToBreach(10, n, s)).filter(Number.isFinite);
    if (c.length && summarise(c).mean <= 10) {
      trainForTen = n;
      break;
    }
  }
  findings.push(
    citadel.length
      ? `THE ANCHOR, measured for the first time: with ${ENGINES} trebuchets a Citadel breaches in ${st.min}–${st.max} bombardments (mean ${st.mean.toFixed(1)}) — not 10.`
      : `THE ANCHOR: with ${ENGINES} trebuchets a Citadel did not breach within the cap at all.`,
  );
  if (trainForTen) {
    findings.push(
      `Ten bombardments breaches a Citadel with about ${trainForTen} trebuchets (${trainForTen * crewPer()} engineers). ` +
        `So the anchor is not wrong so much as UNDER-SPECIFIED: "10 bombards" is true of a late-game siege train, not of ten engines. Worth writing the train size into the comment.`,
    );
  }

  return {
    heading: `Bombardments to breach, with ${ENGINES} trebuchets`,
    question: "Does a Citadel breach in ten bombardments, as the code claims?",
    table: {
      columns: ["Wall", "Health", "Fewest", "Mean", "Most", "Breached"],
      rows,
      note: `Breached = integrity at or below WALL_BREACH_PIVOT (${WALL_BREACH_PIVOT}), which is when engines stop hitting masonry and start hitting the town. Damage carries forward between passes. ${seeds.slice(0, 40).length} seeds per row.`,
    },
    findings,
  };
}

/** How many engines you need to make a Citadel fall in one go. */
function engineCurveSection(seeds: number[]): Section {
  const rows: Row[] = [];
  for (const engines of [5, 10, 20, 40, 80]) {
    const counts = seeds.slice(0, 25).map((s) => bombardsToBreach(10, engines, s));
    const finite = counts.filter(Number.isFinite);
    const st = summarise(finite.length ? finite : [0]);
    rows.push([
      engines,
      engines * crewPer(),
      finite.length ? Math.round(st.mean) : "never",
      finite.length ? st.min : "—",
    ]);
  }
  return {
    heading: "Engines against a Citadel",
    question: "How does the breach cost scale with the size of the siege train?",
    table: { columns: ["Trebuchets", "Engineers needed", "Mean bombards", "Fewest"], rows },
  };
}

/** Race touches siege damage AND wall quality — so it hits both sides here. */
function raceSection(seeds: number[]): Section {
  const rows: Row[] = [];
  for (const race of ALL_RACES) {
    const asAttacker = seeds.slice(0, 20).map((s) => {
      let defender = buildSandboxPlayer(walled(10), "def");
      const attacker = buildSandboxPlayer(besieger(10, race), "atk");
      const rng = rngFor(s);
      for (let i = 1; i <= 120; i++) {
        const out = resolveBombard(attacker, defender, { rng, battleId: `sim-${i}`, tick: 1000 + i });
        defender = out.defender;
        if ((defender.wallIntegrity ?? 0) <= WALL_BREACH_PIVOT) return i;
      }
      return Infinity;
    });
    const asDefender = seeds.slice(0, 20).map((s) => {
      let defender = buildSandboxPlayer(walled(10, race), "def");
      const attacker = buildSandboxPlayer(besieger(10), "atk");
      const rng = rngFor(s);
      for (let i = 1; i <= 120; i++) {
        const out = resolveBombard(attacker, defender, { rng, battleId: `sim-${i}`, tick: 1000 + i });
        defender = out.defender;
        if ((defender.wallIntegrity ?? 0) <= WALL_BREACH_PIVOT) return i;
      }
      return Infinity;
    });
    const atk = summarise(asAttacker.filter(Number.isFinite));
    const def = summarise(asDefender.filter(Number.isFinite));
    rows.push([race, atk.n ? atk.mean.toFixed(1) : "never", def.n ? def.mean.toFixed(1) : "never"]);
  }
  return {
    heading: "Race, on both sides of the wall",
    question: "Siege quality attacking, fortification quality defending — how far apart are the peoples?",
    table: {
      columns: ["Race", "Bombards needed (as attacker)", "Bombards to breach them (as defender)"],
      rows,
      note: "Paired seeds: both arms of every comparison see the same rolls, so luck cancels.",
    },
  };
}

export const bombardHarness: Harness = {
  id: "bombard",
  title: "Harness B3 — Bombardment",
  question: "How much wall does how much siege train knock down — and is the 10-bombard anchor real?",
  about:
    "Runs real bombardments against real walls until they fall. Fixed seed grid, not Monte Carlo, so runs are comparable.",
  run(ctx: RunContext): Report {
    const sections = [anchorSection(ctx.seeds), engineCurveSection(ctx.seeds), raceSection(ctx.seeds)];
    const citadel = ctx.seeds.slice(0, 40).map((s) => bombardsToBreach(10, 10, s)).filter(Number.isFinite);
    const st = summarise(citadel.length ? citadel : [0]);
    return {
      id: "bombard",
      title: this.title,
      question: this.question,
      sections,
      metrics: {
        "bombard.citadel.meanWith10": Math.round(st.mean * 10) / 10,
        "bombard.citadel.min": citadel.length ? st.min : -1,
        "bombard.citadel.breachRate": citadel.length / 40,
      },
    };
  },
};
