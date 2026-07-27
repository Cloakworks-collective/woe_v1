# Scalability & Concurrency Roadmap — survive the endgame storm

The plan for taking WoE from "a handful of testers" to **1,000–1,500 players,
5-person attack pile-ons, and a clock-flipping endgame** without corruption —
grounded in what we have: two write models (§14.1 serverless CAS on a single
`world_docs` JSONB blob; §14.2 single-writer world service, built but not
deployed), a wall-clock-derived tick (`runDueTicks` — self-healing by design),
ms-accurate §14.3 hold clocks, and the §14.4/14.5 spectator-snapshot read edge.

**Guiding decision: the single-writer world service (§14.2) is the production
architecture.** One process owns the world; every mutation serializes through
its queue — races are gone *by construction*, the classic MUD model. §14.1's
compare-and-swap stays as the zero-infra fallback, so its bugs still matter,
but we harden it rather than scale it. (Audit 2026-07-27; full findings in
the session notes below each item.)

Ratings: ⭐ impact · 🔨 effort · 🔥 = a real bug found in the audit, not a
hardening nicety.

---

## A. Correctness under fire — the attack storm (4–5 attackers, one victim)

- [ ] **A1. 🔥 Fix the CAS version race in `saveWorld`** ⭐⭐⭐⭐ 🔨low —
      `lib/server/store.ts:226` reads `expected = g.__woeWorldVersion` at
      **save** time from a shared global, not at **load** time. Two concurrent
      requests in one warm instance share the cached world object; if request
      A conflicts, force-reloads and commits, request B then saves its *stale*
      object against the *new* version — the guard passes and silently erases
      another instance's committed battle (resurrected casualties). Fix:
      capture `version` alongside the world at load and thread it into the
      save; plus a per-instance async mutex around `commitWithRetry` so one
      instance never runs two commits concurrently. (More likely under Vercel
      Fluid Compute, where one instance serves concurrent requests.)
- [ ] **A2. Backoff + jitter in `commitWithRetry`** ⭐⭐⭐ 🔨low —
      `lib/server/world.ts:300` retries instantly with `maxAttempts = 5`: a
      thundering herd. Five attackers + the cron can exhaust someone's retries
      → a user-facing error at the most dramatic moment. Exponential backoff
      (50ms·2ⁿ ± jitter), attempts 5 → 8.
- [ ] **A3. Deploy the §14.2 world service** ⭐⭐⭐⭐⭐ 🔨med(deploy-only) —
      the code is done and verified (`worldService/main.ts`, Fly.io Dockerfile
      + fly.toml ready). Set `WORLD_SERVICE_URL`/`SECRET` on Vercel, run the
      service on Fly with auto-restart + `/health` checks. This single move
      resolves the storm, the 1500-player write path, and endgame clock
      integrity at once. **Do this before real load; non-negotiable before an
      endgame.**

## B. The blob diet — the world doc carries live state ONLY

*Audited breakdown at ~1,500 players: **70–80% of the blob is write-once log
data the engine never reads.** Live state (`meta` + `players` + `clans` +
`orders` + `eraRecords`) is ~3–6MB; the freight is `inbox` (~10–16MB — O(players)
× 60 items), `battles` (300 reports, fattest field = the pre-rendered prose in
`BattleReport.log`), `messages`, `chronicle`, and the unbounded
`chronicleArchive`. Guiding rule: **be miserly — the blob stores numbers, the
UI embellishes.** Prose is always derivable; bytes in the write path are not
free. (Revenge windows read `player.recentAttackers`, not `battles` — so every
log listed here is purely presentational and safe to evict.)*

- [ ] **B4. Phase 0 — tighten every cap (ship today)** ⭐⭐ 🔨low — one-line
      changes: inbox 60→25 (`store.ts:290`), battles 300→100 (`store.ts:294`),
      messages 2000→500 (`pipeline.ts:557`), chronicle 250→150
      (`store.ts:301`). ~3–4× off the log weight while the real fix lands.
- [ ] **B5. No prose in storage — structured events, rendered at the UI**
      ⭐⭐⭐⭐ 🔨med — the engine currently *generates and stores English*:
      `BattleReport.log: string[]` (full sentences, `combat.ts:364-563`),
      spy/scout `detail` strings (`espionageOps.ts`), `clanEvent`/`info`
      `detail` prose, chronicle lines with emoji. Replace with **codes +
      params** (`{ev:"escalade",pct:62}`, `{ev:"counterFire",killed:3}`,
      `{ev:"warDeclared",byClanId,onClanId}`) and render the flavor text
      client-side from `descriptions.ts` templates. Cuts per-report and
      per-event bytes ~5–10×, AND makes the text re-skinnable/localizable for
      free. Engine emits numbers; the UI does the storytelling.
- [ ] **B6. Evict the logs from the blob entirely** ⭐⭐⭐⭐ 🔨med — all five
      logs are append-only and never mutated: perfect INSERT-only rows, and
      `0001_init.sql` **already has the tables** (`battle_reports`, `events`,
      `messages`). Order by coupling: ① `battles` + `chronicleArchive` →
      tables (one-two read sites each; blob keeps at most ~20 battle *stubs* —
      id, names, victor, tick — for list views); ② `inbox` → `events` read
      per-player; ③ `messages` → its table. **Replay-safety caveat:** never
      INSERT from inside `apply` (a CAS conflict replays the command and would
      double-insert) — buffer events during apply, flush **after the winning
      commit** (§14.2: after the queued command returns). End state: blob =
      live state only, ~3–6MB even at 1,500 players, and log writes become
      cheap indexed INSERTs instead of "rewrite the world."
- [ ] **B7. Keep-list discipline** ⭐⭐ 🔨low — write the invariant into
      spec/architecture.md and enforce in review: the world doc may contain
      **only state the engine reads to resolve rules**. Keep: `meta`, `players`
      (the doc is already lean — functional numbers), `clans`, `orders`
      (live market), `eraRecords` (small, read-modify-write per battle).
      Evict/never add: anything display-only, anything append-only, anything
      derivable, any pre-rendered string. `priceHistory` (~30KB) tolerated
      until B6 ③, then → hourly INSERTs.
- [ ] **B8. Shaped reads instead of whole-world fetches** ⭐⭐⭐⭐ 🔨med —
      §14.2's `GET /world` serializes the **entire world on the command queue
      per read** (`worldService/main.ts:155`) and every Next.js instance
      re-fetches it on a 2s TTL; in §14.1 every warm instance re-downloads the
      blob every 10s (`CACHE_TTL_MS`). Add per-need endpoints (`/player/:id`,
      `/rankings`, `/clan/:id`) or serve page reads from the spectator-snapshot
      pattern. (The blob diet shrinks the payload; this shrinks the *frequency*
      × *scope*.)
- [ ] **B9. Snapshot off the hot loop** ⭐⭐ 🔨low-med — `writeSnapshot`
      stringifies the whole world *on the queue* every 2s when dirty
      (`main.ts:73-79`). At scale: raise `WORLD_SNAPSHOT_MS`, or move the
      stringify+write to a worker thread so commands never wait on disk.
      (Mostly mooted by the B4–B6 diet: a 3MB blob stringifies in ~15ms.)
- [ ] **B10. Memoize ladder scores per tick** ⭐ 🔨low — `updateCrown` runs on
      **every command** and sweeps `rankingScore` over all players plus
      O(clans × members) `clanScore` reduces (`world.ts:492,537`). Fine at
      today's size, a few ms/command at 1,500 players — cache scores keyed by
      (playerId, tickNumber) if profiles show it.

## C. Endgame clock integrity (5–6 clans, 10–12 contenders)

- [ ] **C8. Run the endgame on the world service** ⭐⭐⭐⭐ 🔨— (= A3) —
      the §14.3 clock design is *correct*: event-driven ms accrual, credited
      on every command and tick; catch-up ticks credited at their scheduled
      wall-clock times so clocks stay monotonic through downtime; winner
      detection at the next event credits exact elapsed ms (announcement ≤10
      min late, credit precise). Its only real threats are inherited from
      §14.1: the A1 lost-update bug can erase a crown-flipping battle, and A2
      retry exhaustion drops attacks mid-race. Serialize the writer and the
      clocks are exact by construction. (Cross-instance NTP skew <100ms —
      negligible against multi-hour thresholds.)
- [ ] **C9. Endgame smoke test** ⭐⭐ 🔨med — a sim test that hammers the
      service with N concurrent attackers flipping #1 while ticks run, then
      asserts: no lost battles, `overlordClocksMs` totals equal wall time,
      exactly one winner. Extends `lib/server/concurrency.test.ts`.

## D. Cron resilience — when the tick doesn't fire

*Already-good bones: ticks derive from wall clock (`lastTickAt`), every player
command also runs `runDueTicks` first (`pipeline.ts:120`), and commits are
atomic — a missed cron loses nothing, it's only delayed. Clocks accrue
correctly through outages. The gaps:*

- [ ] **D10. 🔥 Defuse the permanent-stall trap** ⭐⭐⭐⭐ 🔨low — catch-up
      is capped at 2016 ticks *in one request* (`world.ts:407`). After long
      downtime at 1,500 players, 2016 × O(players) + a multi-MB blob save can
      exceed the function timeout → the CAS never commits → **every later
      cron times out identically and the world freezes forever**. Cap
      per-invocation catch-up at ~144 ticks (1 day) so each run commits
      incremental progress and successive runs converge; pair with an explicit
      `export const maxDuration` on `app/api/tick/route.ts`.
- [ ] **D11. Tick observability** ⭐⭐⭐ 🔨low — nothing records whether
      ticks run. Add: a `tick_runs` table (started_at, duration,
      ticks_processed, tick_after, error) written from the tick route; a
      public `/api/health` returning `now − lastTickAt`; an external dead-man
      monitor (healthchecks.io / UptimeRobot) pinged on success, alerting when
      lag > 30 min. Vercel cron has logs but **no failure alerting**.
- [ ] **D12. Document the 2-week horizon** ⭐ 🔨low — >2016 ticks of downtime
      are silently dropped (by design). Write it down as policy in
      spec/architecture.md so a future resurrection isn't a surprise.
- [ ] **D13. Fly watchdog for the service** ⭐⭐ 🔨low — in §14.2 mode the
      service ticks itself (`main.ts:186`); if the machine dies, no ticks
      until restart. Fly auto-restart + health checks on `/health`, and the
      same D11 lag alert covers both modes. (Snapshot+log crash recovery is
      solid; the RNG-replay-of-the-last-2s caveat is acknowledged and rare.)
- [ ] **D14. Per-player tick cursor — the sharded, run-twice-safe tick**
      ⭐⭐⭐ 🔨med-high — *note first: the cron is **already idempotent at the
      world level** — ticks are numbered, derived from wall clock
      (`lastTickAt`), and committed atomically under CAS, so a double-fired
      cron sees zero due ticks and a conflicting one no-ops. This item shards
      that same property per player for the normalized-schema future.* Design:
      ① a tiny **advancer** derives global `tick_number` from wall clock
      (idempotent, monotonic — `world_meta` in 0001); ② each player doc gains
      `processedTick`; a worker pass selects players `WHERE processedTick <
      tick_number`, loops the missing ticks through `processTurnTick` (already
      a **pure per-player function** — engine unchanged), and writes once
      under the player row's own version CAS. Run it twice, run it for one
      guy, run overlapping workers — harmless: the cursor makes reruns no-ops
      and the row CAS settles races. Chunkable (`LIMIT 200` per invocation),
      which **kills the D10 stall trap structurally** — every invocation
      commits progress, catch-up converges across runs. ③ cross-entity passes
      keyed by their own cursors: crown/clocks (`lastCrownTick` in meta),
      hourly market sample, and the one wrinkle — **war tribute** (a player's
      tick siphons into the victor clan's storage): record siphons as player-
      pass output rows and let a per-clan pass with its own cursor sum them,
      so no pass ever writes another shard's row. Daily reset needs nothing:
      it's `tick % TURNS_PER_DAY` inside the same per-player loop.

## E. Platform sizing — Supabase & Vercel

- [ ] **E14. Supabase: Pro plan, Micro compute** ⭐⭐⭐ 🔨config — storage is
      a non-issue (<2GB at 1,500 players; the blob TOASTs to ~2–5MB). The real
      constraints are **churn** (every §14.1 save rewrites the whole row →
      WAL + dead-tuple pressure) and **egress** (each warm instance
      re-downloads the blob every 10s → GBs/hour under load; free tier's 5GB/mo
      dies in hours). Free tier's inactivity pausing is disqualifying for a
      game anyway. Pro ($25/mo, 250GB egress) + B4/B6 so the blob stops being
      the read path.
- [ ] **E15. 🔥 Vercel: verify Pro for the cron** ⭐⭐⭐⭐ 🔨config —
      `vercel.json` schedules `*/10 * * * *`, but **Hobby crons run ~once per
      day with loose timing** — the schedule silently doesn't fire as written.
      Player commands mask it (they tick the world), but an idle world freezes
      between visits. Confirm the deployment is on Pro. Also: crons fire only
      on the production deployment; `CRON_SECRET` is already enforced ✅; Vercel
      does not retry failed crons and doesn't guarantee non-overlap — both are
      safe here (idempotent catch-up + CAS), no action needed.
- [ ] **E16. Cron-as-watchdog once the service is live** ⭐ 🔨low — in §14.2
      mode `/api/tick` is already a status no-op (`route.ts:19-22`); make it
      *report tick lag* rather than bare `ok`, so the D11 monitor gets a
      meaningful signal through the same URL in both modes.

---

## G. The 10,000-player MEGA-WORLD — deliberately deferred

*Nothing here is needed at 1,000–1,500 players; sections A–E carry us there.
This section exists so we scale **on purpose** later, not in a panic.*

**Commitment: everyone in ONE world — one economy, one ladder, one crown.**
No realm sharding. The capacity math says this is achievable with the
architecture we already have, **if** we make the single writer *boring*:

| At 10,000 players | Number | Verdict |
|---|---|---|
| Live state in RAM (dieted, B4–B7) | ~30–40MB | trivial for one Node process |
| Peak command rate (~5–10% online) | ~50–100 cmd/s | sub-ms each **after G2** → <5% of one core |
| One tick | 10k × `processTurnTick` | ~0.5–2s if monolithic → must chunk (G3) |
| Whole-world JSON (stringify/snapshot/boot) | 30–40MB, ~200–400ms | **dead** — per-entity persistence (G1) |
| Read fan-out (ladder, pages, polling) | 1000s of req/min | **never touches the writer** (G4) |

The mega-world plan is NOT distributed systems — it's four disciplines:
**zero reads on the writer · O(log n) commands · per-entity writes · provable
failover.** The classic precedent holds: Utopia ran 80k players on one ticked
world; one serialized process goes much further than intuition says.

- [ ] **G1. Per-entity persistence — retire "the world as one JSON value"**
      ⭐⭐⭐⭐⭐ 🔨high — the writer keeps the world in memory but persists
      **dirty rows, not snapshots**: after each command/tick-chunk, write only
      the touched players/clans/orders to the normalized `0001_init.sql`
      tables (each row versioned), plus the append-only command log for the
      gap. Boot = load all rows (10k small rows — seconds) + replay the log
      tail. Kills the 30MB stringify, the monolithic snapshot, and the
      slow-boot problem in one move. The blob (`world_docs`) retires; the
      B4–B7 diet decided *what* lives in these rows.
- [ ] **G2. Incremental ladder & crown index** ⭐⭐⭐⭐ 🔨med —
      `updateCrown` sweeps all players per command (`world.ts:492`); at 10k
      that's 10k `rankingScore` calls × 100 cmd/s = the writer's actual
      ceiling. Maintain a sorted score index updated only for the entities a
      command touched (O(log n)); clan scores via dirty-clan recompute. The
      §14.3 event-driven ms clocks sit unchanged on top — same semantics,
      the top-of-ladder lookup just becomes O(1).
- [ ] **G3. Chunked cooperative tick** ⭐⭐⭐⭐ 🔨med — one monolithic
      10k-player tick would block the command queue for seconds. Slice each
      tick into ~500-player chunks queued *between* commands (commands never
      wait more than one chunk ≈ tens of ms). Give each player a
      `processedTick` cursor (the D14 design, running *inside* the writer):
      chunks are idempotent and resumable — a crash mid-tick just re-runs the
      unfinished chunk. Global sub-passes (crown, tribute settlement, hourly
      market sample) run as their own cursor-keyed chunks after the player
      chunks. Era daily reset is `tick % TURNS_PER_DAY` inside the same loop.
- [ ] **G4. Reads NEVER touch the writer** ⭐⭐⭐⭐⭐ 🔨med — the writer
      answers commands only. All page reads come from the store G1 writes:
      shaped queries on the normalized rows (B8 endpoints), spectator
      snapshots for the ladder/crown, static/ISR + CDN for public pages
      (records, elder ages, spectate). Live updates push instead of poll:
      Supabase Realtime on the `events` table (inbox tidings, battle results)
      or SSE fanned out from a read-side process. The 2s whole-world TTL
      fetch (`worldClient.ts:31`) is deleted, not tuned.
- [ ] **G5. Chat & social fully off-world** ⭐⭐⭐ 🔨low-med — at 10k, era
      chat is a firehose that has nothing to do with game rules: `chat`
      commands stop flowing through the writer entirely — messages INSERT
      straight to the `messages` table (RLS already written in 0001) and fan
      out via Realtime. Same for DMs. The writer's queue is for gameplay only.
- [ ] **G6. HA & deploys for the one writer** ⭐⭐⭐⭐ 🔨med-high — one
      world = one process = a real SPOF. Two tiers, pick by uptime appetite:
      ① *restart SLO*: G1 makes cold boot fast (rows + log tail) — Fly
      auto-restart gives ~30–60s of downtime, ticks self-heal (section D),
      acceptable for a browser game; ② *warm standby*: a second process
      tailing the command log, promoted by health-check failover — near-zero
      downtime, meaningful complexity. Either way: graceful drain on deploy
      (stop accepting, flush dirty rows, hand off), and the D11 lag alert
      watches the writer itself.
- [ ] **G7. Rate limits & backpressure** ⭐⭐⭐ 🔨low-med — per-player
      command budget (the CLI/API tokens invite scripting), queue-depth
      metrics with 429 + client retry-after when saturated, per-IP limits on
      public endpoints. At 10k, one runaway script must not be able to starve
      the queue. Build this EARLY — it's cheap and protects every stage
      before 10k too.
- [ ] **G8. Postgres at 10k** ⭐⭐ 🔨config-med — Supavisor/pgbouncer
      pooling (the serverless fleet exhausts direct connections long before
      CPU); Supabase compute Medium; partition `events`/`battle_reports`/
      `messages` by era and prune per retention policy; era archive writes
      (10k-player sealed tables) move to a background job at reset, not
      inline. Append-only INSERTs (B6/G1) scale gracefully — this is mostly
      sizing, not redesign.
- [ ] **G9. Load-test harness — the gate for all of the above** ⭐⭐⭐⭐
      🔨med — a synthetic-player driver (the CLI + api tokens already exist)
      replaying realistic mixes at 10k scale: tick storms, 5-on-1 attack
      piles, market rushes, endgame clock flips with 10–12 contenders.
      Asserts invariants: no lost battles, `overlordClocksMs` totals = wall
      time, exactly one winner, p95 command latency < 200ms, tick chunks
      complete inside the 10-min window. No G-item ships without passing it.
- [ ] **G10. Escape hatch, documented** ⭐ 🔨low — if the writer ever
      saturates despite G2/G3 (signal: sustained queue depth at >70% of one
      core), the next move is splitting the writer *by domain* (combat+crown
      core; market/economy; tick workers), NOT sharding players — the global
      ladder/crown is the one thing that must stay serialized. Write the
      trigger metric down now so future-us doesn't improvise under load.

---

## Recommended build order

1. **The tiny hardening batch (ship this week):** A1 CAS fix · A2 backoff ·
   D10 catch-up cap + `maxDuration` · B4 cap tightening · E15 plan check.
   Small, self-contained, de-risks the *current* deployment.
2. **D11 — observability.** Know when ticks stop before players tell you.
3. **A3/C8/D13 — deploy the world service on Fly.** The architectural fix;
   everything in section A/C collapses into "done" once traffic runs through
   the single writer. Do this before open sign-ups.
4. **B5 + B6 — the blob diet.** Structured events (no stored prose), then
   evict battles/inbox/messages/archive to their INSERT-only tables. The blob
   settles at live-state-only (~3–6MB @ 1,500 players) and mostly moots B9.
5. **B8 + E14 — read scaling + Supabase Pro.** Needed as real player counts
   climb toward three digits of concurrents / before the first big era seals.
6. **D14 — per-player tick cursor** when the normalized schema takes over:
   the sharded, run-twice-safe tick that removes the last O(players)
   single-commit.
7. **C9, B7, B10, D12, E16** as garnish between the big rocks.
8. **Section G — the mega-world, only when growth demands it.** Start at
   ~3–5k real players, in dependency order: G1 per-entity persistence →
   G2 ladder index + G3 chunked tick (the writer's two ceilings) → G4/G5
   read & chat offload → G6 HA. Pull **G7 (rate limits)** and **G9 (load
   harness)** much earlier — they're cheap insurance and the validation
   gate for everything else. G10's trigger metric gets written down now.

Non-negotiables throughout: the world stays **server-authoritative with one
logical writer** — every new feature mutates state only through
`applyOneCommand` (never a side-channel `saveWorld`); `apply` functions stay
**replay-safe** (derive everything from the world they're handed); and the
tick remains a **pure function of wall-clock time**, so any missed schedule
heals itself on the next command or cron.
