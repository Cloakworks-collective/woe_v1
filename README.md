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

✦ = needs the Royal Charter (premium — [spec/premium.md](spec/premium.md)).

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

### Scaling plan (todo.md §14)

The one-document model has a known ceiling: concurrent writers. Two
serverless instances saving the blob are last-write-wins — a stale save
could silently revert a battle. The plan, in order:

1. **Compare-and-swap** on the world save (version guard + retry) — turns
   silent clobbering into detected retries. Insurance, not scale.
2. **A single-writer world service** — the classic game-server model: one
   always-on process owns the world in memory and serializes every command
   through an in-process queue; Next.js routes forward to it over HTTP and
   return the result in the same response. The engine doesn't change at all.
   Persistence moves off the request path: periodic snapshots + an
   append-only command log for replay. One Node process serializing pure
   in-memory commands handles thousands per second — hundreds of players is
   nowhere near its limit.
3. **Normalized tables for the durable edges** — battle logs, per-tick
   ranking snapshots, messages decompose into the already-written relational
   schema (`supabase/migrations/0001_init.sql`, applied but dormant) for
   cheap public reads. The *live* world stays in the writer's memory.

**Deliberately no broker.** RabbitMQ/Redis pub-sub would transport commands
to… the same single consumer, while turning request/response (a player needs
their battle report back *in the same HTTP response*) into correlation IDs
and reply queues. The "queue" a single writer needs is an array and a
promise chain; durable replay is the command log's job, which is storage,
not delivery. HTTP into one process is the simple version *and* the correct
one.

## Design specs (`spec/`)

| Doc | Covers |
|-----|--------|
| [overview.md](spec/overview.md) | Concept, races, core loop, attack modes, winning |
| [architecture.md](spec/architecture.md) | Server/client architecture, data model, protocol, engineering decisions |
| [buildings.md](spec/buildings.md) | Buildings, population model, costs, siege ladder |
| [economy.md](spec/economy.md) | Taxes, production, food, mercenary upkeep |
| [research.md](spec/research.md) | The Collegium: 10 fields × 5 levels |
| [market.md](spec/market.md) | The anonymous Grand Bazaar |
| [combat.md](spec/combat.md) | Battle resolution, scattering, experience |
| [espionage.md](spec/espionage.md) | Spy ops and scout counter-espionage |
| [clans.md](spec/clans.md) | Leadership, clan buildings, wars, truces |
| [victory.md](spec/victory.md) | Eras, Grand Overlord, clan victory, ranking |
| [premium.md](spec/premium.md) | The Royal Charter (Stripe) and the Steward |

Working on this repo with Claude Code? Run `/prime` to load full context.
All game numbers are tunable placeholders unless marked otherwise; the spec
docs are the source of truth and cross-reference each other by filename.
