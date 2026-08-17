# War of Empires (WoE)

A persistent, turn-based multiplayer strategy game. Empires run in real time
(10-minute turns) and persist offline: recruit peasants, tax them, build a
medieval economy, research, trade on an anonymous bazaar, and wage war —
raids, sieges, revenge, and bombardment — until someone holds the #1 spot
long enough to end the era and have the next one named after them.

**Status:** playable vertical slice — web UI and terminal client against the
same backend. See [progress.md](progress.md) and [todo.md](todo.md).

**Stack:** Next.js on Vercel · Supabase (Postgres, Auth, Realtime) ·
Vercel Cron ticks · pure-TypeScript game engine.

## Play in the browser

```bash
pnpm install
pnpm dev          # → http://localhost:3000 — pick a race, name your empire, play
```

No account, no email. Your **realm token** (Command View → "Rule from the
terminal") re-enters the same empire from any browser — and from the CLI.

## Play in the terminal 🖥⚔

A zero-dependency, full-color CLI client (`cli/woe.mjs`) plays the **same
empire** as the web UI over the same API. With the server running:

```bash
pnpm woe join                 # found an empire from the terminal (interactive)
pnpm woe link woe_abc123…     # …or bind the empire you made in the browser
pnpm woe                      # interactive court:  ⚔ woe ▸
pnpm woe status               # every command also works one-shot
```

The token is stored in `~/.woe/config.json`; point at a remote server with
`WOE_SERVER=https://… pnpm woe status` (or `link <token> <url>`).

| Command | Does |
|---------|------|
| `status` (`s`) | The throne room: resources, army, advisors, chronicle |
| `buildings` (`b`) · `build <id>` · `queue <id>` | Levels & costs · build now · Steward queue ✦ |
| `train <what> <n>` · `equip <type> <tier> <n>` | warriors/spies/scouts/engineers · footman/archer/cavalry × light/medium/heavy |
| `tax <pct>` · `rest` · `bank <n>` | Decrees (negative `bank` withdraws) |
| `research [field]` | Show the Collegium / direct the scholars |
| `rankings` (`r`) | The ladder — your hunting ground |
| `battles [n]` · `profile <who>` | Public War Ledger (last 100) · one empire's record |
| `attack <who> <mode>` | By name or `#rank`; raid/siege/revenge/bombard — colored battle report |
| `spy <who> <op> <n>` · `scout <who>` | Ops: coffers, defences, sabotage, torch, unrest |
| `market` · `buy <res> <n>` · `sell <res> <n> <price>` | The anonymous Grand Bazaar |
| `mercs <n>` · `gear <type> <n>` | Black market · siege works |
| `token` · `link` · `join` · `help` · `quit` | Housekeeping |

✦ = needs the Royal Charter (premium — [spec/clans.md](spec/clans.md)).

## Play inside Claude Code 🤖⚔ (plugin)

The repo doubles as a Claude Code **plugin marketplace**. Install once:

```
/plugin marketplace add <github-user>/woe     # once the repo is on GitHub
claude --plugin-dir ./claude-plugin           # or test locally from the repo
```

Then **`/woe`** turns Claude into your court herald: it founds or links your
empire (same realm token as the web and CLI), renders your court as an ASCII
dashboard, and takes orders in plain language — *"raid Freeholt"*, *"build
the grange"*, *"sell 2000 wood at 0.05"*. Battle reports come with trophy or
skull, as deserved. It plays over the same HTTP API; the server stays
authoritative, so an agent can't cheat — only command.

## Architecture

The whole game is a **pure TypeScript engine** wrapped in a thin server. No
ORM, no per-request SQL, no message broker — by choice, not neglect.

```
Browser UI ─┐                                 lib/engine/*  (pure TS, no I/O)
CLI client ─┼─▶ Next.js routes ─▶ runCommand ─▶ validate → mutate → events
Claude /woe ┘   (server actions,   (lib/server/    │
                 /api/cmd/[name])   pipeline.ts)    ▼
                                            saveWorld (one JSONB doc)
                                    ┌───────────────┴───────────────┐
                                    dev: data/world.json    prod: Supabase
                                    (plain file)            world_docs row
```

**The engine is pure.** Everything that *is* the game — combat resolution,
the 10-minute tick, banking, espionage, market fills, the war-record
leaderboards — lives in `lib/engine/` as side-effect-free functions:
`(state, command) → (newState, events)`. That's why the web UI, the CLI, and
the Claude plugin are all thin: they issue the same commands through the same
pipeline, and why the whole game is unit-testable without a database.

**One pipeline, one choke point.** Every mutation — a browser click, a CLI
order, a cron tick — funnels through `runCommand` in
`lib/server/pipeline.ts`: authenticate → validate → call the engine →
persist → deliver events. There is deliberately no second path.

**The world is one document.** The entire world (players, clans, battles,
market, chronicle) is a single JSON document: a plain file in dev, one
versioned JSONB row (`world_docs`) in Supabase Postgres in prod. Reads load
it (10s in-memory cache), writes save it whole. Postgres is used as a
document store; all computation happens in the engine, in memory. For a
tick-based simulation that touches nearly every player every 10 minutes,
"load once, compute in code, save once" beats thousands of row updates —
and keeps the engine free of storage concerns.

**Derived, never stored.** Rankings are a pure function of current state
(`rankingScore`), computed on read — they can't go stale. The War Records
(richest raids, bloodiest clashes, feuds, wars) are running tallies updated
incrementally as each battle resolves — O(1) per battle, no aggregate
queries over history, ever.

**Time is ticks.** A Vercel cron hits `/api/tick` every 10 minutes; every
page load and command also catches up any due ticks, so the world advances
correctly even if the cron sleeps. Pacing is cost, never timers.

### Scaling (todo.md §14 — built)

The one-document model has a known ceiling: concurrent writers. Two serverless
instances saving the blob are last-write-wins — a stale save could silently
revert a battle. All five parts of the plan are now built:

1. **§14.1 Compare-and-swap** on the world save (version guard + reload/replay/
   retry) — silent clobbering becomes a detected, recovered retry. Insurance,
   not scale. `lib/server/store.ts` + `commitWithRetry`.
2. **§14.2 Single-writer world service** — `worldService/main.ts`: one always-on
   process owns the world in memory and serializes every command through an
   in-process queue; Next.js forwards to it over HTTP (gated by
   `WORLD_SERVICE_URL`) and returns the result in the same response. Engine
   unchanged (same `applyOneCommand`). Persistence off the request path:
   snapshot + append-only command log. See `worldService/README.md`.
3. **§14.3 Event-driven crown clocks** — the victory hold-clocks accrue by exact
   elapsed **milliseconds** whenever the ladder top reorders (every command +
   tick), not sampled once per 10-minute tick, so an endgame crown that flips
   many times inside a tick credits each holder precisely.
4. **§14.4 Durable read edge** — the tick writes a top-N ladder + crown snapshot
   to Postgres (`spectator_snapshots`, `supabase/migrations/0003_*.sql`) off the
   request path. The *live* world stays in the writer's memory.
5. **§14.5 Live spectator reads** — `/spectate` (public) polls `/api/spectate`,
   which reads one indexed snapshot row — every viewer shares it, none recompute
   the ladder.

### Side stores — big or busy data rides outside the world doc

The world doc stays small by keeping only what every page actually reads.
Anything heavy or append-only lives in **prefixed rows of the same
`world_docs` table** — no migrations, no second schema:

- **`battle:<id>`** — a battle's full report (prose log + muster roll,
  kilobytes each). The doc keeps a 300-entry metadata index; only the report
  page pays for the detail. Rows are pruned after 45 days — beyond anything
  the index or the chronicle can still link to.
- **`forum:t:<id>` / `forum:read:<account>`** — the forum's reactions, edit
  stamps, reply links, tags and per-reader progress. The forum's own tables
  are fixed columns; this is where a forum feature lands without DDL.

Both kinds are written outside the single-writer discipline on purpose:
battle docs are immutable once filed, and forum rows are compare-and-swapped
per thread.

### The wire — how a 5MB world costs almost nothing to read

In service mode the world travels Service → Next per read, and three layers
keep that cheap at hundreds of players:

1. **Revision tags (ETag/304).** The world only changes on a command or a
   tick; every snapshot carries its revision, and a reader holding rev N gets
   an empty `304` back. Between changes, reads cost a round trip and zero
   bytes.
2. **gzip** on the transfers that do carry the world — this JSON compresses
   ~10×, so the 5MB book travels as ~500KB.
3. **Command responses carry the fresh world**, so the page render after
   every click is a cache hit — one serialization per state change, total,
   however many instances read.

Measured baseline: 451KB world at 19 players (~5MB projected at 500).
Napkin at 500 players / ~50k page views/day: raw would be ~100GB/day of
transfer; with 304s + gzip it's a few GB. The eventual step beyond this —
per-page **projection endpoints** ("my empire + the ladder", ~30KB) instead
of the whole world — is the one open scale item, needed somewhere past ~150
concurrent actives.

### Where it runs — localhost first, a host later

The service is a plain Node process; **Fly is an address, not a dependency**:

```bash
pnpm world-service                              # terminal 1 · owns the world, :4000
WORLD_SERVICE_URL=http://localhost:4000 pnpm dev  # terminal 2 · the game, forwarding
```

Unset the env var and you're back on the in-process store — one variable,
fully reversible. In production the same process runs on any always-on box
(the repo ships a Dockerfile + fly.toml for Fly). **Durability note:** in
service mode the world's source of truth is the service's disk snapshot —
back up *that* volume; Supabase holds accounts, the forum, battle reports
and the spectator snapshots.

**Supabase sizing** (measured + extrapolated): at 500 players the service
keeps the world off Supabase entirely; what remains is accounts + forum
(tens of MB), battle docs (~360MB/month, pruned at 45 days), snapshots.
**Free tier dies on battle docs; Pro is ample.** Without the service,
direct-to-Supabase mode caps near ~50 truly active players — every command
rewrites the whole doc, and no tier fixes an architecture bill.

**Deliberately no broker.** RabbitMQ/Redis pub-sub would transport commands
to… the same single consumer, while turning request/response (a player needs
their battle report back *in the same HTTP response*) into correlation IDs
and reply queues. The "queue" a single writer needs is an array and a
promise chain; durable replay is the command log's job, which is storage,
not delivery. HTTP into one process is the simple version *and* the correct
one.

## Deployment — what runs where

There are **two supported topologies**. Start with A; move to B only when you
outgrow the single-row write lock (hundreds of concurrent players / endgame
storms). The switch is one env var — no code change.

### A. Serverless only (§14.1) — the default

```
Browsers / CLI / Claude ─▶ Next.js on Vercel ─▶ Supabase Postgres (world_docs blob, CAS)
                                  ▲
                         Vercel Cron every 10m → /api/tick
```

| Component | Runs on | Deploy | Notes |
|-----------|---------|--------|-------|
| **Next.js app** (UI + API + engine) | **Vercel** (or any Node host) | `vercel deploy` | Holds the whole game; writes the world blob with compare-and-swap |
| **Supabase Postgres** | Supabase (managed) | already live | Stores `world_docs` (the world blob) + `spectator_snapshots` |
| **Cron** | Vercel Cron (`vercel.json`, `*/10`) | with the app | Hits `/api/tick`; guarded by `CRON_SECRET` |
| **Dead-man switch** | healthchecks.io (or similar) | one URL | `HEARTBEAT_PING_URL`; alerts when the beat goes **silent** — the one failure the app cannot report on itself |

**To deploy A:** push to Vercel; set env `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
(and optionally `HEARTBEAT_PING_URL`, `STRIPE_*`, `ADMIN_PASSWORD`). Leave
`WORLD_SERVICE_URL` unset.
That's the whole system — nothing else to run.

### B. Single-writer service (§14.2) — for scale

```
Browsers / CLI / Claude ─▶ Next.js on Vercel ──HTTP──▶ World Service (always-on, Fly/Railway)
   (thin forwarder)                                     owns world in RAM, self-ticks
                                                          │  snapshot + command log → volume
                                                          └  spectator snapshots → Supabase
```

| Component | Runs on | Deploy | Notes |
|-----------|---------|--------|-------|
| **Next.js app** (forwarder) | **Vercel** | `vercel deploy` + set `WORLD_SERVICE_URL` | Now forwards every command to the service; reads the world from it |
| **World Service** | **Fly.io / Railway / Render / a VM** — one always-on instance | `fly deploy -c worldService/fly.toml` (Dockerfile + fly.toml provided) | The single writer. **Run exactly one instance.** Needs a persistent volume for snapshots |
| **Supabase Postgres** | Supabase (managed) | already live | Only `spectator_snapshots` here (the service owns the live world in RAM) |

**To move A → B:** deploy the world service (see `worldService/README.md`), then
on Vercel set `WORLD_SERVICE_URL=https://<service-url>` and
`WORLD_SERVICE_SECRET=<shared secret>` (the same the service runs with) and
redeploy. The Vercel cron becomes a harmless no-op (the service self-ticks) and
can be removed. Supabase can no longer be the source of truth for the live world
— it holds only the spectator snapshots.

### What needs deploying (checklist)

- [ ] **Supabase migration `0003_spectator_snapshots.sql`** — apply it (e.g.
      `supabase db push`, or paste it in the SQL editor) so §14.5 spectating
      goes live. Until then `/spectate` shows "no snapshot yet" (harmless).
      Migrations `0001` (dormant normalized schema) and `0002` (`world_docs`) are
      already applied.
- [ ] **Vercel** — deploy the app + env (topology A works immediately).
- [ ] **World service (only for topology B)** — deploy to Fly/Railway (one
      instance + volume) and set `WORLD_SERVICE_URL`/`WORLD_SERVICE_SECRET` on
      Vercel. Optional until you need the scale.
- [ ] **Admin under §14.2** — the `/admin` write ops still go through the old
      store path and are disabled when `WORLD_SERVICE_URL` is set (they throw a
      clear error). Wire them through commands before relying on admin in
      topology B. (Everything a *player* does already works in both topologies.)

Local dev needs none of this: with no Supabase env it uses `data/world.json`;
`pnpm dev` + `pnpm world-service` (optional) exercise both topologies on your
machine.

## Design specs (`spec/`)

| Doc | Covers |
|-----|--------|
| [overview.md](spec/overview.md) | Concept, races, core loop, attack modes, winning |
| [architecture.md](spec/architecture.md) | Server/client architecture, data model, protocol, engineering decisions |
| [empire.md](spec/empire.md) | Buildings, population model, costs, siege ladder |
| [empire.md](spec/empire.md) | Taxes, production, food, mercenary upkeep |
| [empire.md](spec/empire.md) | The Collegium: 10 fields × 5 levels |
| [empire.md](spec/empire.md) | The anonymous Grand Bazaar |
| [combat.md](spec/combat.md) | Battle resolution, scattering, experience |
| [espionage.md](spec/espionage.md) | Spy ops and scout counter-espionage |
| [clans.md](spec/clans.md) | Leadership, clan buildings, wars, truces |
| [overview.md](spec/overview.md) | Eras, Grand Overlord, clan victory, ranking |
| [clans.md](spec/clans.md) | The Royal Charter (Stripe) and the Steward |

Working on this repo with Claude Code? Run `/prime` to load full context.
All game numbers are tunable placeholders unless marked otherwise; the spec
docs are the source of truth and cross-reference each other by filename.
