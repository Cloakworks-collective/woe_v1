# The World Service — single writer (todo.md §14.2)

> The real fix for scale & concurrency. One always-on process owns the whole
> world in memory and serializes **every** mutation through an in-order queue —
> the classic MUD / persistent-browser-game model. Because all writes flow
> through one process one-at-a-time, the races the serverless blob suffered
> (last-write-wins, resurrected casualties, reverted battles) are gone by
> construction. A single Node process serializing in-memory commands handles
> thousands/sec; hundreds of players is nowhere near the limit.

## How it fits together

```
        Browsers / CLI / agents
                 │  (cmd:* + reads)
                 ▼
        Next.js on Vercel  ──────────►  World Service  ──►  volume
        (thin forwarder)   POST /command   (single writer,   (snapshot.json
                           GET  /world      world in RAM,      + commands.jsonl)
                                            self-ticks)
```

- **Writes** — Next.js `runCommand()` forwards to `POST /command`. The service
  applies it with the **same** `applyOneCommand` the in-process path uses,
  serialized by its queue, and returns the `CommandResult`.
- **Reads** — Next.js `getWorld()` fetches `GET /world` (a consistent snapshot,
  read through the queue). Pages, `/api/state`, rankings, etc. all read this.
- **The 10-minute tick** runs *inside* the service (`runDueTicks` on a timer);
  the Vercel cron becomes a no-op status ping and can be removed.
- **Nothing touches Supabase/the file store** while the service is active —
  `saveWorld()` refuses to run (loud, not silent) so any unconverted path is
  caught. (Admin write ops are the one known unconverted path — see Caveats.)

The engine and the whole command set are unchanged: the service is a different
*host* for the same `lib/`.

## Persistence

Off the request path, as §14.2 prescribes:

- **Snapshot** (`snapshot.json`, `{ seq, world }`) written every
  `WORLD_SNAPSHOT_MS` (default 2s) when dirty, and once on graceful shutdown.
- **Command log** (`commands.jsonl`) — every applied command appended; truncated
  after each snapshot (it only ever covers the sub-snapshot gap).
- **Boot** loads the snapshot, then replays any log entries newer than it.

> **RNG caveat:** replayed commands re-roll (an attack resolved with `Math.random`
> resolves fresh on replay). Because snapshots are frequent and a graceful stop
> snapshots cleanly, replay only matters after a *hard crash*, and only for the
> last ~2s of battles. A future refinement is to log the per-command RNG seed
> for bit-exact replay.

## Run locally

```bash
# 1. Start the service (fresh data dir under ./data/world-service):
WORLD_SERVICE_SECRET=dev-secret pnpm world-service

# 2. Point the Next.js app at it (in .env.local, then `pnpm dev`):
WORLD_SERVICE_URL=http://localhost:4000
WORLD_SERVICE_SECRET=dev-secret
```

With `WORLD_SERVICE_URL` unset, the app ignores all of this and uses the
in-process store (§14.1 CAS) exactly as before.

## Environment

| Var | Where | Default | Meaning |
|-----|-------|---------|---------|
| `PORT` / `WORLD_SERVICE_PORT` | service | `4000` | listen port |
| `WORLD_SERVICE_SECRET` | service **and** app | — | shared secret; the app sends it as `x-woe-secret`, the service enforces it (except `/health`) |
| `WORLD_SERVICE_DATA_DIR` | service | `./data/world-service` | snapshot + log directory (a volume in prod) |
| `WORLD_SNAPSHOT_MS` | service | `2000` | snapshot cadence when dirty |
| `WORLD_TICK_CHECK_MS` | service | `15000` | how often due 10-min ticks are applied |
| `WORLD_SERVICE_URL` | **app only** | — | base URL of the service; **set on Vercel to switch the app into forwarding mode**. Never set this in the service's own env. |

## Deploy (Fly.io)

```bash
fly apps create woe-world-service
fly volumes create woe_data --size 1 --region iad
fly secrets set WORLD_SERVICE_SECRET=$(openssl rand -hex 24)
fly deploy -c worldService/fly.toml       # uses worldService/Dockerfile
```

Then on **Vercel** (Project → Settings → Environment Variables):

```
WORLD_SERVICE_URL    = https://woe-world-service.fly.dev
WORLD_SERVICE_SECRET = <the same secret>
```

Redeploy the Vercel app. It now forwards every command to the service and reads
the world from it.

> **Run exactly one instance.** This is a single writer — `min = max = 1`, no
> autoscaling. Two instances would defeat the entire purpose. (`fly.toml` is set
> up this way.) The same rule holds on Railway/Render: one always-on instance
> with a persistent disk mounted at `WORLD_SERVICE_DATA_DIR`.

## Deploy (generic Docker — Railway / Render / a VM)

```bash
docker build -f worldService/Dockerfile -t woe-world-service .
docker run -d --name woe-world -p 4000:4000 \
  -v woe_data:/data \
  -e WORLD_SERVICE_SECRET=change-me \
  -e WORLD_SERVICE_DATA_DIR=/data \
  woe-world-service
```

Mount a persistent volume at `/data`; expose port 4000; set the two app env vars
above to the service's public URL + secret.

## Caveats / follow-ups

- **Admin write ops** (`/admin`) still write via `saveWorld` and are therefore
  disabled under service mode (they throw a clear error rather than silently
  writing to the ignored store). Wire each admin mutation through a command to
  run them under §14.2 — a small, mechanical follow-up.
- **RNG-faithful replay** (log the per-command seed) — see the caveat above.
- **§14.4 / §14.5** (durable read-heavy tables, live spectator reads) build on
  this: battle logs / ranking snapshots move to Postgres, spectators read those.
