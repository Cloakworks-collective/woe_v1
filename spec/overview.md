# War of Empires (WoE) — Game Overview

## Concept

War of Empires is a persistent, turn-based multiplayer strategy game where players manage empires — training peasants as workers or soldiers, building infrastructure, and waging war against other players. The game runs in real time (resources generated every 10 minutes per turn), and empires persist while players are offline.

## Races

There are 6 playable races, each with distinct bonuses and penalties:

| Race     | Strengths                                          | Weaknesses                               |
|----------|----------------------------------------------------|------------------------------------------|
| Humans   | +25% all production, best spies, solid troops      | No specialty; average walls and siege    |
| Elves    | Best archers, wood production                      | Poor stone/ore, frail, weak siege        |
| Orcs     | Best cavalry, food & ore production                | Poor wood, weak siege, soft walls        |
| Trolls   | Best siege, stone production, strong footmen       | Poor cavalry, archers, food              |
| Dwarves  | Best footmen & walls, stone/ore mining             | Very poor wood, poor food, slow cavalry  |
| Gnolls   | Skirmisher archers, best counter-intel, wood       | Poor stone, frail                        |

(Exact multipliers — balanced by equal-cost army power, not sum-zero — in
`architecture.md`; ported from the original 2006 balance workbook.)

## Where everything is written down

| File | Owns |
|---|---|
| `overview.md` | this — the concept, the races, how an age is won, where numbers live |
| `empire.md` | the peacetime game: economy, buildings, research, the Bazaar |
| `combat.md` | raid, castle attack, revenge, bombard — and the model behind them |
| `espionage.md` | spies and scouts, the spy-turn economy, every operation |
| `clans.md` | banners, clan war, diplomacy, and the Royal Charter |
| `architecture.md` | how it is built: the tick, the command pipeline, storage |

Nothing is described twice. Where this file mentions a mechanic it links to the
file that owns it, because a summary that repeats detail is just a second place
for the same fact to rot.

## Core Loop

1. **Recruit** — Receive peasants daily (base 1/day, up to 100/day via civilian buildings; damaged walls cut growth up to 50%; settlers beyond your empty Hearthstead beds find no roof and are **lost, not queued** — see `empire.md`).
2. **Train** — Assign peasants as workers (gold + resources per turn) or raise them **directly** into soldiers — footmen, archers, or cavalry at light/medium/heavy tiers — plus engineers, spies, and scouts. There is no separate "warrior" step; the tier you can field is gated by your trainer and Forge levels.
3. **Reinforce** — Tier up (each tier needs its trainer *and* the Forge at that level) and hire **mercenaries** — sellswords in the same arms and tiers, bought for gold to bolster the host quickly.
4. **Build** — Construct defences, peasant buildings, and military/specialty buildings to unlock capabilities.
5. **Attack** — Launch raids, sieges, revenge attacks, or bombardments against other players (10 action turns each).
6. **Manage** — Monitor stamina, food, experience, and use advisors to guide strategy.


## Clans

- A player founds a clan alone for **50,000 gold** (or petitions to join one); the roster holds **5 members**, rising to **20** as the Clan Hall grows.
- Leadership (leader, vice, 3 officers) builds clan buildings from a shared storage pool all members feed: Clan Storage → Clan Hall (member cap + shrinks the tax production penalty, down to 50% at max) → Clan Wonder (discounts mercenary/troop/siege costs for every member).
- Clan wars double battle damage both ways; friendly clans share online status and last-attacked times. Neutral is the default. (Full design: `clans.md`.)

## Command View & Advisors

Overview screen with historical stats (battles won/lost, resource totals). Four AI advisors:

- **Defensive** — State of defences and improvement suggestions.
- **Military** — Troop readiness and recommendations.
- **Economic** — Production efficiency and worker balance.
- **Population** — Empire growth and recruitment optimization.



## Target Platform

- **Client:** Web browser (TypeScript)
- **Server:** Node.js / TypeScript
- **Real-time:** Turn-based with 10-minute tick intervals, persistent world

---

## Winning the Age

The game runs in **eras** (server seasons). An era ends when someone wins —
and **the next era is named after the winner**. Two ways to win.

---

### 1. Grand Overlord (individual)

**Two gates, both absolute.**

- **Army floor: 2,400 regulars** (`ARMY_FLOORS.INDIVIDUAL`) — footmen, archers
  and cavalry only. Mercenaries never count, so gold cannot buy a throne;
  engineers never count, so a siege park is not mistaken for an army. #1 held
  below the floor accrues nothing.
- **Never clanned.** The solo crown is for someone who did it alone, so it asks
  that they *always* were. One day of membership disqualifies for the whole age
  (`everJoinedClan`, cleared only by `eraReset`). Without this the dominant play
  is to take a clan's vault, Works and protection all era, leave at the end, and
  launder it into an individual win.

Hold the **#1 ranking spot**:

- **72 hours cumulative** at #1 (the cumulative clock only ticks while you
  hold #1 *and* meet the floor; it never resets), **and**
- **12 hours consecutive** at #1 (this streak restarts every time you lose
  the top spot — or drop below the floor).

Win the moment both are true. So a contender must not just touch #1 — they
must *defend* it: rivals have every incentive to bombard, revenge, and
scatter the leader's population to break the 12-hour streak. Scattering is
double poison for a would-be Overlord near 10k: it cuts score *and* can
stop the clock entirely.

### 2. Clan Victory

Same structure, clan-scale: the clan's score is the **sum of member scores
plus clan building points**, and it must hold **#1 clan** for 72 hours
cumulative + 12 consecutive, behind **two** gates:

- **25,000 regulars** summed across its members (`ARMY_FLOORS.CLAN`), and
- a **completed Clan Wonder** (level 3).

The army proves the banner can fight; the Wonder proves it can build. The Wonder
is the most expensive thing in the game and is itself gated behind Clan Storage
10, so it cannot be rushed by one rich member in an afternoon — without it a
clan could take the age purely by mustering troops, and the whole clan economy
(the pool, the 3× rule, the deep Storage the Wonder needs) would be optional
decoration.

### Winning ENDS the age, immediately

The moment both clocks complete, `world.meta.winner` is set and **the world
stops**. Not "a banner appears and play continues" — the ladder that was won is
the ladder that stands:

- **Commands are refused.** No attack, build, trade, training or clan politics.
  The gate is an ALLOWLIST (`ALLOWED_AFTER_VICTORY`), so anything added later is
  frozen by default; only housekeeping, a Charter payment that lands after the
  bell, and chat still work — nothing that can move a score.
- **The clock stops.** `ticksDue` and `runDueTicks` both return 0, so no
  production, growth or research accrues. `eraReset` builds a fresh world with a
  fresh `lastTickAt`, so nothing accumulates while the age sits sealed.
- **Monitoring knows.** `tickHealth.eraOver` reports the stop as healthy, or the
  dead-man switch would page someone nightly until an admin closed the age.

Reads are untouched — the finished world stays fully browsable. An admin seals
it with `adminCloseAge`, which does not route through the command pipeline.

| Clan building | Points                                   |
|---------------|------------------------------------------|
| Clan Storage  | 500 × level × integrity                  |
| Clan Hall     | 2,000 × level × integrity                |
| Clan Wonder   | 10,000 × level × integrity               |

Integrity scaling means **bombarding a rival clan's buildings directly cuts
their clan score** — at the cost of clan-wide revenge exposure (`clans.md`).

**Army floor: 25,000 regulars summed across the clan** (`ARMY_FLOORS.CLAN`;
footmen, archers and cavalry — no mercenaries, no engineers). Below it, the
clan's clocks freeze. A full 20-member clan needs to average 1,250 regulars per
member — clan victory requires a broad, genuinely armed roster, not one whale
and nineteen passengers.

**War defeat freezes the clocks too:** a clan that loses a clan war accrues
no victory time during the 48-hour post-war truce (`clans.md`). Beating the
#1 clan in a war is therefore a direct play against their era win.

Whichever trigger fires first — Overlord or Clan — ends the era. The next
era bears the winner's name: *"The Era of \<clan name\>"* (or the Overlord's
empire name for an individual win).

---

### Ranking score

Ranking measures the **visible empire** — what a traveler would see riding
through. Covert and siege assets count for nothing.

| Component                          | Points                                        |
|------------------------------------|-----------------------------------------------|
| Civilian population                | 10 per citizen                                |
| Regular troops                     | 10 × tier power (light ×1, medium ×1.8, heavy ×3) |
| Walls                              | level² × 100, scaled by current integrity     |
| Levelled buildings (civilian + military) | 200 per level                           |
| Hearthsteads / Muster Halls        | 50 per building                               |
| Treasury                           | gold ÷ 100 + resources ÷ 2,000 (bulk goods valued ≈ 0.05 g; was ÷ 50 pre-sim) |
| Army experience                    | 100 × XP (0–100) — veterancy is prestige      |
| Research (eligible fields)         | 1,000 × level                                 |

**Excluded — worth zero points:**
- Siege: engineers, siege gear, Siegecraft research
- Espionage: spies, scouts, Shadow Guild/Ranger's Lodge do count as building
  levels, but the covert fields (Tradecraft, Pathfinding) do **not**
- Mercenaries (rented, not owned)
- Clan buildings (they're the clan's, not yours)

**Research that helps your ranking** (the "some research" rule): Crop
Rotation, Forestry, Masonry, Deep Smelting, Art of War, Shieldcraft,
Statecraft — see `empire.md`. The excluded fields are the covert ones (Tradecraft,
Pathfinding) mirror the excluded assets: the tools of destruction and
shadow bring power, not prestige.

#### Design consequences (intended)

- Wall damage (integrity scaling) and population scattering directly cut the
  leader's score — **bombard and revenge are the anti-Overlord weapons**,
  and neither adds a point to the attacker's own score.
- A pure siege/spy empire is powerful but invisible on the ladder; a
  contender must build the *visible* empire and then protect it.
- Treasury counts, so sitting on unbanked gold is score — and bait.

---

### The Annals (grand chronicle)

Every age keeps a **world-wide chronicle** — the significant public events of
the realm, distinct from each player's private Chronicle (their own inbox).
The Annals record: the age dawning, **the crown changing hands** (a new #1 on
the ladder), **clan wars declared and won**, **castles sacked** (successful
sieges, with the gold carried off), and the **victory** that ends the age.
Entries are tone-coloured and time-stamped; the live feed is the page
`/annals`.

When an age ends, its Annals are **sealed for good** — archived with the era
name, the victor, the final top-10 ladder, and the full **War Records** (below)
— and carried forward across every future reset as the realm's history books.
The next age opens its own fresh Annals with a naming entry. (Implementation:
`world.chronicle` live + `world.chronicleArchive[]` sealed; `eraReset()` does
the sealing.)

### War Records (the leaderboards of the age)

Every age keeps a full set of **superlative leaderboards** — the same shape as
the sealed Elder Ages — tallied live and visible at `/rankings/records`, then
frozen into the Annals when the age ends. Two kinds of feat feed them:

- **Flow tallies** — running totals accumulated as deeds happen, kept
  independently of the capped battle log so an early record still stands at the
  age's close (`EraRecords.feats` per ruler, plus the five battle lists):
  - **Champions of the Realms** — the champion of each feat of arms, each with
    an epithet: Defenders Killed (*the Slayer*), Attackers Killed (*the
    Defender*), Gold Won in Battle (*the Plunderer*), Resources Won (*the
    Raider*), Regular Troops Slain (*the Empire Destroyer*), Most Siege Damage
    (*the Siege Master*), plus snapshot feats Most Experienced Army (*the
    Undefeatable*) and Strongest Empire-less Ruler (*the Black Knight*).
  - **Non-Battle Titles** — the leader of each civil feat: Most Market Sales
    (*the Marketeer*), Most Gold Given Away (*the Generous*), Most Resources
    Given Away (*the Bountiful*), Most Spy Damage (*the Saboteur*), Most
    Resources Destroyed (*the Vandal*), plus snapshot feats Most Research (*the
    Wise*), Largest Population (*the Populous*), Grandest Works (*the
    Architect*), Greatest Wealth (*the Wealthy*).
  - **Richest Attacks / Richest Raids / Bloodiest Attacks / Greatest Wars /
    Greatest Feuds** — the top-N single clashes and running rivalries.
- **Snapshot ladders** — read from the live empires at build time (and frozen
  at seal): **Greatest Rulers** (the ladder), **Strongest Empires** (the clan
  ladder), **Lords & Ladies** (the mightiest ruler of each race).

(No gold-stealing spy op exists, so the old *"the Thief"* title is omitted until
one does.) Implementation: `lib/server/eraTables.ts#buildEraTables(world)`
assembles all tables as `ElderTable[]`, rendered through the Elder Ages'
`LeaderTable`; `eraReset()` stores the frozen set in
`ArchivedAge.sealedTables`.

### Era transition

- Winner declared → era closes; final ladder is frozen and archived; the age's
  **Annals are sealed** into the history books.
- Next era: fresh world, named after the winner. The first **5 days are at
  peace** — no attacks while everyone rebuilds (`combat.md`).

**What persists across eras:** player accounts and titles, era history
(winners' names **and the sealed Annals of every past age**), clan identities
and war records, and **DMs**. Everything else resets — empires, the ladder,
world chat, and clan chat are wiped. Permanent trophies: the era name, plus
"Grand Overlord \<name\>" or founding membership of the winning clan.

---

## Where the numbers live

**Every number that shapes how the game plays lives in
[`lib/constants/balance.ts`](../lib/constants/balance.ts).** Change a value
there, restart the dev server (or reseed the world if the change invalidates
existing saves), and the next age behaves differently. That file — not the
specs, not the scattered domain files — is the source of truth for balance.

### How it's organized

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

### Rules of the file

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

### Curves — pluggable formula shapes

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

### Seeing & tuning the numbers — the two balance pages

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

### Tweaking an era (build phase)

1. Edit `balance.ts`.
2. Dev server hot-reloads; for a clean slate delete the dev world store and
   let it reseed (dev data is disposable).
3. `pnpm test && pnpm sim` — the sim is the pacing smoke test
   (Village→Town day, pop@60d, combat matchup tables).
