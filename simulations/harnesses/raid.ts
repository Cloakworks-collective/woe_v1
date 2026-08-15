// HARNESS B1 — Raids.
//
// The field battle for goods, and the question the whole war game rests on:
// **is marching better than staying home?** If raiding never pays, the ladder is
// decoration and this is a farming game with a war theme. If it always pays,
// defence is pointless.
//
// The interesting answer is neither — it is the CROSSOVER: how much stronger
// than a target you must be before the loot covers the men you lose getting it.
//
// Absorbs the even-match and race-matrix work from the old scripts/sim.ts,
// including its warning about not reading the race matrix as a fairness score.

import { ACTION_TURNS, EXPERIENCE, LOOT, TRAINING_COSTS } from "@/lib/constants";
import { lineRegulars, matchupMultiplier, resolveBattle } from "@/lib/engine";
import { army, lootTotal, lossesTotal } from "../core/armies";
import { ALL_RACES } from "../core/races";
import { num } from "../core/report";
import { pctCI, rateOf, rngFor, summarise } from "../core/stats";
import type { Harness, Report, Row, RunContext, Section } from "../core/types";

/** What one light regular costs to replace, averaged across the three arms. */
const REPLACEMENT_COST =
  (["footman", "archer", "cavalry"] as const)
    .map((k) => TRAINING_COSTS[k].gold + TRAINING_COSTS[k].wood + TRAINING_COSTS[k].stone + TRAINING_COSTS[k].ore)
    .reduce((a, b) => a + b, 0) / 3;

const DEFENDER_SIZE = 1000;
const LOOSE = 400_000;

/**
 * Is an even fight actually even?
 *
 * Run at two compositions on purpose. Mixed arms and all-footmen are the same
 * headcount and the same cost, so any gap between them is the ARCHER PHASE —
 * which fires before the melee and can decide a raid before the other arms
 * swing. That was the standing suspicion in the old scripts/sim.ts; this is the
 * measurement of it.
 */
function evenSection(seeds: number[]): Section {
  const rows: Row[] = [];
  const findings: string[] = [];
  const measured: Record<string, number> = {};

  for (const [label, tierSpec] of [
    ["mixed arms (50/30/20)", undefined],
    ["footmen only", "footmen-only"],
  ] as const) {
    const mk = (id: string) =>
      tierSpec === "footmen-only"
        ? army({ size: 500, footmenOnly: true }, id)
        : army({ size: 500 }, id);
    const results = seeds.slice(0, 300).map((s) =>
      resolveBattle(mk("a"), mk("d"), "raid", { rng: rngFor(s), battleId: "even", tick: 1 }),
    );
    const wins = rateOf(results, (r) => r.report.victor === "attacker");
    const rounds = summarise(results.map((r) => r.report.rounds));
    measured[label] = wins.mean;
    rows.push([label, pctCI(wins), `${rounds.mean.toFixed(1)} (${rounds.min}–${rounds.max})`, wins.n]);
  }

  const mixed = measured["mixed arms (50/30/20)"]!;
  const foot = measured["footmen only"]!;
  findings.push(
    `An identical attacker wins ${(mixed * 100).toFixed(1)}% of even raids with mixed arms and ${(foot * 100).toFixed(1)}% with footmen alone. ` +
      `Marching on somebody your own size is a losing proposition — the defender takes ties, so an attacker needs to win the exchange outright.`,
  );
  findings.push(
    `Same headcount, same cost, ${Math.abs((foot - mixed) * 100).toFixed(1)} points apart — ${foot > mixed ? "in FOOTMEN's favour" : "in MIXED ARMS' favour"}. ` +
      `That gap is the arms mix earning its keep: archers fire before the melee, so composition decides part of the exchange before the lines ever meet.`,
  );

  return {
    heading: "The even fight",
    question: "500 against 500, no walls, at two compositions.",
    table: { columns: ["Composition", "Attacker wins", "Rounds", "Trials"], rows },
    findings,
  };
}

/**
 * THE HEADLINE: at what size ratio does raiding start to pay?
 *
 * Net value = loot taken − the cost of replacing the regulars who died getting
 * it. A raid that wins but trades 300 men for 200,000 goods is not a victory,
 * it is a purchase at a bad price — and the ladder counts those men.
 */
function crossoverSection(seeds: number[]): Section {
  const rows: Row[] = [];
  const findings: string[] = [];
  let firstProfitable = 0;

  for (const ratio of [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 5]) {
    const size = Math.round(DEFENDER_SIZE * ratio);
    const outcomes = seeds.slice(0, 120).map((s) =>
      resolveBattle(
        army({ size }, "a"),
        army({ size: DEFENDER_SIZE, loose: LOOSE }, "d"),
        "raid",
        { rng: rngFor(s), battleId: "x", tick: 1 },
      ),
    );
    const wins = rateOf(outcomes, (o) => o.report.victor === "attacker");
    const loot = summarise(outcomes.map((o) => lootTotal(o.report.loot)));
    const lost = summarise(outcomes.map((o) => lossesTotal(o.report.attackerLosses)));
    const net = summarise(
      outcomes.map((o) => lootTotal(o.report.loot) - lossesTotal(o.report.attackerLosses) * REPLACEMENT_COST),
    );
    if (net.mean > 0 && firstProfitable === 0) firstProfitable = ratio;

    rows.push([
      `${ratio}×`,
      size,
      pctCI(wins),
      num(loot.mean),
      num(lost.mean),
      { value: num(net.mean), flag: net.mean > 0 ? "good" : "bad" },
    ]);
  }

  findings.push(
    firstProfitable
      ? `Raiding first turns a profit at about ${firstProfitable}× the defender's size, once the men lost are priced at ${num(REPLACEMENT_COST)} each. Below that a won raid still costs more than it takes.`
      : "No tested size ratio turned a profit once losses were priced — at these settings raiding never pays for itself.",
  );
  findings.push(
    `Loot is also scaled by size: punching up pays ${Math.round(LOOT.BIG_TARGET_BONUS * 100)}% and punching down ${Math.round(LOOT.SMALL_TARGET_PENALTY * 100)}%, so the crossover is steeper than headcount alone suggests.`,
  );

  return {
    heading: "Is marching worth it?",
    question: `Attacker size vs a ${DEFENDER_SIZE}-strong defender holding ${num(LOOSE * 4)} loose goods.`,
    table: {
      columns: ["Ratio", "Attackers", "Win rate", "Mean loot", "Mean losses", "Net value"],
      rows,
      note: `Net = loot − (regulars lost × ${num(REPLACEMENT_COST)} replacement). Dead regulars cannot be re-bought and carry your veterancy with them, so this understates the true cost.`,
    },
    findings,
  };
}

/**
 * Race matrix, open field.
 *
 * Deliberately a RAID rather than a siege: a walled defender with an identical
 * army holds every time, which measures the wall and not the race, and returns
 * a column of zeroes exactly where the interesting number should be.
 */
function raceMatrixSection(seeds: number[]): Section {
  const rows: Row[] = [];
  const meanByRace: Record<string, number> = {};

  for (const a of ALL_RACES) {
    const cells: (string | number)[] = [a];
    let won = 0;
    let played = 0;
    for (const d of ALL_RACES) {
      // Paired seeds: every pairing sees the same rolls, so luck cancels.
      const outcomes = seeds.slice(0, 40).map((s) =>
        resolveBattle(army({ race: a, size: 700 }, "a"), army({ race: d, size: 700 }, "d"), "raid", {
          rng: rngFor(s),
          battleId: "rm",
          tick: 1,
        }),
      );
      const w = outcomes.filter((o) => o.report.victor === "attacker").length;
      won += w;
      played += outcomes.length;
      cells.push(`${Math.round((w / outcomes.length) * 100)}%`);
    }
    meanByRace[a] = (won / played) * 100;
    rows.push(cells);
  }

  const rank = ALL_RACES.map((r) => ({ r, pct: meanByRace[r]! })).sort((x, y) => y.pct - x.pct);
  const spreadPts = rank[0]!.pct - rank.at(-1)!.pct;

  return {
    heading: "Race matrix — open-field raid",
    question: "Identical armies, only the blood differs. Attacker in rows, defender in columns.",
    table: { columns: ["Attacker \\ Defender", ...ALL_RACES], rows },
    findings: [
      `Mean attack win rate: ${rank.map((o) => `${o.r} ${o.pct.toFixed(1)}%`).join(", ")} — a spread of ${spreadPts.toFixed(1)} points.`,
      "THIS MEASURES ONE AXIS ONLY. Do not flatten the race table on it. Trolls (siege) and Dwarves (walls) trade open-field raiding away for the things this test cannot see; losing here is what they PAY, not a bug. A race is broken only when it is bottom-quartile on every path at once — production, ranking, siege, defence and the shadow war.",
      "The one genuine suspect is the archer phase, which fires first and can decide a raid before the other arms swing.",
    ],
  };
}

/**
 * THE CAMPAIGN — the same target, hit and hit and hit again.
 *
 * Every other section here measures ONE blow. This measures repetition, and
 * repetition is where the compounding lives.
 *
 * It exists because a strike is a single exchange and an empire draws 288 action
 * turns a day at 10 a strike, so nobody attacks once. The unit of war is the
 * fortnight, not the battle, and effects far too small to see in one fight —
 * a flat +5 here, a percentage decay there — are the things that actually decide
 * whether marching on somebody works.
 *
 * WATCH THE XP COLUMNS. They are the reason this section was written: an
 * attacker earns experience only from kills and loses a share of it to their own
 * casualties, while a defender collects XP.DEFENDER_GAIN every time somebody
 * knocks on the door, win or lose. Over one battle that is a rounding error.
 * Over twelve it is the largest force in the game, and it runs the wrong way —
 * attacking somebody trains them.
 */
function campaignSection(seeds: number[]): { section: Section; bleed: number; defXp: number } {
  const STRIKES = 12;
  const SIZE = 1000;

  const runs = seeds.slice(0, 40).map((seed) => {
    let a = army({ size: SIZE }, "a");
    let d = army({ size: SIZE }, "d");
    return Array.from({ length: STRIKES }, (_, i) => {
      const o = resolveBattle(a, d, "raid", {
        rng: rngFor(seed * 1000 + i),
        battleId: `c${i}`,
        tick: i + 1,
      });
      a = o.attacker;
      d = o.defender;
      return {
        aXp: a.army.experiencePoints,
        dXp: d.army.experiencePoints,
        aSta: a.army.stamina,
        dSta: d.army.stamina,
        aReg: lineRegulars(a),
        dReg: lineRegulars(d),
        won: o.report.victor === "attacker",
      };
    });
  });

  const at = (i: number, pick: (s: (typeof runs)[0][0]) => number) =>
    summarise(runs.map((r) => pick(r[i]))).mean;

  const rows: Row[] = [];
  for (let i = 0; i < STRIKES; i++) {
    rows.push([
      i + 1,
      (i + 1) * ACTION_TURNS.ATTACK_COST,
      num(at(i, (s) => s.aXp)),
      num(at(i, (s) => s.dXp)),
      num(at(i, (s) => s.aSta)),
      num(at(i, (s) => s.dSta)),
      num(at(i, (s) => s.aReg)),
      num(at(i, (s) => s.dReg)),
      `${Math.round(summarise(runs.map((r) => (r[i].won ? 1 : 0))).mean * 100)}%`,
    ]);
  }

  const aLost = SIZE - at(STRIKES - 1, (s) => s.aReg);
  const dLost = SIZE - at(STRIKES - 1, (s) => s.dReg);
  const bleed = dLost > 0 ? aLost / dLost : 0;

  const section: Section = {
    heading: "The campaign",
    question: `${SIZE} against ${SIZE}, the same target struck ${STRIKES} times in a row (${STRIKES * ACTION_TURNS.ATTACK_COST} action turns). Mean of ${runs.length} runs.`,
    table: {
      columns: ["Strike", "Turns", "Atk XP", "Def XP", "Atk sta", "Def sta", "Atk regs", "Def regs", "Atk wins"],
      rows,
      note: "An empire draws 288 action turns a day, so a full day of attacking is roughly twice this table.",
    },
    findings: [
      `Across ${STRIKES} strikes the attacker loses ${num(aLost)} regulars to the defender's ${num(dLost)} — a ${bleed.toFixed(1)}× bleed, from two armies that started identical on open ground with no wall between them.`,
      `Experience after ${STRIKES} strikes: attacker ${num(at(STRIKES - 1, (s) => s.aXp))} points (+${(at(STRIKES - 1, (s) => s.aXp) / EXPERIENCE.POINTS_FOR_DOUBLE * 100).toFixed(2)}%), defender ${num(at(STRIKES - 1, (s) => s.dXp))} (+${(at(STRIKES - 1, (s) => s.dXp) / EXPERIENCE.POINTS_FOR_DOUBLE * 100).toFixed(2)}%). The ledger credits casualties inflicted at ${EXPERIENCE.PER_CASUALTY} a head and debits your own regulars at ${EXPERIENCE.PER_REGULAR_LOST}; a surrender pays neither side.`,
      `${EXPERIENCE.POINTS_FOR_DOUBLE.toLocaleString("en-US")} points buys +100% to power AND health, so this campaign moved the pair ${Math.abs(at(STRIKES - 1, (s) => s.dXp) - at(STRIKES - 1, (s) => s.aXp)) / EXPERIENCE.POINTS_FOR_DOUBLE * 100 < 1 ? "less than a point" : "a real amount"} apart.`,
    ],
  };

  return { section, bleed, defXp: at(STRIKES - 1, (s) => s.dXp) };
}

/**
 * THE EXPERIENCE LEDGER — what a battle actually pays.
 *
 * Points are credited for casualties inflicted and debited for your own regulars
 * lost, so the award is a DIFFERENCE of two large numbers and moves much faster
 * than either. That is exactly the kind of quantity nobody should be tuning by
 * arithmetic, which is why it gets a table.
 *
 * Both sides hire sellswords to the cap here, and it is not a detail: 70% of
 * every blow lands on hired blades (CASUALTY_SPLIT.MERC_SHARE), so an army
 * without them pays the debit on every single casualty. Measured on unhired
 * armies the same battle pays a fifth as much.
 */
function experienceSection(seeds: number[]): { section: Section; bigWin: number } {
  const rows: Row[] = [];
  const wonAt: Record<number, number> = {};

  for (const size of [50, 150, 400, 800, 1500, 2500]) {
    // A winning attack (1.25× — still "in your range", so matchup is ×1) and,
    // from the same fight, what the losing defender takes home.
    const won = seeds.slice(0, 24).map((s) => {
      const o = resolveBattle(
        army({ size: Math.round(size * 1.25), mercs: true }, "a"),
        army({ size, mercs: true, loose: LOOSE }, "d"),
        "raid",
        { rng: rngFor(s), battleId: "xp", tick: 1 },
      );
      // Whether the CEILING bound, which is not the same as whether the net
      // came out large: the cap applies to the award before the debit for your
      // own dead is taken off. Reconstruct the gross to ask the real question.
      const debit = lossesTotal(o.report.attackerLosses) * EXPERIENCE.PER_REGULAR_LOST;
      return {
        atk: o.attacker.army.experiencePoints,
        def: o.defender.army.experiencePoints,
        capped: o.attacker.army.experiencePoints + debit >= EXPERIENCE.MAX_PER_BATTLE ? 1 : 0,
      };
    });
    // And an even fight, where the defender usually holds — the "good winning
    // defence" the ledger is calibrated against.
    const even = seeds.slice(0, 24).map((s) => {
      const o = resolveBattle(
        army({ size, mercs: true }, "a"),
        army({ size, mercs: true }, "d"),
        "raid",
        { rng: rngFor(s + 777), battleId: "xp2", tick: 1 },
      );
      return o.defender.army.experiencePoints;
    });

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
    const atkWin = mean(won.map((w) => w.atk));
    wonAt[size] = atkWin;
    rows.push([
      size,
      num(atkWin),
      num(mean(won.map((w) => w.def))),
      num(mean(even)),
      `${Math.round(mean(won.map((w) => w.capped)) * 100)}%`,
    ]);
  }

  const bigWin = wonAt[1500] ?? 0;
  const perDay = 10 * bigWin + 20 * (wonAt[800] ?? 0) * 0.4;
  const daysToDouble = perDay > 0 ? EXPERIENCE.POINTS_FOR_DOUBLE / perDay : 0;

  const section: Section = {
    heading: "The experience ledger",
    question: "What one battle pays, by the size of the armies in it. Both sides hire sellswords to the cap.",
    table: {
      columns: ["Def size", "Attacker, won", "Defender, lost", "Defender, held", "Ceiling bound"],
      rows,
      note: `+${EXPERIENCE.PER_CASUALTY} an enemy casualty, +${EXPERIENCE.ATTACKER_PER_REGULAR} more per REGULAR for the attacker only, −${EXPERIENCE.PER_REGULAR_LOST} per regular of your own. Ceiling ${EXPERIENCE.MAX_PER_BATTLE.toLocaleString("en-US")} a battle.`,
    },
    findings: [
      `${EXPERIENCE.POINTS_FOR_DOUBLE.toLocaleString("en-US")} points is +100% to power AND health. At this pace a ruler fighting hard — ten winning attacks and twenty defences a day — reaches it in roughly ${Math.round(daysToDouble)} days, and +20% in about ${Math.round(daysToDouble / 5)}.`,
      `The matchup ladder, on their score over yours: ${[0.3, 0.6, 1.0, 1.4].map((r) => `${r}× → ×${matchupMultiplier(r).toFixed(2)}`).join(", ")}. Below 0.5 it is NEGATIVE, so massacring somebody far beneath you takes points off the ledger rather than merely failing to add any.`,
      `Sellswords are load-bearing here. They absorb 70% of every blow, so they are what keeps the debit small enough for a battle to pay at all — the same fights run on unhired armies pay roughly a fifth as much, because every casualty then comes out of regulars.`,
    ],
  };
  return { section, bigWin };
}

export const raidHarness: Harness = {
  id: "raid",
  title: "Harness B1 — Raids",
  question: "At what point does marching beat staying home?",
  about: "Even-match sanity, the profitability crossover with losses priced in, and the open-field race matrix.",
  run(ctx: RunContext): Report {
    const campaign = campaignSection(ctx.seeds);
    const experience = experienceSection(ctx.seeds);
    const sections = [
      evenSection(ctx.seeds),
      campaign.section,
      experience.section,
      crossoverSection(ctx.seeds),
      raceMatrixSection(ctx.seeds),
    ];

    const even = rateOf(
      ctx.seeds.slice(0, 300).map((s) =>
        resolveBattle(army({ size: 500 }, "a"), army({ size: 500 }, "d"), "raid", {
          rng: rngFor(s),
          battleId: "even",
          tick: 1,
        }),
      ),
      (r) => r.report.victor === "attacker",
    );
    const doubled = summarise(
      ctx.seeds.slice(0, 120).map((s) => {
        const o = resolveBattle(
          army({ size: DEFENDER_SIZE * 2 }, "a"),
          army({ size: DEFENDER_SIZE, loose: LOOSE }, "d"),
          "raid",
          { rng: rngFor(s), battleId: "x", tick: 1 },
        );
        return lootTotal(o.report.loot) - lossesTotal(o.report.attackerLosses) * REPLACEMENT_COST;
      }),
    );

    return {
      id: "raid",
      title: this.title,
      question: this.question,
      sections,
      metrics: {
        "raid.evenWinRate": Math.round(even.mean * 1000) / 1000,
        "raid.netValueAt2x": Math.round(doubled.mean),
        // The two figures that catch a veterancy regression. Both should move
        // toward 1.0 if the compounding is ever tamed: an even campaign between
        // identical armies has no business costing one side several times more
        // than the other.
        "raid.campaign.bleedRatio": Math.round(campaign.bleed * 100) / 100,
        "raid.campaign.defXpEnd": Math.round(campaign.defXp),
        "raid.xp.bigWin": Math.round(experience.bigWin),
      },
    };
  },
};
