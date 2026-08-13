# Balance harnesses

Measuring what the game's numbers actually do. The plan these come from is
`spec/tuning_todo.md`.

```bash
pnpm sim                          # every harness, to the terminal
SIM_ONLY=raid pnpm sim            # just one, or a comma-separated few
SIM_WRITE=1 pnpm sim              # also write simulations/reports/*.md
SIM_BASELINE=1 pnpm sim           # record the current metrics as the baseline
```

### The harnesses

| id | Harness | Rolls dice? | Answers |
|---|---|---|---|
| `buildings` | A — Buildings & growth | no | Is anything too cheap or too dear, and does race change that? |
| `ranking` | C — Ranking | no | What is the cheapest ranking point? |
| `raid` | B1 — Raids | yes | At what size ratio does marching beat staying home? |
| `castle` | B2 — Castle assault | yes | How much wall stops how much army? |
| `bombard` | B3 — Bombardment | yes | How much siege train knocks down how much wall? |
| `revenge` | B4 — Revenge | yes | Is revenge a deterrent or a wasted march? |
| `pacing` | D — Progression | no* | How fast does an empire grow, and is the victory floor reachable? |

\* `pacing` plays 60 game-days through the real tick; it has no combat, so no rolls.

`scripts/sim.ts` used to hold four ad-hoc versions of some of this. It was
folded into the harnesses above and deleted — two sources of truth for the same
question drift, and the older one had a single fixed seed where it needed a grid.

---

## The three rules

**1 · A harness advises. It never decides.**
It prints a table; a person reads it and changes a number. Nothing here writes
to the world, edits a constant, or fails a build — including when a result looks
bad. Balance is a judgement, and these are the numbers to judge from.

Files are only written when you ask (`SIM_WRITE=1`). A tool that reorganises
your repo as a side effect of being run is a tool you stop running.

**2 · No parallel math.**
Every harness imports the real engine and the real constants. If one ever
recomputes a formula "close enough for a simulation", it is measuring a game
nobody plays and it will drift within weeks. When a number is wanted that the
engine does not expose, export it from the engine — do not recompute it here.

This is what makes them self-updating: change `BUILDING_COST_CURVE` or
`SCORE.PER_XP_POINT` and the next run moves, with nobody remembering to update
anything.

**3 · Race is a dimension, not a variant.**
Race modifiers reach production, units, siege, walls and mercenary cost, so
every sweep runs six times. Reports show the **spread** and the outlier rather
than six tables nobody reads. The neutral reference is all-modifiers-1.0 —
**not Human**, who is 1.25 across the board and 1.1 on units.

---

## Adding one

1. Write `harnesses/<id>.ts` exporting a `Harness` (see `core/types.ts`).
2. Add it to `HARNESSES` in `core/registry.ts`.

That is the whole contract. The runner, the markdown writer and the baseline
diff all work off that array.

```ts
export const myHarness: Harness = {
  id: "my-thing",
  title: "Harness X — My thing",
  question: "The one question this answers.",
  about: "Why you would run it.",
  run(ctx) {
    return { id: "my-thing", title: this.title, question: this.question,
             sections: [...], metrics: { "my.headline": 42 } };
  },
};
```

- **`sections`** carry a table and optional `findings` — observations, never
  verdicts. "Payback is 340 turns" is a finding; "this is wrong" is not.
- **`metrics`** are the few stable headline numbers that feed the baseline diff.
  Not every cell of every table.
- **`ctx.seeds`** is a fixed grid for harnesses that roll dice. Ignore it if
  yours is a pure function of the constants — most are.

### How much randomness do you need?

Usually none. `buildingCost`, `workerOutputAtLevel` and `rankingScore` are pure,
so you sweep a grid and get exact answers. Only battles roll.

When they do, work down this ladder and stop as soon as the question is
answered: `meanRng` (one run, exact means for the linear rolls) → a fixed seed
grid of a few hundred → `paired()` for comparisons, which puts both arms on the
same seeds so luck cancels → thousands only for tail questions.

The seeds are a fixed ordered grid, not true Monte Carlo, so two runs are
comparable and a diff means something.

---

## The baseline

`SIM_BASELINE=1 pnpm sim` records the headline metrics to
`simulations/reports/baseline.json`, which is **committed on purpose**. Every
later run diffs against it:

```
~ payback.grange.L7: 36 → 21  (-41.7%)
```

That diff is the actual product. It turns "I changed the cost curve and I think
it feels better" into "payback on Grange L7 fell from 36 turns to 21, and
nothing else moved".

---

## A caution, learned the hard way

The bombard harness's first run confidently reported **"THE ANCHOR IS BROKEN —
10 trebuchets never breached a Citadel"**. The engine was fine. The harness was
asking for `wallIntegrity <= 0` when the game deliberately breaches at
`WALL_BREACH_PIVOT` (0.5) and then stops hitting masonry at all.

A harness is a program, and it can be wrong in exactly the way it is built to
detect. **When one of these reports something alarming, suspect the harness
first.** That is also why none of them may fail a build.
