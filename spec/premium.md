# War of Empires — Premium: The Royal Charter

A per-age purchase — **the Royal Charter, $8.99 per age (tunable)** — that
places **the Steward** in the player's court: an automation officer for
players who can't check in every ten minutes. The Charter lasts until the
era turns (every empire begins a new age uncharted, since the world resets).
All numbers tunable.

---

## The fairness principle (design pillar)

**The Charter buys attention, never power.** Every Steward action is one of
the same instant commands a free player could issue by hand at that moment —
same costs, same validation, same capacity gates. Premium grants no stat,
resource, troop, or ranking advantage of any kind, and never will. What it
sells is *presence*: the Steward acts on the tick, while the free player
must be at the keyboard.

This also means the Steward does **not** bend the build-capacity-ahead
pillar (`buildings.md`): arrivals still walk when housing is full, training
still needs vacant slots. The Steward just issues commands on time; it never
queues *people* or buffers overflow.

## Purchase — Stripe

- **Stripe Checkout**, one-time payment (`mode: payment`), hosted page.
  The player is identified by `client_reference_id`; granting sets
  `player.premium = true` — idempotent, safe to run from both paths:
  - **Webhook** (`/api/stripe/webhook`, `checkout.session.completed`,
    signature-verified via `STRIPE_WEBHOOK_SECRET`) — the production path.
  - **Success-redirect verification** — `/premium?session_id=…` retrieves
    the session server-side and grants if `payment_status = paid`; lets dev
    and preview environments work without webhook plumbing.
- **Test mode:** with Stripe *test* keys, Stripe's own test cards work on
  the hosted page — `4242 4242 4242 4242` succeeds, `…0002` declines, etc.
- **No keys at all (zero-setup dev):** `/premium` shows a built-in **test
  terminal** that emulates Stripe test-mode card behavior (4242… succeeds;
  0002 declined; 9995 insufficient funds; 0069 expired; 0127 bad CVC).
  Same dual-mode philosophy as the store (Supabase ↔ JSON file).
- Env: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (see `.env.example`).
- The flag lives on the Player document. **TBD:** move to the account level
  so it survives era wipes (today the dev world's players persist anyway).

## The Steward (premium features)

Runs **every tick** for Charter holders, after the economy tick, in this
order. All caps 10 (tunable).

### 1. Build queue (≤ 10 entries)

- Queue any building from the Buildings page (or `cmd:queueBuild`).
- Each tick the Steward tries the **head** entry: if the treasury covers it,
  it's built instantly (the normal `build` command) and the next entry
  becomes the head. Multiple entries can complete in one tick.
- **Strict FIFO — no skipping:** if the head is unaffordable, the queue
  waits (an unaffordable Citadel blocks the cheap Hearthstead behind it —
  ordering is the player's strategic statement).
- Entries for a building already at max level are dropped silently (built
  by hand in the meantime).

### 2. Research queue (≤ 10 entries)

- One entry = **one level of one field** (queueing Masonry twice = levels
  1 and 2). The Steward keeps `research.activeField` pointed at the head
  entry; when the target level completes, it advances to the next.
- Banked-RP rules are unchanged (`research.md`); the Collegium gate simply
  makes the scholars bank until the gate is raised.

### 3. Standing orders (≤ 10 active)

"**Once X, do Y**" — evaluated every tick; executed the moment the
condition holds *and* the action is payable.

| Conditions (X)                       | Actions (Y)                          |
|--------------------------------------|--------------------------------------|
| a building reaches a level/count     | train troops (type, tier, count) / spies / scouts / engineers |
| a research field reaches a level     | raise a building (one-shot)          |
| gold on hand reaches an amount       | set the tax rate (one-shot)          |
| a resource stock reaches an amount   | …                                    |

- **Count-based actions fulfill partially**: the Steward does as many as
  resources/slots allow each tick and keeps the order alive until the full
  count is reached ("train 1,000 light footmen" trickles in as gold, ore, and
  Muster Hall slots appear). One-shot actions retry until they succeed once.
- Orders whose condition is already true fire on the next tick.
- Queues feed orders within the same pass: a queued Drill Yard completing
  can trigger "once Drill Yard is built, train 1,000 light footmen" that tick.

### Chronicle

Every Steward action lands in the player's Chronicle feed, prefixed
"🪶 The Steward: …" — the morning report of what he did overnight.

## Commands (protocol)

`cmd:queueBuild`, `cmd:queueBuildCancel`, `cmd:queueResearch`,
`cmd:queueResearchCancel`, `cmd:orderAdd`, `cmd:orderRemove` — all rejected
without the Charter. UI: Queue buttons on Buildings/Collegium pages; the
Steward page (`/steward`) manages queues and standing orders; `/premium`
sells and explains the Charter.

## Open / TBD

- [ ] Price point ($4.99 placeholder); regional pricing; refunds policy.
- [ ] Account-level premium (survives era wipes) once Supabase Auth lands.
- [ ] More conditions/actions (stamina threshold → rest; “when attacked” →
      surrender)? Keep the list small — this is a convenience, not a bot.
- [ ] Should free players see a read-only Steward page as an upsell? (yes,
      implemented: locked-chamber teaser.)
