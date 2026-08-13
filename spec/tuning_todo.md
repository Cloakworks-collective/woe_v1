# War of Empires — Balance Harnesses

> **Status: PLAN, not built.** Nothing here exists in the repo yet.
>
> Game mechanics are not described in this file; they live in `overview.md`,
> `empire.md`, `combat.md`, `clans.md` and `espionage.md`. This file is about
> **measuring** them.

---

## 0 · What a harness is, and is not

**A harness advises. It never decides.**

It prints a table. A person reads the table and changes a number. Nothing in
this document is allowed to say "this is balanced" or to fail a build because a
win rate moved — a balance test that can fail is a balance test that gets muted
and then deleted, and it takes the useful ones with it.

There is exactly one exception, and it is not about balance:

| Kind | Example | May fail the build? |
|---|---|---|
| **Invariant** | A stock went negative. `rankingScore` returned `NaN`. Loot exceeded 100%. The duel did not terminate. | **Yes.** These are bugs, not opinions. |
| **Anchor** | "Ten bombards breach a Citadel." | **Yes** — it is a stated promise, and if it breaks, either the code or the promise is wrong. |
| **Balance** | Dwarves win 54% of paired duels. Payback on a level-7 Grange is 340 turns. | **Never.** Report it. A human decides. |

---

## 1 · The one rule: no parallel math

**Every harness imports the real engine and the real constants.** If a harness
ever reimplements a formula — "close enough for a simulation" — it is measuring
a game nobody is playing, and it will drift silently within weeks.

This is not aspiration; it is the property the in-game calculators already have
and state plainly:

> *Runs the REAL `rankingScore`. The breakdown is computed by zeroing one
> component at a time and re-scoring, so it can never drift from the function it
> claims to explain — no parallel copy of the formula lives here.*

Apply that rule everywhere. If a number is wanted that the engine does not
expose, the fix is to export it from the engine, not to recompute it in the
harness.

### 1.1 The knobs, and tweaking them without editing files

The tunables already live in dedicated files, which is what makes this tractable:

| File | Holds |
|---|---|
| `lib/constants/balance.ts` | Economy, growth, housing, storage, markets, clans, victory floors |
| `lib/constants/battleBalance.ts` | Combat, loot, XP, walls, siege, revenge |
| `lib/constants/curves.ts` | The `Curve` type — `constant`, `linear`, `geometric`, `exponential`, `polynomial`, `steps`, `expr` |
| `lib/balance/catalog.ts` | Every tunable, described, with its curve — drives both the public Codex and the admin Workbench |

The growth models are already curves, not scattered literals — e.g.
`BUILDING_COST_CURVE = 1.5 ^ (x − 1)` and `WORKER_OUTPUT_CURVE = 5 × level`.
That means a harness can swap them.

**Every harness should accept an overlay**: a map of `{ knob → replacement }`
applied on top of the compiled defaults for one run. Then the workflow is

> run baseline → change `BUILDING_COST_CURVE` to `1.4 ^ (x−1)` in the overlay →
> re-run → **diff the two tables**

without editing a source file or restarting anything. The admin Workbench
already does exactly this for preview (*"edits here are a preview; export the
diff to apply"*), so the overlay shape exists — the harness should consume the
same one, and ideally the Workbench should be able to hand a set of edits
straight to a harness run.

---

## 2 · Race is a dimension, not a variant

Every harness below is **six harnesses wearing a trenchcoat.** Race modifiers
reach into all three:

| Modifier | Reaches |
|---|---|
| `production.{food,wood,stone,ore}` | **Harness A** — how fast a race accumulates what a building costs |
| `units.{footman,archer,cavalry}`, `attack`, `defence` | **B** and **C** (score folds race into regulars) |
| `siege` | **B2/B3** and **C** (crewed counter-engines score) |
| `walls` | **B2/B3** and **C** (walls score × integrity × race) |
| `mercCost` | **B** and **C**, via what an "equal-cost" army actually costs |

### 2.1 Why this bites hardest in Harness A

Race multiplies **output**, while a building's price is fixed in resources. So
the *cost* of a Mason's Quarry is identical for everyone and the *time to afford
it* is not — which means **the binding resource differs by race**:

- Elf: wood ×1.5, ore ×0.5 — a 3× spread inside one race
- Orc: food ×1.4, wood ×0.6
- Dwarf, Troll, Gnoll: their own shapes

A building costing mostly ore is a different proposition for an Orc (1.4) than
an Elf (0.5). "Is this too cheap?" therefore has six answers, and the useful
question becomes **"is there a race for which this is never worth building?"**

That also loops back to §7.1: `races.ts` notes the resource penalties were
clamped because the original values *"assume a liquid market we can't guarantee
at launch"*. The design intent is that a race with bad ore **buys** ore. So if
buying dominates digging, race production modifiers stop mattering at all — the
whole production axis of race design collapses. One question, two harnesses.

### 2.2 Humans are not the neutral baseline

Human is `production 1.25` across all four resources, `units 1.1`, `spy 1.25` —
above average at everything, not a zero point. The in-game Ranking Calculator
compares races against Human, which is fine for a player ("how do I compare to
the common case") and **wrong for a harness**.

Every harness should measure against a synthetic **neutral reference with all
modifiers at 1.0**. Otherwise every payback figure is quoted against a race 25%
better than neutral at production, and five of six races will look broken when
they are merely not-Human.

### 2.3 Reading six-way output without drowning

6 races × 10 levels × ~15 buildings is 900 numbers nobody will read. So:

- **Report the spread, not the six values.** One row per building-level:
  neutral baseline, min, max, and which race is the outlier.
- **Flag only cells where race changes the decision** — where payback crosses a
  target band for some races but not others. That is the actionable subset and
  it is usually small.
- **One summary line per race:** what should this race build first? If all six
  answers are the same, race is not affecting builds at all, which is itself a
  finding.

A large spread is **not** a failure. `races.ts`: *"Values are NOT sum-zero;
balance is judged by equal-cost army power."* The harness shows the shape of the
asymmetry; a human decides whether it is the shape they wanted.

---

## 3 · The three harnesses

### A · Building & growth harness

**Measures:** whether buildings are priced right *as population and resource
buildings grow* — the cost curve against the output curve, at every level.

**Tweakable models:** `BUILDING_COST_CURVE`, `WORKER_OUTPUT_CURVE`,
`STORAGE_SHELTER_CURVE`, `POP_GROWTH` (base, safety tiers, prosperity, walls),
`HOUSING_PER_HEARTHSTEAD`, `TROOPS_PER_MUSTER_HALL`.

**Swept across:** every building × level 1→10 × **all six races + neutral** ×
a few population sizes. Deterministic, so this is a grid, not a sample.

**Outputs, per cell:**
- cost, and cumulative cost to reach that level
- output per turn at that level, and the *marginal* gain over the previous
- **payback period** — turns until the level repays itself, *at this race's
  production rate for the resources it costs*
- **which resource is the bottleneck** for this race — the one whose
  accumulation actually gates the build
- cost per point of output, to spot non-monotonic pricing
- the same picture at several population sizes, since what a level is *worth*
  depends on how many workers you can feed into it

**What it is for:** answering "is this too cheap / too dear" with a number
instead of a feeling, and catching strictly-dominated levels — a tier nobody
should ever buy because the one above is cheaper per point.

**Randomness: none.** See §4.

---

### B · Battle harness — four sub-harnesses

Split because the four modes have genuinely different questions, different
inputs and different definitions of a good result. One combined battle report
would answer none of them.

| Sub-harness | The question it answers |
|---|---|
| **B1 · Raids** | Field battle for goods. What size ratio makes raiding profitable *after* troop losses? Where is the crossover between "worth marching" and "worth staying home"? |
| **B2 · Castle** | The full assault — counter-engine duel, then walls, then the storm. How much wall stops how much army? What does each wall level actually buy? |
| **B3 · Bombards** | Engines only, loots nothing. How many engines to breach each wall level, and what does the counter-engine duel cost the attacker? **This is where the 10-bombard Citadel anchor is proven or broken.** |
| **B4 · Revenge** | Takes nothing, ignores the protections. Is it a real deterrent or a wasted 10 turns? Does the `REVENGE_WINDOW_HOURS` window make it usable? |

**Shared inputs:** two armies from `buildSandboxPlayer`, a size ratio, a wall
level, war/peace, race pair.

**Shared outputs:** win rate, troop losses both sides, loot taken, XP moved,
and — the one that matters — **net value of the attack against the
counterfactual of spending the same turns and goods on buildings.**

**Randomness: yes, and this is the only harness that needs it.** See §4.

---

### C · Ranking harness

**Measures:** what the ladder actually rewards, and therefore what players will
optimise for.

**Tweakable:** the whole `SCORE` block — `PER_CIVILIAN`, `PER_POWER_POINT`,
`PER_SCOUT`, `PER_ENGINEER`, `PER_XP_POINT`, `PER_RESEARCH_LEVEL`,
`MERC_POWER_FACTOR`, `COUNTER_POWER_FACTOR`, `WALLS_SCORE_CURVE`.

**Swept across:** all six races + neutral. Race is folded into regulars,
crewed engines and walls, and it changes what a point *costs* as well as what
it is worth — so "the cheapest ranking point" has six answers too.

**Outputs:**
- **Cheapest ranking point, per race.** For each component, gold-and-goods
  spent per point of score. Whatever is cheapest is what the ladder is *really*
  asking that race to build — and if it is the same component for all six, race
  is not shaping ladder strategy at all.
- Marginal score per unit, per level, per point of XP.
- Composition of a typical empire's score at several sizes — does one term
  swamp the rest?
- Race spread on the same army, which the in-game calculator already shows.
- **Does score predict winning?** Correlate score ratio against the win rate
  from harness B. If they diverge, the ladder is lying about who is dangerous,
  and the "rank tells you *whether*, a scout tells you *how*" design fails.

**Randomness: none for score itself** (it is a pure function). The correlation
check borrows B's numbers.

---

## 4 · Monte Carlo, or something cheaper?

Mostly cheaper. Only the battle harness needs sampling at all, and even there
full Monte Carlo is the last resort rather than the default.

**A and C need zero randomness.** `buildingCost(level)`, `workerOutputAtLevel`,
`rankingScore(player)` are pure deterministic functions. You do not sample a
function you can simply *evaluate* — you sweep a grid. Every level, every tier,
every composition of interest. One pass, exact answers, instant.

**B is tiered. Start at the top and only go down if the question demands it.**

| Tier | Method | Cost | Answers |
|---|---|---|---|
| **1 · Mean roll** | Replace `rng` with `() => 0.5` | **One run** | "What does the average battle look like?" `luck()` and `rollBand()` are linear in `rng`, so this gives their exact means. Compounding rounds and thresholds make it approximate for the battle as a whole — but it is free and right most of the time. |
| **2 · Fixed seed grid** | Seeds `1..N` through `seededRng` | ~200–1,000 runs | Win rates and average losses. **Not really Monte Carlo**: the seeds are a fixed, ordered grid, so the run is fully reproducible and two runs are diffable. |
| **3 · Paired grid (CRN)** | Same seed grid for both sides of a comparison | same N, far more signal | Race-vs-race and mode-vs-mode. Luck cancels between the arms, worth roughly an order of magnitude in trials. **Without this a real 3% edge is invisible under `LUCK_SWING`.** |
| **4 · Large sample** | 10,000+ | expensive | Tails only — "how often does the underdog win?", "what is the worst case?" Rare; reach for it deliberately. |

Two supporting rules:

- **Report an interval, never a bare number.** *"52.1% ± 1.4% over 5,000 paired
  trials"* is a finding. *"52%"* is a coin flip nobody measured.
- **Guard determinism.** No `Math.random` anywhere under `lib/engine` — a lint
  rule, not a comment. One stray call silently invalidates every table in this
  document, and the engine already claims this is true without enforcing it.

---

## 5 · Output shape

Each harness emits a table to stdout and a JSON artefact. The artefact matters
more than it sounds: commit a `baseline.json`, and every subsequent run **diffs
against it**, so a constant change shows *exactly what moved* rather than
requiring someone to re-read a wall of numbers.

That diff is the actual product. It turns "I changed the cost curve, I think it
feels better" into "payback on Grange L7 fell from 340 turns to 210, and nothing
else moved".

---

## 6 · Phasing

| Phase | Delivers | Needs | Effort |
|---|---|---|---|
| **1** | Invariants & anchors (§0 table) | — | Small; catches real bugs today |
| **2** | **Harness A** — building & growth ledger | — | Small; no RNG, no opponent |
| **3** | **Harness C** — ranking sweep | — | Small; no RNG |
| **4** | **B3** — bombards (proves the Citadel anchor) | — | Small |
| **5** | **B1, B2** — raids and castle | A (for the counterfactual) | Medium |
| **6** | **B4** — revenge | B1 | Small |
| **7** | Overlay support + baseline diffing (§1.1, §5) | any harness | Medium |
| **8** | Score-vs-win-rate correlation | B, C | Small |

Phases 1–4 need no simulator, no policies and no opponent model. They are
mostly grid sweeps over pure functions, and between them they answer the most
urgent open question below.

**Deliberately deferred:** an economy simulator with scripted player policies
(Economist / Rusher / Turtle / Merchant) driving a full day loop. It is the
largest build here and the least trustworthy output, because it mostly measures
how well the policies were written. Worth doing eventually for pacing and
strategy-dominance questions; not worth doing first.

---

## 7 · The first questions to point them at

**7.1 · Is buying strictly better than digging? — most urgent.** After the
2026-08 swing (gold ×1000, worker output ÷10), a 1,000-civilian empire at 50%
tax earns ~200,000 gold/turn while the Black Market sells at
`BLACK_MARKET.BUY_PRICE` = 20/unit — roughly 10,000 goods/turn from the fence,
against a level-10 mine's 50 per worker per turn. If buying dominates, four
production buildings, four research fields and the worker-assignment system are
decorative. **Harness A answers this on day one, with no randomness at all.**

**7.2 · Do ten bombards breach a Citadel?** The constant is tested; the promise
never has been. **B3.**

**7.3 · What is the cheapest ranking point?** Whatever it is, that is what the
ladder is really asking players to build — and it may not be what anyone
intended. **Harness C.**

**7.4 · Is veterancy overtuned?** Up to +100% damage on attack *and* defence,
**and** 100 ranking points per point (10,000 at maximum) — a large double-dip
across two harnesses. **B and C together.**

---

## 8 · What these cannot tell you

They measure the **model**, not the players.

They will tell you a build is dominant. They will not tell you whether the game
is **fun**, and they cannot see collusion, alt-feeding, clan politics, or the
social dynamics that actually decide a browser strategy game.

And **lopsided is not broken.** Races are deliberately asymmetric —
`races.ts` says so outright: *"Values are NOT sum-zero; balance is judged by
equal-cost army power."* Elves are supposed to be archers who cannot mine. The
job of a harness is to show you the shape of the asymmetry so you can decide
whether it is the shape you wanted. It is not to sand it flat.
