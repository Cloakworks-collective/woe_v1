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
| 3 | Population & growth | growth curve, housing/bed, wall settler penalty, scattering, settlement titles |
| 4 | Economy | tax gold rate, production/worker/level, food upkeep, surrender factors, merc price/cap/upkeep, storage shelter |
| 5 | Building costs | base costs, 1.5× growth, gold share, ratio bands, muster beds, repair factor |
| 6 | Research | ordinal base & growth, switch loss, max level, effect/level |
| 7 | Units & training | `UNIT_STATS`, tier power, training costs, tier cost mult |
| 8 | Battle | action turns, stamina, lethality, break threshold, luck, wall bonus, engine fire, escalade, XP bands, loot, revenge window, bombard params |
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
3. **Formula SHAPES live in the engine**, only their *parameters* live here.
   Want a different curve (not just different coefficients)? That's an engine
   change, by design.
4. **What stays out:** display text (`descriptions.ts`, names, tips),
   structural identity (building/field IDs, counter pairings, foundry ladder,
   phase order), monetization (Charter price).

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
