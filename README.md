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
