# Todo

Only work we actually intend to do.

Everything cut from this file is recoverable — nothing was lost:

    git show a2b8f6b:todo.md                    # 105 completed items
    git show a2b8f6b:spec/scalability_todo.md   # the 10k-player analysis
    git show a2b8f6b:spec/animation_todo.md     # the full art roadmap

A todo list that carries its own changelog stops being a list and becomes an
archive nobody reads. And the deep scale analysis — good thinking, for a problem
we do not have — made ten hypothetical tasks look like a queue.

---

## Blocking launch

- [ ] **USER: Vercel account + env** — set the three Supabase vars, `CRON_SECRET`,
      and confirm the plan. **Sub-daily cron needs a plan above Hobby**; on Hobby
      `*/10 * * * *` is silently coerced to daily. Nothing breaks (the two-week
      catch-up cap absorbs it), but the backlog stops being bounded tightly.
- [ ] **USER: Stripe test keys** — `STRIPE_SECRET_KEY` + webhook secret, for the
      Royal Charter.
- [ ] Deploy. Persistence is serverless-safe; nothing else blocks it.

## Real bugs / correctness

Nothing open. The three that were here are fixed and pinned by tests in
`lib/server/concurrency.test.ts` (228 pass) — kept below because the reasoning is
worth more than the diff:

- **Double-applied commands under in-process contention.** The cross-process CAS
  was always fine (`store.ts` uses one guarded `UPDATE … WHERE version = ?`).
  The bug was inside a single process: `getWorld` handed out the *shared cached
  object* and `saveWorld` read the expected version from a module global at save
  time rather than capturing it at load. Under Fluid Compute two concurrent
  commands share one instance, so B mutated the very object A was mid-save with;
  A's write landed carrying B's changes, B lost the CAS, reloaded a world that
  already contained its own effects, and applied its command **twice**.
  Fixed by tagging each world with the version it was loaded at (`worldVersion`,
  a WeakMap — not a global) and giving `apply` a private `cloneWorld` draft.
  The regression test saves `[1, 2]` without the clone and `[1, 1]` with it.
- **No backoff in `commitWithRetry`** — every loser woke at the same instant and
  re-collided. Now full-jitter exponential backoff (`retryDelayMs`), under 400ms
  across all five attempts. `/api/state` also asks `ticksDue()` first, so the
  common poll that owes nothing never takes the write path at all.
- **Nothing watched the heartbeat.** `/api/tick` now checks in to
  `HEARTBEAT_PING_URL` on every healthy beat and hits `<url>/fail` when a run
  threw or the clock is still behind. Needs the check created — see below.

## Blocked on the user

- [ ] Create the healthchecks.io check (10m period, ~25m grace) and set
      `HEARTBEAT_PING_URL`. Without it the ping is a no-op and a heartbeat that
      dies at 3am still dies quietly — including the Hobby-plan case, where a
      10-minute schedule is silently coerced to daily and every log line we emit
      still looks healthy.

## When there are enough players to need it

Not now. The trigger is real load, not a calendar. Each of these is cheap to do
when it matters and pure speculation before then:

- [ ] Evict the append-only logs (battles, chat, chronicle) from the world blob.
      Every save currently rewrites everything — write amplification is the quiet
      killer as player count grows.
- [ ] Shaped reads instead of whole-world fetches on hot paths.
- [ ] Deploy the single-writer world service (§14.2). The code exists and is
      exercised; this is a deploy decision, not a build.
- [ ] Per-entity persistence, incremental ladder index, chunked tick. Only if the
      three above stop being enough.

## Watch: the fence is an unthrottled gold faucet

The Black Market's sell side has **no volume limit**, while the Bazaar is
throttled three ways (merchant count, 1,000×level caravan capacity, 100-turn
road). A big producer can therefore convert unlimited bulk into gold instantly,
bypassing the caravan system entirely — the only brake is the price.

That is the design as specified, and the 2–19× haircut is a real cost. But the
arithmetic is worth watching: ~1,500 food/turn dumped at 1 gold is ~1,500
gold/turn, against roughly 200 from taxes at the same size. If gold stops feeling
scarce, the levers in order of bluntness are: lower `BLACK_MARKET.SELL_PRICE`,
cap units sold per day, or gate the sell side behind a Market Square level.
Needs real play before touching — noted here so nobody re-derives it.

## Combat rework — TUNING BACKLOG (engine done, numbers provisional)

> **Decided: parameter tuning is deferred.** The engine, UI, docs and sims are
> finished and correct; what remains below is choosing numbers, which wants real
> play rather than more arithmetic. Nothing here blocks shipping an age.

The siege/espionage/ranking rework shipped complete and tested (217 pass), but
every number in `battleBalance.ts` / `covertBalance.ts` is a first fit. These are
the known-open dials, with the reasoning, so nobody has to re-derive it later.

### ⚠️ How to read the race numbers — the sim's verdict is too narrow
`scripts/sim.ts` reports a **34.6-point spread** in open-field raid win rate
(Gnoll 34.6% as attacker, Troll and Dwarf 0%). **Do not "fix" this by flattening
the race table.** The sim measures ONE axis, and it happens to be the axis those
races are deliberately worst at:

| Race | Built to be | Field-raid win rate measures… |
|---|---|---|
| Troll | **siege** (1.4) + stone (1.6) | the thing it trades away |
| Dwarf | **fortress** (walls 1.25) + stone/ore (1.4) | ditto — it is a defender |
| Gnoll | archers (1.3) + **covert** (spy/scout 1.2) | its best axis |
| Elf | archers (1.35) + wood (1.5) | its best axis |
| Human | **generalist** (production 1.25 across the board, spy 1.25) | middling, correctly |
| Orc | cavalry (1.25) + food/ore (1.4) | partly |

A race that loses field battles is not broken if it out-produces, out-ranks,
out-sieges or out-spies everyone else. **Balance is whether every race has a
path to winning an age, not whether they win the same fight.**

- [ ] **Broaden the race sim before touching any race multiplier.** It needs to
      score each race across ALL the win conditions, not just raids:
      production/day at equal build, ranking score at equal gold spent, bombards
      needed to breach an equal wall, bombards needed to *survive*, spy op
      success vs an equal watch, and defensive holds. Only a race that is
      bottom-quartile on EVERY axis is actually broken.
- [ ] **The archer-phase weight is a genuine suspect, though.** Archers fire
      first, spread damage proportionally, and can decide a raid before cavalry
      or footmen swing — so archer multipliers may be worth more than any other
      unit stat regardless of race intent. Worth testing by reordering the
      phases or damping phase 2, BEFORE concluding anything about races.

### Siege
- [ ] **The anchor is unvalidated against real play.** 40 crewed trebuchets, a
      mid-game attacker, 10 bombards to a Citadel (20 with full defensive
      siege). Fitted arithmetically, never played. Move
      `SIEGE_GEAR.trebuchets.power` or `WALL_HP_CURVE` to shift it; everything
      else is calibrated against those two.
- [ ] Engine repair cost (⅓ of build) decides whether an online defender can
      out-mend a besieger. Untested at real turn budgets.
- [ ] Siege tower (100 troops at +10% wall edge) vs Fire Pots has never been
      played. The tower may be strictly better than ladders at any price.

### Espionage
- [ ] `INTERCEPTION.AT_PARITY = 0.4` is a guess — the fraction stopped when both
      sides are equal. Everything about how many agents to commit hangs off it.
- [ ] **Quell ops may cost more than the attacks they answer** (0.30 turns/agent
      vs Incite Unrest at 0.60 — but the quell needs no interception margin).
      Counter-play priced above the attack tends to go unused; check whether
      keeping rangers for counter-ops is ever worth it over just eating the debuff.

### Ranking
- [ ] Two mild outliers remain in the points-per-gold check: **light archers
      1.33×** and **cavalry 0.71×** the median. These are TRAINING-COST
      imbalances (archers get 12 power for a footman's 150g; cavalry 15 for
      350g), not ranking-weight errors — fix them in `TRAINING_COSTS`, not in
      `SCORE`, or combat pricing goes wrong to fix a ladder symptom.
- [ ] Hired troops sit at 0.35× median deliberately (6× a regular's price for
      the same power). Confirm that reads as "you buy speed, not prestige"
      rather than "mercenaries are a trap".
- [ ] The whole ranking design leans on **no path buying rank appreciably
      cheaper than the others** — that is what keeps many compositions scoring
      alike, which is what keeps scouting worth paying for. Re-run
      `pnpm sim` after ANY cost change.

### Statecraft
- [ ] Moved off production onto the treasury (up to ×2 tax). Whether that is
      worth a research slot against four production fields is unmeasured.

---

## Product roadmap — the game made visible

Not a queue; a direction. The pixel-art pipeline works (PixelLab via MCP,
192×192 transparent sprites matching the existing set), so these are unblocked
whenever they become the priority.

- [ ] **Isometric settlement view** — replace the flat building grid with a town
      that visibly grows. The single highest-impact visual change available.
- [ ] **Battle replay theater** — Canvas2D side-view playback of a report. The
      report is already structured per phase with per-side regular losses, so the
      data it needs exists.
- [ ] Walls drawn as an actual ring, with damage states.
- [ ] Villagers, idle animations, march animation on attack.
- [ ] 9-slice pixel UI kit, parchment realm map, scene-framed page headers.

**Rendering verdict (settled):** DOM/CSS sprites first, Canvas2D only for the
battle theater. Three.js is the wrong tool — 3D fights the pixel-art direction
and costs more than it returns here.
