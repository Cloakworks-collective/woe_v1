# Game Balance — the one tuning file

**Every number that shapes how the game plays lives in
[`lib/constants/balance.ts`](../lib/constants/balance.ts).** Change a value
there, restart the dev server (or reseed the world if the change invalidates
existing saves), and the next age behaves differently. That file — not the
specs, not the scattered domain files — is the source of truth for balance.

## How it's organized

`balance.ts` is a single flat file of named, unit-commented constants in 15
bannered sections. The old per-domain files (`economy.ts`, `combat.ts`,
`races.ts`, …) still exist but are now **thin re-exports** — they keep engine
imports short (`import { LOOT } from "../constants"`) and hold only what is
NOT balance: types, display text, and structural identity.

| § | Section | What you tune there |
|---|---------|---------------------|
| 1 | Time & pacing | turn length, turns/day, era peace days, newcomer shield |
| 2 | Starting empire | `START`: gold, resources, peasants, footmen, founding buildings |
| 3 | Population & growth | growth curve (settlers/day), housing/bed, wall settler penalty, scattering, settlement titles |
| 4 | Economy | tax gold rate, worker-output curve, food upkeep, vacation factors, merc price/cap/upkeep, storage shelter |
| 5 | Building costs | base costs, cost-multiplier curve, gold share, ratio bands, muster beds, repair factor |
| 6 | Research | research-cost curve, switch loss, max level, effect/level |
| 7 | Units & training | `UNIT_STATS`, tier power, training costs, tier cost mult |
| 8 | Battle | action turns, stamina, lethality, break threshold, luck, wall-bonus curve, engine fire, escalade, XP bands, loot, revenge window, bombard params |
| 9 | Siege equipment | offensive gear + defensive counter cost/crew/foundry tables |
| 10 | Espionage | op effects, catch model, guild/pathfinding scaling, unrest |
| 11 | Market | caravan capacity & delivery curve, fee, price band |
| 12 | Clans | hall table, storage caps, build costs, 3× rule, war block, churn |
| 13 | Victory & ranking | hold clocks, population floors, **all `SCORE` weights**, clan points |
| 14 | Races | the full 6-race modifier matrix |
| 15 | Premium | Steward queue cap (pricing stays in `premium.ts` — monetization, not balance) |

## Rules of the file

1. **Pure data only** — numbers, strings, tables. No functions. (This is what
   lets a future override layer diff and merge it; `SCORE.WALLS` was flattened
   from a function to the `WALLS_PER_LEVEL_SQ` coefficient for exactly this
   reason. `CLAN_BUILD_COSTS` is the data; the `BUILD_COSTS` accessor shape
   lives in `clans.ts`.)
2. **Every value carries a unit comment** (`/turn`, `frac`, `gold`, `hours`…).
3. **Curve-shaped knobs are Curve descriptors** (see §Curves below) — the
   SHAPE itself is data you can swap. Multi-variable formulas (the full
   production equation, combat resolution) stay engine-shaped compositions
   *of* those curves.
4. **What stays out:** display text (`descriptions.ts`, names, tips),
   structural identity (building/field IDs, counter pairings, foundry ladder,
   phase order), monetization (Charter price).

## Curves — pluggable formula shapes

Eight sites are governed by a `Curve` descriptor (`lib/constants/curves.ts`)
instead of a fixed formula. A curve is pure data describing `y = f(x)`; pick
any kind per site:

| kind | meaning |
|------|---------|
| `constant` | `y = value` |
| `linear` | `y = base + perX·x` |
| `geometric` | `y = base · ratio^x` |
| `exponential` | `y = base · e^(rate·x)` |
| `polynomial` | `y = c0 + c1·x + c2·x² + …` |
| `steps` | lookup table — y of the last `[x, y]` point at or below x |
| `expr` | **your own equation as a string** — `"2000 * 1.3 ^ (x - 1)"` |

`expr` is parsed by our own ~150-line whitelist evaluator (`compileExpr`) —
no `eval()`, deterministic, only numbers, `+ - * / ^ ( )`, the functions
`min max floor ceil round sqrt abs log exp`, and the variable `x` (aliases
`level`, `n`). `-2^2 = −4`; `^` is right-associative. Malformed formulas
throw loudly at first evaluation.

The curve-governed sites (each names its `x` in balance.ts):

| Descriptor | x | Default |
|---|---|---|
| `GROWTH_CURVE` | total civilian levels | `"1 + 99 * x / 130"` (1→100/day) |
| `BUILDING_COST_CURVE` | target level | `"1.5 ^ (x - 1)"` (×1.5/level) |
| `RESEARCH_COST_CURVE` | Nth research overall | `"2000 * 1.3 ^ (x - 1)"` |
| `WORKER_OUTPUT_CURVE` | building level | linear 50·level |
| `CARAVAN_DELIVERY_CURVE` | Market Sq level | linear 110 − 10·level (floor 10) |
| `WALL_BONUS_CURVE` | wall level | linear 0.1·level |
| `WALLS_SCORE_CURVE` | wall level | polynomial level²·100 |
| `STORAGE_SHELTER_CURVE` | store level | linear 20 000·level |

Each is evaluated in exactly ONE place — the matching helper in
`lib/constants/derived.ts` (`growthPerDayAt`, `buildingCostMultiplier`,
`researchOrdinalCost`, `workerOutputAtLevel`, `caravanDeliveryTurnsAt`,
`wallBonusAtLevel`, `wallsScoreAtLevel`, `storageShelterAtLevel`) — which both
the engine and the UI consume, so displayed numbers always match charged
numbers. Clamps and rounding (the 1-settler floor, whole-turn delivery,
integer RP) stay engine-side and survive any curve you write.

Swapping a shape is one edit — e.g. a linear-research era:

```ts
export const RESEARCH_COST_CURVE: Curve = { kind: "linear", base: 0, perX: 2000 };
```

## Seeing & tuning the numbers — the two balance pages

Two pages read this catalog (`lib/balance/catalog.ts`, a client-safe
description of every curve, scalar, and reference table — each with a
plain-language `desc` — plus readers for their compiled values). Both split the
material into six **category tabs** (`CATEGORIES`: Growth & People, Economy &
Trade, Research, War & Army, Victory & Rank, World & Races) so no screen is a
wall of numbers, and both render each curve through `components/CurvePanel.tsx`:
a large chart (`CurveChart.tsx`, a pure SVG sampler over `evalCurve`) beside an
explanation — what the two axes mean in words, an "at a glance" table of sample
values across the domain, and the prose `desc`. A chart on either page always
plots the exact function the engine runs.

- **`/almanac` — The Codex of Balance (public, read-only).** No login. A
  masthead, the category tabs (as `?c=<key>` links), and per category: the
  curve panels, the one-off scalars as described cards, and the domain's
  reference tables (training, tiers, siege, counters, clan hall, XP, loot,
  races). Linked from the **Guides ▾** nav dropdown (TopNav + MobileNav)
  alongside the Field Manual.
- **`/admin/balance` — the Balance Workbench (Crown-gated).** The same catalog,
  editable, same tabs (a per-tab badge counts that category's pending edits).
  Each curve panel adds a shape selector + parameter fields; the chart redraws
  on every keystroke and ghosts the compiled default behind the edited curve so
  you see exactly what changed ("settlers at 130 levels went 100 → 200").
  `CurvePanel` diffs against a `baseline` prop (the compiled default) rather than
  its starting value, so edits stay flagged and survive tab switches. Scalars are
  inline number inputs with their descriptions. A sticky bar counts all pending
  changes and exports a **sparse `{curves, scalars}` diff** — the exact shape
  destined for `world.meta.balanceOverrides`. Edits are preview-only today
  (nothing writes to the running game); apply one by matching it in `balance.ts`.

Access: `lib/server/admin.ts` opens the whole `/admin` tree to everyone during
the build phase — `devOpenAdmin()` is true when no `ADMIN_PASSWORD` is set and
`NODE_ENV !== "production"`. Set `ADMIN_PASSWORD` (as in `.env.local`) to seal
it behind the Crown login again.

## Tweaking an era (build phase)

1. Edit `balance.ts`.
2. Dev server hot-reloads; for a clean slate delete the dev world store and
   let it reseed (dev data is disposable).
3. `pnpm test && pnpm sim` — the sim is the pacing smoke test
   (Village→Town day, pop@60d, combat matchup tables).

## Deferred until launch prep (designed, not built)

When there is a live server and real eras, add — in this order:

1. **Per-era runtime overrides**: a sparse JSON diff stored in the world
   (`world.meta.balanceOverrides`), deep-merged over the compiled defaults by
   a single `getBalance(world)` accessor threaded through the engine entry
   points (tick, dailyReset, combat, commands, score, market). Staged as
   `world.meta.nextEraBalance` and applied at era rollover only (mid-era
   hot-change by explicit admin action, never by default).
2. **Validation**: a schema derived from the defaults' shape (correct keys,
   fractions 0–1, positive costs, monotonic tier power, race modifiers within
   ~0.4–1.5×) rejecting bad overrides at staging time; `pnpm sim` wired in as
   a gate.
3. **Annals stamping**: at era seal, record the effective balance (defaults
   version + applied diff) into the sealed age, so history stays
   interpretable ("Age 3 ran under loot 30%").
4. **Admin surface**: a "Next-era balance" panel — effective values, staged
   diff, validation result, apply-at-rollover toggle.

The pure-data rule above is the down payment on all four: the file is already
diff-able, serializable, and versionable.
