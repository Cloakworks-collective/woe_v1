# War of Empires — Architecture

## High-Level Architecture

```
┌──────────────┐  cmd:* → API routes   ┌──────────────────────┐
│   Browser     │ ────────────────────► │  Next.js on Vercel    │
│  (Next.js UI) │                       │  (API routes = game   │
│               │ ◄──────────────────── │   logic, serverless)  │
└──────────────┘  evt:* ← Supabase     └─────────┬────────────┘
                   Realtime channels              │
                                        ┌─────────┴────────────┐
        Vercel Cron (*/10) ───────────► │  Supabase             │
        tick endpoint                   │  (Postgres + Auth +   │
                                        │   Realtime)           │
                                        └──────────────────────┘
```

---

## Server Architecture

> **Game mechanics are not described here.** Races, troops, stamina, veterancy,
> scattering, combat, attack modes, buildings, clans and the protection windows
> all live in `overview.md`, `empire.md`, `combat.md` and `clans.md`. This file
> covers only how the thing is *built* — the tick, the command pipeline, storage,
> the protocol and the client.
>
> That rule is load-bearing. When mechanics were duplicated here, the `ArmyState`
> in this file drifted two schema versions behind `lib/engine/types.ts` without
> anyone noticing, because a reader had no way to tell which copy was the truth.


### Turn / Tick System

The game is turn-based with a 10-minute tick interval. Each tick:

1. **Food upkeep** — 0.1 × (civilians + regular troops) deducted; at 0 food the empire **starves**: steps 2–4 and attacking are suspended until fed (`empire.md`).
2. **Tax income** — Every civilian pays `0.4 × taxRate` gold; mercenary upkeep is deducted — unpaid mercenaries defect (see `empire.md`). Regular military has no upkeep.
3. **Production** — Each worker yields `50 × buildingLevel × (1 − taxRate)` units of their resource (food, stone, ore, wood, research) — 50/turn per level at 0% tax, uncapped worker count — modified by statecraft, clan-hall shelter, and race bonuses (`empire.md`).
4. **Stamina recovery** — Idle troops regain 1 stamina point per turn (passive).
5. **The Steward** (premium holders only, `clans.md`) — build queue, research queue, standing orders; issues ordinary instant commands when they become possible.
6. **Daily reset** — Once per day: recruit new peasants based on civilian buildings, reduced by wall damage (see `empire.md`); then the peasant-scattering check (troops < 30% of civilians → peasants leave).
7. **Queue processing** — Research completion. (Building upgrades and troop training are instant — no construction timers.)

Key design point: food upkeep is deducted *before* production is added each
tick, so a starving empire can't feed itself with the same tick's harvest —
recovery takes a fed tick (farmers) or a Bazaar purchase.


### Target Discovery

No world map. Players find targets through a **browsable ranking list with
search and filters** (name, score range, settlement title, clan, online
recency). The ladder is the world; the XP bands (`combat.md`) make your
±20% score neighborhood the natural hunting ground.












### Social System (forum-style)

Three channels, different lifetimes:

| Channel       | Scope                | Lifetime                          |
|---------------|----------------------|-----------------------------------|
| **Era chat**  | Global, everyone     | Wiped when the era ends           |
| **Clan chat** | Clan members         | Wiped when the era ends           |
| **DMs**       | Player ↔ player      | **Permanent** — persists across eras |

Forum-style threads (not just a scrolling feed): posts, replies, timestamps.
Permanent things that survive era resets: DMs, player accounts/titles, clan
war records, era history (winners' names). Everything in-world (chat, state,
ladder) resets with the era.


### Advisor System (Command View)

Server computes advisor recommendations based on player state:

```ts
interface AdvisorReport {
  defensive: {
    wallLevel: number
    recommendation: string    // e.g. "Upgrade walls to level 3"
  }
  military: {
    troopReadiness: string
    recommendation: string    // e.g. "Rest your troops, stamina is low"
  }
  economic: {
    productionRate: ResourceRates
    recommendation: string    // e.g. "Train more miners, ore production is low"
  }
  population: {
    dailyRecruitment: number
    recommendation: string    // e.g. "Build more housing to increase recruitment"
  }
}
```

---

## The Game Loop — turns, battles, and the heartbeat

Two clocks drive everything, and only one of them is a clock at all.

```
                 ┌──────────────────────────────────────────────┐
                 │  THE WORLD CLOCK — derived, not scheduled     │
                 │                                               │
                 │  tickNumber is a FUNCTION of wall-clock time: │
                 │      due = floor((now − lastTickAt) / 10min)  │
                 │                                               │
                 │  Nothing has to fire on time. The number of   │
                 │  ticks owed is always recomputable from a     │
                 │  timestamp, so a tick can be *late* but never │
                 │  *lost*.                                      │
                 └──────────────────────────────────────────────┘
```

### Turns: lazy catch-up on read

```
  player opens a page
        │
        ▼
  getGame() / any API route
        │
        ├─► runDueTicks(world)          lib/server/world.ts
        │        │
        │        │  due = floor((now − lastTickAt) / 10 min)
        │        │  capped at 2016 (two weeks)
        │        │
        │        └─► for each owed tick: runOneTick(world, scheduledAt)
        │                 · production, tax, food upkeep, starvation
        │                 · action turns +2, spy turns +1
        │                 · research banking, build/steward queues
        │                 · at a day boundary: processDailyReset
        │                       (settlers arrive, peasants scatter)
        │
        ▼
  commitWithRetry → save (compare-and-swap)
        │
        ▼
  page renders a world that is exactly as old as the reader
```

Each caught-up tick is credited at **its own scheduled wall-clock time**, not at
`now`, so the victory hold-clocks stay monotonic through a catch-up run.

### Battles: synchronous, inside one command

A battle is not a scheduled job. It is a pure function called during a single
command, and it completes before the HTTP response returns.

```
  POST cmdAction { __cmd: "attack", mode, targetId }
        │
        ▼
  runCommand ──► worldServiceEnabled() ?
        │              ├── yes ─► forwardCommand → single-writer service queue
        │              └── no  ─► commitWithRetry(applyOneCommand)
        ▼
  doAttack(world, attacker, target, mode)      lib/server/pipeline.ts
        │
        ├─ validateAttack(...)                 PURE — may this blow land?
        ├─ resolveBattle / resolveBombard      PURE — rng injected, no clock
        │      returns { attacker, defender, report }
        │
        └─ side effects, all in the same commit:
              turns −10 · shield dropped · revenge windows re-armed
              inbox letters · chronicle · era records · clan war ledger
        │
        ▼
  save (CAS; on conflict → reload and REPLAY the whole command)
```

**Replay-on-conflict is why the engine must stay pure.** Two attacks landing on
the same defender at once will lose the compare-and-swap, reload, and re-run —
which re-rolls the battle against the fresh world. That is correct only because
`resolveBattle` reads nothing but its arguments and the RNG it was handed.

**And why `apply` gets a private copy.** Purity is necessary but not sufficient:
replay is only safe if each attempt starts from a *clean* world. `getWorld`
returns the shared cached object, and Fluid Compute runs concurrent requests in
one Node instance — so `commitWithRetry` hands `apply` a `cloneWorld` draft.
Without it, two commands mutate the same world: the first serialises the
second's half-applied changes into its own write, the second then loses the CAS,
reloads a world that already contains its effects, and applies its command a
second time. Gold spent twice, a battle resolved twice.

For the same reason the expected version is **tagged on the world object**
(`worldVersion`, a WeakMap) rather than kept in a module global. A global is
read at save time, so it belongs to whichever load ran last — not to the world
the caller is actually holding, which is precisely the comparison the CAS exists
to make. Callers that build a *replacement* world (`eraReset`) must
`carryWorldVersion` onto it, or it will try to insert a second row.

Lost attempts back off with **full jitter** (`retryDelayMs`, ≤400ms across five
attempts). Retrying instantly is the trap: every loser of a race wakes at the
same moment and collides again, so contention re-synchronises instead of
resolving. Retries aren't cheap either — each is a forced reload plus a full
re-apply including `runDueTicks` over every player.

### Two write models, same pipeline

| | §14.1 in-process (default) | §14.2 world service |
|---|---|---|
| Ticks driven by | `runDueTicks` **on read** | `setInterval` **inside the service** |
| Concurrency | optimistic CAS + replay | a single writer, serialised queue |
| Set by | *(nothing — the default)* | `WORLD_SERVICE_URL` |

`applyOneCommand` is shared verbatim by both. The only difference is what
serialises the writes.

### The heartbeat, and what it is actually for

Ticks run **lazily on read**: `applyOneCommand` calls `runDueTicks` before
*every* command, and `runOneTick` iterates *every* player. So the common worry —
"an offline defender is frozen, so attacking them yields stale loot, or they
yield at a stamina they would have recovered from" — **does not happen**. The
attacker's own command catches the whole world up first, defender included,
before `validateAttack` or the yield check reads a single number.

That makes the cron a **backstop, not a dependency**. It earns its place for
three reasons, none of which is a correctness bug and all of which are real:

1. **Time is lost past the catch-up cap.** `runDueTicks` replays at most 2,016
   ticks (two weeks) in one go, and `lastTickAt` jumps to the end of what it
   actually ran. A world quieter than that loses the excess permanently.
   `tickHealth().losingTime` flags it.
2. **The backlog lands on a player.** After three silent days the next person to
   act replays 432 ticks inside their own request. If it times out, *their*
   command fails — and it is never the person responsible for the silence who
   pays.
3. **The spectator ladder freezes.** `/spectate` reads a snapshot written only
   when a tick processes, so a world with nobody logged in shows the public
   stale standings.

```
  Vercel Cron ──every 10 min──► GET /api/tick
                                     │
                                     ├─ world service enabled? ─► report only
                                     │     (the service runs its own timer)
                                     │
                                     └─ commitWithRetry(runDueTicks)
                                            │
                                            ├─ 0 due  → no write, no log line
                                            └─ N due  → replay N, snapshot, log
                                     │
                                     └─► check in to HEARTBEAT_PING_URL
                                           healthy → <url>      (dead-man reset)
                                           behind  → <url>/fail (raise)
```

### What the app cannot tell you about itself

Everything above reports on a beat that *ran*. The failure mode that matters
most is the beat that **didn't** — and no amount of instrumentation inside the
request can report on a request that was never made. Vercel Cron gives you logs
and no alerting, and on Hobby a ten-minute schedule is silently coerced to
daily, which looks perfectly healthy in every line we emit.

So `/api/tick` checks in to an external dead-man switch (`HEARTBEAT_PING_URL`;
healthchecks.io or equivalent) on every healthy beat, and posts to `<url>/fail`
when a run threw or the clock is still behind afterwards. The watcher alerts on
**silence**, which is the only way to catch both the crash and the silent
downgrade. Best-effort by design and firewalled in a `try`: a monitoring outage
must never fail a tick that was otherwise fine.

"Healthy" deliberately is *not* `losingTime` — that only trips after two weeks
of silence, by which point the alert is an obituary. A beat is good when the
last run didn't throw and the clock is now current, since a successful catch-up
leaves nothing owed.

### Why firing it twice is safe

**Idempotence here is structural, not bookkeeping.** The endpoint never asks
"have I already run?" — it asks "what is owed?", and the answer is a pure
function of two timestamps:

```
due = floor((now − lastTickAt) / 10 min)
```

Fire it twice in the same second and the second call finds `due = 0` and does
nothing. Fire it an hour late and it pays all six at once. There is no queue to
double-drain, no cursor to corrupt, and no "already processed" set to keep.
A failed run leaves `lastTickAt` untouched, so the next beat simply retries the
same work — self-healing without a retry mechanism, because nothing was
consumed. `world.tickLog` keeps every run with its duration and error, so a
heartbeat that is failing silently looks different from one that is healthily
idle (`processed: 0` with `behind: 0`, versus `behind` climbing).

Tests in `lib/server/tickHeartbeat.test.ts` pin all of this: double-firing is a
no-op, and one late catch-up lands on byte-identical state to six punctual runs.

> **Deployment note.** `vercel.json` schedules `*/10 * * * *`. Sub-daily cron
> frequency requires a Vercel plan above Hobby; on Hobby the schedule is
> silently coerced to once a day, which still bounds the backlog well inside the
> two-week cap. `CRON_SECRET` guards manual callers; Vercel's own cron is
> recognised by its user-agent.


## Data Model

### Player
```ts
interface Player {
  id: string
  name: string
  race: "human" | "dwarf" | "elf" | "orc" | "troll" | "gnoll"

  // Premium — the Royal Charter (clans.md)
  premium?: boolean            // unlocks the Steward
  buildQueue?: BuildingId[]    // FIFO; head built when affordable (≤10)
  researchQueue?: { field: string, toLevel: number }[]   // one entry = one level (≤10)
  standingOrders?: StandingOrder[]   // "once X, do Y" (≤10)

  clanId?: string
  clanDepartures: number    // leaves + kicks this era; at 2, no more joining (clans.md)
  clanJoinableAt?: Date     // 48h cooldown after leaving/being kicked

  // Population
  idlePeasants: number
  workers: {
    farmers: number
    quarrymen: number
    miners: number
    lumberjacks: number
    merchants: number      // UNCAPPED — the Market Square level scales each
                           // caravan's capacity and speed, not the headcount
    researchers: number    // UNCAPPED — the Collegium level scales output
  }
  army: ArmyState           // troops trained directly by type/tier; mercenaries
                            // are a parallel typed force (ArmyState.mercenaries)

  // Economy
  gold: number
  taxRate: number           // 0.0 – 1.0, default 0.5
  resources: {
    food: number
    wood: number
    stone: number
    ore: number
  }
  turnsAvailable: number    // action turns: +2/turn, start 200, cap 500; attacks cost 10
  spyTurnsAvailable: number // the covert clock: +1/turn, cap 200; spies AND scouts spend it
  onVacation: boolean       // blocks ALL attacks, revenge included; halves tax + production

  // Buildings
  buildings: BuildingState[]
  wallIntegrity: number     // 0.0–1.0; damaged walls cut pop growth (empire.md)
  buildingIntegrity?: Partial<Record<BuildingId, number>>  // 0.5–1.0, absent = full; bombard damage (empire.md)

  // Research (empire.md)
  research: {
    activeField?: string
    banked: Record<string, number>   // RP progress per field
    levels: Record<string, number>   // 0–5 per field
  }

  // Stats
  battlesWon: number
  battlesLost: number
  goldWon: number
  goldLost: number
  resourcesWon: Record<string, number>
  resourcesLost: Record<string, number>

  // Revenge tracking
  recentAttackers: { playerId: string, timestamp: Date }[]
  revengeUsed: string[]     // player IDs already revenged
}
```

### Building
```ts
interface BuildingState {
  type: string              // "walls", "muster_hall", "grange", "hearthstead", etc.
  level: number             // levelled buildings; for counted buildings (hearthstead, muster_hall) this is the count
}
```

### Battle Log
```ts
interface BattleReport {
  id: string
  attackerId: string
  defenderId: string
  mode: "raid" | "siege" | "revenge" | "bombard"
  turnsUsed: number
  phases: CombatPhaseResult[]   // siege, archers, cavalry, footmen
  attackerLosses: UnitLosses
  defenderLosses: UnitLosses
  staminaLoss: { attacker: number, defender: number }
  wallIntegrityDamage: number   // % of defender's wall destroyed (persists until repaired)
  buildingDamage?: { building: BuildingId, integrityLost: number }[]  // bombard: town buildings cracked open
  siegeGearLost: { attacker: Record<string, number> }
  victor: "attacker" | "defender"
  loot: {
    gold?: number
    resources?: Record<string, number>
  }
  experienceChange: { attacker: number, defender: number }
  timestamp: Date
}
```

---

## Networking Protocol

Logical protocol: `cmd:*` are Next.js API routes (request/response);
`evt:*` are delivered via Supabase Realtime channels (see Engineering
Decisions). The tables below define the contract, not the transport.

### Auth: session cookie + realm tokens

Two credentials open the same empire:

- **Browser session cookie** — set on found/re-enter (Supabase Auth takes
  this over later).
- **Realm token** (`woe_…`, per empire) — bearer credential for the CLI and
  any headless client (`Authorization: Bearer` or `X-Realm-Token`). Minted
  at creation (and lazily backfilled), shown in the Command View ("Rule
  from the terminal") and by `woe token`; also re-enters the empire at the
  login gate. Server-managed field on the Player doc — never game state.

### Read endpoints (JSON, for CLI / agent clients)

| Route                | Returns                                              |
|----------------------|------------------------------------------------------|
| `POST /api/join`     | Found an empire: `{name, race}` → realm token (the only unauthenticated route) |
| `GET /api/state`     | Own empire: meta, population, economy + production, army, buildings (+next costs), research, steward, advisors, chronicle, revenge windows |
| `GET /api/rankings`  | The public ladder (target discovery — id, name, race, title, clan, score, shield/vacation flags) |
| `GET /api/market`    | Bazaar board (price + supply per resource) and own caravans — counterparties never exposed |
| `GET /api/battle/:id`| Full battle report — participants only               |
| `GET /api/battles`   | The public **War Ledger**: last 100 battles, redacted (aggregate losses, gear count, wall/storage % — never composition, loot, or the log) |
| `GET /api/empire/:id`| Public profile: ladder facts + that empire's recent battles and aggregate battle totals (same redaction) |

Every read runs due wall-clock ticks first, like every page and command.

### Client → Server (commands)

| Type                 | Description                                  |
|----------------------|----------------------------------------------|
| `cmd:setTax`         | Set tax rate (0–100%)                        |
| `cmd:trainWorker`    | Train peasant as a worker type               |
| `cmd:trainTroops`    | Train peasants directly as footman/archer/cavalry at a tier |
| `cmd:dischargeTroops`| Return trained troops to the idle-peasant pool (gear lost)  |
| `cmd:restTroops`     | Spend turns + food to restore stamina        |
| `cmd:build`          | Start or upgrade a building                  |
| `cmd:research`       | Set the active research project (field)      |
| `cmd:attack`         | Launch attack (mode: raid/siege/revenge/bombard, target) — 10 action turns |
| `cmd:vacation`       | Depart on, or return from, vacation (`surrender` still accepted) |
| `cmd:spy`            | Spy mission (op type, target, spies sent) — 5 action turns |
| `cmd:scout`          | Scout recon against target — 2 action turns  |
| `cmd:marketPost` / `cmd:marketBuy` / `cmd:marketCancel` | Bazaar: dispatch a caravan, buy cheapest-first, recall (−50% of the load) |
| `cmd:blackMarketSell` / `cmd:blackMarketBuy` | The fence: instant resource trade against the system at 1 / 20 gold |
| `cmd:sellSiege`      | Break up engines for 50% of build cost, scaled by condition |
| `cmd:bankDeposit`    | Deposit gold in bank                         |
| `cmd:buyMercs`       | Hire mercenaries (type + tier) from the black market |
| `cmd:clanDeposit`    | Deposit gold/resources into clan storage     |
| `cmd:clanWithdraw`   | Withdraw from clan storage (≤ 3× lifetime deposits) |
| `cmd:clanManage`     | Leadership: build, appoint, invite/kick, declare war, set diplomacy |
| `cmd:chat`           | Post to era chat, clan chat, or DM (forum-style) |
| `cmd:queueBuild` / `cmd:queueBuildCancel` | Premium: manage the Steward's build queue (`clans.md`) |
| `cmd:queueResearch` / `cmd:queueResearchCancel` | Premium: manage the research queue |
| `cmd:orderAdd` / `cmd:orderRemove` | Premium: standing orders ("once X, do Y") |

### Server → Client (events)

| Type                    | Description                              |
|-------------------------|------------------------------------------|
| `evt:stateSync`         | Full state on connect                    |
| `evt:turnTick`          | Resource/gold production update          |
| `evt:dailyRecruitment`  | New peasants arrived                     |
| `evt:buildComplete`     | Build/upgrade confirmed (instant — direct response to `cmd:build`) |
| `evt:researchComplete`  | Research field level finished            |
| `evt:espionage`         | Mission result (attacker) / damage or caught-spy report (defender) |
| `evt:ranking`           | Ladder updates; #1 hold-timers (72h/12h) for era victory |
| `evt:battleReport`      | Full combat result                       |
| `evt:attacked`          | You were attacked (enables revenge)      |
| `evt:advisorUpdate`     | Updated advisor recommendations          |
| `evt:clanEvent`         | War declared, member joined/left, etc.   |
| `evt:chat`              | Incoming chat message                    |
| `evt:marketUpdate`      | Trade completed or new listing           |

---

## Client Architecture

Three clients, one backend:

- the **Next.js web UI**;
- **`cli/woe.mjs`** — a zero-dependency Node terminal client (`pnpm woe`)
  speaking realm-token auth over the same `cmd:*` pipeline + read
  endpoints. Full-color ANSI + ASCII art (castle banner, battle standards,
  trophy/skull); `join` founds an empire entirely from the terminal;
- the **Claude Code plugin** (`claude-plugin/`, marketplace manifest at
  `.claude-plugin/marketplace.json`): `/woe` slash command + a
  `playing-war-of-empires` skill (API reference, rules digest, strategy,
  ASCII dashboard templates) that lets Claude play as the user's herald
  over plain HTTP. Same tokens, same authority: the server validates
  everything, so agent play can't cheat. An MCP server on the same surface
  remains an option later.

### Visual direction (decided)

**Classic browser-strategy aesthetic — Travian / Tribal Wars.** Parchment
backgrounds, wood-and-gold chrome, small type (Verdana ~13px body, Georgia
serif headers), dense bordered data tables, beveled panels. Persistent top
resource bar and left navigation; server-rendered pages, minimal animation.
No world map (the ladder is the world), no heavy SPA effects. Hand-rolled
CSS (no UI framework) — the retro look *is* the design system.

### Pages / Views

- **Home / Command View** — Empire overview, historical stats, advisor panel.
- **Train** — Assign peasants to worker classes or military roles.
- **Troops** — Train footmen/archers/cavalry directly by tier, discharge, hire mercenaries, rest.
- **Rankings** — Browsable ladder with search/filters; the primary target-discovery surface (no world map). Each row carries a public raid line (how many times that empire has been attacked in the last 72h, by how many aggressors) linking to its War Record.
- **Empire profile** (`/empire/:id`) — Public dossier: rank, clan, win/loss, standing, lifetime reckoning, recent battles.
- **War Record** (`/empire/:id/history`) — Public, for *any* empire: who has struck them in the last 72 hours and how many times each, whom they have struck in return, and every battle in the window. Sourced from the world battle log (rolling last 300), so it exposes nothing the World News feed doesn't already publish — never composition, loot, or exact troop counts.
- **Attack** — Select target, choose mode and turns, view battle results.
- **Buildings** — Construct and upgrade defences, peasant, and military buildings.
- **Clan** — Clan management, chat, resource transfers, war declarations.
- **Market** (`/market`) — The Grand Bazaar: anonymous player order book, caravans, price history.
- **Black Market** (`/blackmarket`) — The fence: instant resource sales at 1 and purchases at 20 (straddling the Bazaar's 2–19 band), plus the breaker's yard for salvaging siege engines. Mercenaries are hired on the Army page.
- **Spy/Scout** — Launch espionage and recon operations.

### UI Elements
- Resource bar (gold, food, wood, ore) — always visible.
- Turn counter / next turn timer — always visible.
- Next day timer (for peasant recruitment) — bottom left.
- Stamina indicator for army.
- Advisor notifications/alerts.

---

### Admin — the Crown Chamber (`/admin`)

Hidden console (no nav link), enabled only when `ADMIN_PASSWORD` is set;
the session cookie is an HMAC keyed by the password (unforgeable without
it, timing-safe check). Crown decrees bypass the game pipeline:

- **Banish / pardon** — `player.banned` blocks the session cookie, the
  realm token, and every command; the empire remains in the world (still
  ticks, still attackable) until pardoned.
- **Royal grant** — give (or take, negative) gold/resources; the player
  sees "👑 A royal grant arrives" in their Chronicle.
- **Force turns** — +1 / +144 / N ticks (cap 1,008) on top of the wall
  clock; works in production, unlike the dev clock.
- **Grant / revoke the Royal Charter** (premium flag).

## Security & Validation

- Server is authoritative — all commands validated server-side.
- Resource checks before any action (sufficient gold, resources, turns, peasants).
- Prerequisite checks (building level requirements for troop tiers).
- Revenge attack: verify attacker was attacked within 18 hours (or their clan's buildings were bombarded while they were a member), hasn't already revenged.
- Mercy checks: raid/siege/bombard blocked vs players on vacation. Beaten-down
  (stamina < 25) and heavily outmatched defenders yield instead of being blocked.
- Protection checks: era peace (first 5 days) and 72h newcomer shield block all attacks.
- Action-turn balance checked before any attack (10 per attack).
- Rate limiting on attacks (prevent abuse / excessive targeting).
- Anti-farming: reduced loot and XP loss for attacking much smaller players; mercy rules block repeat attacks on beaten-down targets.
- Attack refusal: troops refuse targets ≥75% stronger by ranking score (revenge exempt).
- Clan membership churn: joining blocked during the 48h post-departure cooldown and after a player's 2nd departure of the era (see `clans.md`).

---

## Engineering Decisions

**Stack: Next.js on Vercel + Supabase. Everything deploys with `git push`.**

- **App:** one Next.js repo (App Router). UI pages + API route handlers in
  the same deployment. The game engine is a **pure TypeScript module**
  (`lib/engine/` — all rules; `lib/constants/` — every number in these
  specs), imported by API routes, the cron handler, and sim scripts alike.
  No side effects in the engine: `(state, command|tick) → (state, events)`.
- **DB + Auth:** **Supabase** — Postgres for state, Supabase Auth
  (email/password) for accounts. Player state as a JSONB document (one row
  per player, versioned for optimistic concurrency); normalized tables for
  market orders, battle reports, clans, chat/forum, rankings snapshots, and
  the era registry. DMs and era history live outside the per-era wipe.
  Writes go through API routes with the service role; RLS restricts direct
  client reads to each player's own rows and public data (ladder, forum).
- **Realtime (`evt:*`):** **Supabase Realtime** replaces the WebSocket
  server — serverless can't hold sockets. API routes and the tick write
  events to an `events` table / broadcast channels; clients subscribe to
  their own channel (private events), their clan channel, and public
  channels (ladder, era chat, market prices).
- **Tick:** **Vercel Cron** hits `/api/tick` every 10 minutes (secured by
  `CRON_SECRET`); a designated tick runs the daily reset + scattering.
  Ticks are numbered and idempotent — the handler processes all ticks since
  `lastProcessedTick`, so missed or delayed cron runs catch up safely.
  All time-windows (revenge, unrest, truce, tribute, shields, victory
  hold-clocks) are stored as timestamps and evaluated on tick + on access —
  never via in-process timers.
- **Commands (`cmd:*`):** each is an API route through one pipeline:
  auth → validate → apply (pure engine) → persist (optimistic version
  check) → publish events. The client never computes outcomes.
- **Sim:** the same pure engine driven by scripts (`pnpm sim`) for balance
  tuning — no server needed.
- **Payments:** **Stripe Checkout** for the Royal Charter premium
  (`clans.md`): hosted checkout page, webhook + success-redirect
  verification, idempotent grant. Dual-mode like the store — without
  `STRIPE_SECRET_KEY` a built-in terminal emulates Stripe's test cards
  (4242 4242 4242 4242) so the flow works with zero setup.

Constraints accepted with this stack: cron minimum granularity fits the
10-min tick; `/api/tick` must finish within serverless limits (fine at
launch scale — batch by player, resume via `lastProcessedTick` if needed).

**Current implementation status.** Supabase project `war-of-empires`
(`jmidtuoxclntwluygiab`, us-west-1) is live: migrations applied, and the
store (`lib/server/store.ts`) persists the whole World as a versioned JSONB
document (`world_docs`, migration 0002) whenever the env keys exist —
serverless-safe today. Falls back to a JSON file (`data/world.json`) with
no env keys. Still pending: decomposing the world doc into the normalized
0001 tables, Supabase Auth (a session cookie stands in), and Realtime
(page-load refresh stands in). The `cmd:*` protocol is live at
`POST /api/cmd/[name]`; UI forms use server actions calling the same
pipeline (`lib/server/pipeline.ts`).

**Commands do not navigate.** `cmdAction` (`app/actions.ts`) runs the command,
calls `revalidatePath("/", "layout")`, and **returns** `{ok, message}` rather
than redirecting. Redirecting was a navigation, and Next resets scroll on
navigation — so upgrading a building near the foot of a long page threw the
reader back to the header. Returning instead lets React swap in the re-rendered
server components in place: the numbers update, the scroll position holds, and
no full document reload occurs. `CmdForm` is the one client component that
drives this (`useActionState`), handing the result to `FlashProvider`, which
pins the herald's banner to the viewport so it is visible wherever you are
scrolled. The only command that still navigates is an attack, whose battle
report genuinely lives at `/rankings?report=…`.

`/api/tick` + Vercel Cron
(`vercel.json`) do wall-clock catch-up ticks; without a `CRON_SECRET`,
in-game dev time controls (+1 turn / +1 day) are enabled.

## Open Questions / TBD

Resolved (see the dedicated docs):
- [x] Production rates — `empire.md` (per worker: 50 × building level/turn at 0% tax, uncapped worker count; tax/statecraft/hall/race modifiers applied).
- [x] Combat formulas — `combat.md` (unit stats, damage, breaking, aftermath).
- [x] Building cost model — `empire.md` (ratio bands, 1.5× curve; per-building baseCost values still TBD). Upgrades are instant; no prerequisite tree beyond Forge gating.
- [x] Troop equipment costs — `empire.md` (light ×1 / medium ×2 / heavy ×4).
- [x] Stamina drain — `combat.md` (−8/round attacker, −5/round defender); rest cost formula still TBD.
- [x] Experience — `combat.md` (+5/battle, ×2 at 100 XP, proportional loss with dead regulars).
- [x] Marketplace — `empire.md` (anonymous Grand Bazaar, caravans, 5% fee).
- [x] Bank/storage protection — `empire.md` (5% per level, max 50%).
- [x] Daily recruitment — `empire.md` (civilian levels → 1–100/day, wall-damage penalty).

- [x] Victory & ranking — `overview.md` (Grand Overlord / Clan win, 72h cumulative + 12h straight at #1; score components and exclusions).

- [x] Race modifiers — sum-zero table above.
- [x] baseCosts, storage capacities, rest action — `empire.md` / `combat.md`.
- [x] Spy and scout operations — `espionage.md` (Tradecraft op ladder, catch mechanics, scout counter-espionage).
- [x] Clan buildings & costs — `clans.md`. Coordinated-attack mechanics still v2.
- [x] Client stack, DB, auth, tick engine, deployment — Engineering Decisions above (Next.js on Vercel, Supabase Postgres/Auth/Realtime, Vercel Cron).

Still open:
- [ ] Numeric tuning via simulation (ranking weights, lethality k, cost curves).
