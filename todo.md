# Todo

## Design — done (tunables marked in specs)
Deferred to v2: coordinated clan attacks, war scoring, bazaar buy-orders,
spy-vs-spy sweeps. Rejected: caravan raiding. Decided: scattering exemption
<500 pop; leave/kick forfeits clan deposits + 48h rejoin cooldown + max 2
departures per era. Open proposals awaiting confirmation:
shield-drop-on-attack, spy-block vs protected players.

## UI & combat polish — DONE (this pass)
- [x] Visual pass I: race portraits on Rankings + Attack; pixel tone-emblems
      (7 glyphs in public/art/tones/, <ToneGlyph>) on Chronicle/World News/Annals.
- [x] Visual pass II: pixel resource tokens (public/art/resources/, <ResIcon>)
      in the top bar + Market + costs; Command dashboard = <StatTile> grid +
      <Meter> bars (was dl.kv text); Guide chapter illustrations (.guide-illo);
      Spy unit art; Clan heraldic crest (public/art/clan/crest.png) + member
      portraits; advisors already had 4 portraits. New: ResIcon/StatTile/Meter.
      TODO (optional next): snapshot composition charts (army/workers/research —
      reuse PriceChart SVG); Command trend charts (needs hourly sampler like
      priceHistory); Forum avatars.
- [x] Elder Ages: COMPLETE — full historical record in tables for all 35 ages
      (2005–2013) in lib/lore/elderAges.ts (generic ElderTable model); rendered
      on /annals as tomes with every leaderboard (Rulers, Empires, Champions/feat,
      Lords & Ladies, Non-Battle Titles, Richest/Bloodiest/Wars/Feuds/Greatest
      Empires), grouped into the four victory eras (all now populated, incl.
      Conquest 32–35). Ages 15–35 parsed from the original chronicles HTML.
      Split for load: /annals shows a light index of link-cards; each age's full
      tables live on /annals/age/[age]; top-nav "Annals ▾" dropdown links the
      four eras + this-age Annals.
- [x] The Annals: global world chronicle (crown changes, clan wars, sacked
      castles, victories) → /annals page; sealed into world.chronicleArchive at
      eraReset ("published for good"), carried across resets; admin "Close the
      Age" trigger; nav 📚 Annals. Field Manual gained a Strategy chapter
      (adapted from the original WoE Quick Start). Specs updated (victory.md)
- [x] Nav regrouped into 3 intent groups with dividers (You / The World /
      Help & Charter); War Ledger → "World News" feed: colourful tone-rows
      (mode-tinted), "Wars Afoot" clan-war list, clan tags + clan-war badges,
      relative time; cross-linked with the Chronicle (kept as separate scopes)
- [x] TopNav also holds overview (Command/Chronicle/Field Manual) → sidebar is
      now just Realm + War; TopNav in 3 groups (court/world/premium)
- [x] Chronicle: tone-coloured rows (eventTone + color-mix tints), light
      medieval phrasing + plurals, relative "how long ago" timestamps
      (InboxItem.at wall-clock stamp + timeAgo helper, tick-math fallback)
- [x] Nav split: trimmed sidebar to the core loop; new horizontal TopNav for
      Advisors + World (Rankings/Ledger/Clan/Forum) + a contextual premium
      entry (Royal Charter until owned → then The Steward; both pages kept)
- [x] Resource bar low-store warnings: food amber (<12h runway) / red-pulse
      (<2h or starving) with runway in the title; bulk cells amber at zero
- [x] Tooltips connect to the guide: Info popover gained a clickable "Read the
      manual →" deep-link (interactive popover), wired via *_GUIDE maps across
      units/buildings/attack-modes/research/actions
- [x] Top banners now come from advisors: AdvisorAlerts (Starvation→Treasurer
      Poll danger; scatter→General Vosk; walls→Marshal Aldric — amber) each
      link "Ask <Advisor> →" (/advisors#key) + "Field Manual"; advisor cards
      link to their guide chapter
- [x] Research tree UI: Collegium trunk + tier ladder + connector lines to
      Economy/War/Shadow branches; field nodes with level pip-tracks, gating,
      SHADOW tags
- [x] Winning conditions made prominent: "Race to the Throne" VictoryTracker
      (both paths, leader hold-clocks as bars, your standing) on Command View
      + Rankings; new /guide Field Manual (7 anchored chapters) with nav entry
      + "how this works →" deep-links across the game pages; Command View
      portrait given proper margin/framing
- [x] Bombard rework: no target choice; walls-first then random town buildings
      (storages > production > Collegium); per-building integrity (0.5 floor)
      affects storage/production/research; repairBuilding; specs + tests + CLI
- [x] Dark mode with light/dark toggle (cookie, server-rendered, top-bar ☀️/🌙);
      CSS variables throughout; verified in Chrome both themes
- [x] Buildings page broken into grouped panels + per-building health bars
- [ ] Consider: per-building health bar on the empire profile / scout report
      (defenders' bombard damage is currently only visible to the owner)

## Engineering (in order) — Next.js on Vercel + Supabase

### 1. Scaffold + constants + pure engine core — DONE
- [x] Next.js 15 app (App Router, TS, pnpm, hand-rolled); vitest; git init
      (eslint/prettier deferred)
- [x] `lib/constants/` — one file per spec doc, every number extracted
- [x] `lib/engine/types.ts` — Player, ArmyState, GameEvent, helpers
      (Clan/BattleReport types land with their subsystems in task 7)
- [x] Engine: turn tick (starvation, tax, merc defection, production,
      RP banking + Collegium gating, stamina, action turns)
- [x] Engine: daily reset (growth, wall penalty, housing cap, scattering)
- [x] Engine: economy commands (all listed, incl. spy/scout/engineer training)
- [x] Unit tests — 35 passing (`pnpm test`)
- [x] BONUS from task 8: Travian-style CSS shell, resource bar, side nav,
      Command View + Buildings pages (demo state through the real engine)

### 2. Supabase — LIVE (world-doc persistence; decomposition pending)
- [x] Project `war-of-empires` (jmidtuoxclntwluygiab, us-west-1) created via
      CLI; migrations 0001 (normalized schema + RLS) & 0002 (world_docs)
      applied; keys in `.env.local` (gitignored, incl. DB password)
- [x] Dual-mode store: Supabase versioned JSONB world doc when env keys
      exist (verified end-to-end), JSON file fallback otherwise
- [ ] Decompose world doc into the normalized 0001 tables (players/market/
      battles/clans/messages per row + optimistic per-player versions) —
      scope refined in §14: logs/reads decompose, the live world stays with
      the single writer
- [x] Seed script — `seedWorld()` (8 bots + a clan + opening Bazaar asks)

### 3. Auth + onboarding — DEV VERSION DONE
- [x] Dev session cookie + `/login` (create empire: name+race → starting
      state + 72h shield; re-enter existing empires)
- [x] Login UX: auto-skip when session exists, 🎲 dice names, realm-token
      re-entry (open empire list now dev-only), token in Command View
- [x] Realm tokens: per-empire bearer auth for cmd:* + read endpoints
- [ ] Swap to Supabase Auth once the project exists — plan: anonymous
      sign-in at found, magic-link/OAuth "claim your throne" later
      (tokens remain the CLI credential)

### 4. Tick endpoint + cron — DONE
- [x] `/api/tick` (CRON_SECRET-guarded), wall-clock catch-up (capped 2
      weeks), idempotent; every page/command also runs due ticks
- [x] Daily reset every 144th tick: recruitment + scattering; unrest/truce/
      shield windows are tick-stamped and checked on read
- [x] `vercel.json` cron `*/10`; dev time controls (+1 turn/+1 day) when no
      CRON_SECRET

### 5. Command pipeline — DONE
- [x] One pipeline (`lib/server/pipeline.ts`): validate → pure engine →
      persist → inbox events; used by BOTH `POST /api/cmd/[name]` (the
      cmd:* protocol) and UI server actions
- [ ] Optimistic version check — see §14.1 (CAS in saveWorld; the version
      column exists but is never compared today)

### 6. Realtime events — DEFERRED to Supabase wiring
- [x] Per-player inbox (Chronicle feed) + battle reports persisted
- [ ] Supabase Realtime channels + client subscription (dev mode refreshes
      on navigation instead)

### 7. Subsystems — DONE (engine + pipeline + UI + 32 new tests)
- [x] Combat: 4 phases, 4 modes, wall/integrity/escalade/counters, merc-first
      deaths, mercy/protection/refusal, loot w/ storage protection, XP bands,
      revenge windows + chains, clan-war ×2 damage + kill ledger, bombard
      vs walls/storage, battle reports (verified in-browser end to end)
- [x] Espionage: 5 ops, lodge gating + catch formula, executions + naming,
      anonymous sabotage, unrest; scout recon (fuzzy ±20%)
- [x] Market: anonymous book, cheapest-first fills, 5% burned fee, caravan
      capacity, merchant busy-state (verified in-browser)
- [x] Clans: create/join/leave w/ churn rules, 3× ledger, buildings, wars
      (net-kills → XP transfer + tribute siphon in tick + 48h truce),
      declare-war UI. Deferred: invites/kick/appoint UI, friendly diplomacy,
      5-founder enforcement, clan-building bombard revenge snapshot
- [x] Research: active project, banking, Collegium gating, effect wiring
- [x] Victory: score fn, #1 hold-clocks each tick (cum + streak, pop floors,
      clan freeze), winner banner; `eraReset()` exists — auto-transition
      still manual
- [x] Forum: era chat / clan chat / permanent DMs (simple feed, not threads)

### 8. UI pages — DONE (all live against the real engine)
- [x] Shell: resource bar (era/turn/dawn), nav, starving + winner banners
- [x] Command View (score, decrees: tax/surrender/bank, Collegium, advisors,
      Chronicle), Buildings (+repairs, foundry ladder), Train, Troops
      (equip/disband/rest/mercs/siege gear), Attack (war room + battle
      reports), Rankings (search + victory clocks + clan ladder), Market,
      Spy/Scout, Clan, Forum, Login
- [x] Pixel art (PixelLab, 59 assets in public/art): buildings, units, races
      (+ login race picker), workers, research emblems, advisor portraits,
      siege engines; expand later as needed (tiers? clan buildings? walls?)
- [x] Market price history charts (hourly samples, SVG)
- [x] Chronicle page (full event log + battle ledger)
- [x] Page reorganization: Buildings tabs (civilian/military), dedicated
      Research / Advisors / Siege Works pages, slim Command View, grouped
      nav, abdicate in top bar, dev clock labeled testing-only
- [x] A11y pass (Lighthouse 95): form labels, focus outlines, table overflow

### 9. Balance sim — HARNESS DONE, tuning open
- [x] `pnpm sim`: economy pacing (Village→Town ~day 38, ~820 pop day 60) +
      combat matchups/luck spread
- [x] TUNED (sim-driven, two iterations): gold income 40 → 0.4 g/civ/turn
      at 100% tax (anchor: ~29 g/civ/day at 50%; armies cost days of income);
      merc upkeep 10 → 1 g/turn; resource score divisor 50 → 2,000 (bulk
      goods @ ~0.05 g). Result: treasury 2–33% of score for a pathological
      hoarder (was 93%). Specs updated (economy/overview/architecture/victory)
- [ ] TUNE still open: lethality k=2 (battles end in 1–3 rounds); even-fight
      attacker win rate ~19% (defender edge — decide if intended)

### 10. Deploy — UNBLOCKED (persistence is serverless-safe now)
- [x] `vercel.json` (cron), `.env.example`; Supabase persistence live
- [ ] **USER: Vercel account/login** → set the three Supabase env vars +
      a CRON_SECRET → `vercel deploy`

### 11. Premium — Royal Charter + Steward (spec/premium.md) — DONE (dev)
- [x] Stripe Checkout (one-time $4.99): checkout route, webhook grant,
      success-redirect verification; keyless dev emulator of Stripe test
      cards (4242… verified in-browser, decline paths too)
- [x] Engine: `steward.ts` — build queue (FIFO, builds when affordable),
      research queue (one entry = one field level, auto-advance), standing
      orders (building/research/gold/resource conditions → train/equip/
      build/setTax actions, partial fulfillment); 13 tests (81 total)
- [x] Pipeline commands (premium-gated) + UI: /premium (buy), /steward
      (queues + order builder), queue buttons on Buildings/Collegium, nav
- [ ] **USER: real Stripe test keys** → set STRIPE_SECRET_KEY (+ webhook
      secret in prod) to switch from emulator to hosted Stripe Checkout
- [ ] Account-level premium (survives era wipes) once Supabase Auth lands

### 12. Admin — DONE
- [x] Hidden `/admin` (Crown Chamber) behind ADMIN_PASSWORD (HMAC cookie,
      timing-safe check; console disabled entirely when unset): ban/pardon
      (blocks cookie + token + commands), resource grants, force N turns,
      premium grant/revoke. Verified incl. CLI lockout while banned
- [ ] Later: audit log of admin actions; move admin auth to Supabase
      role once real accounts land

### 13. Headless play — CLI DONE, MCP next
- [x] JSON read endpoints: POST /api/join (unauthed found), GET /api/state
      (+ per-building next costs), /api/rankings, /api/market,
      /api/battle/[id]; all run due ticks; bearer realm-token auth
- [x] `cli/woe.mjs` (`pnpm woe`) — zero-dep color terminal client: REPL +
      one-shot; join/link/token, status, buildings, build/queue, train,
      equip, tax/rest/bank, research, rankings, attack (by name/#rank,
      colored battle report), market/buy/sell, spy/scout, mercs/gear.
      Config: ~/.woe/config.json (WOE_SERVER env overrides)
- [x] Claude Code plugin (`claude-plugin/` + marketplace manifest at repo
      root, validated): /woe command (court herald) + playing-war-of-empires
      skill (API reference, rules digest, strategy, ASCII templates) —
      plays over curl, no MCP needed for v1
- [x] CLI ASCII art: castle banner, battle standards, trophy/skull, flag
- [ ] Publish: push repo to GitHub → `/plugin marketplace add <user>/woe`
- [ ] MCP server at /api/mcp — optional later (skill+curl covers v1)
- [ ] Decide: is headless/CLI play a Royal Charter perk?

### 14. Scale & concurrency — survive 100s of simultaneous players (analysis 2026-07-19)

Today every command does getWorld (10s per-process cache) → mutate → save the
ENTIRE world blob. One Node process mostly merges concurrent mutations by
accident (shared in-memory object), but two commands on the SAME player race
(second `put` discards the first), and across serverless instances it's
last-write-wins with no detection — a stale instance's save can silently
revert a resolved battle (loot reverted, casualties resurrected, report gone).
The end-of-era attack storm is the guaranteed-failure scenario. Plan, in order:

- [ ] **14.1 CAS now (~1h):** compare-and-swap in `saveWorld` — upsert guarded
      by `eq("version", loadedVersion)`; on conflict reload + replay + retry.
      Turns silent world corruption into detectable retries. Does NOT scale
      (one row = one global write lock) but stops data loss the day two
      serverless instances exist.
- [ ] **14.2 Single-writer world service (the real fix):** one always-on
      process (Fly/Railway) owns the world in memory and serializes ALL
      commands through a queue — the classic MUD/browser-game model. Engine
      code unchanged; Next.js routes become thin forwarders. A single Node
      process serializing in-memory commands handles thousands/sec —
      hundreds of players is nowhere near the limit. Persistence moves off
      the request path: snapshot every few seconds + append-only command log
      for replay. The 10-minute tick stays trivial (world already in RAM).
- [ ] **14.3 Event-driven crown clocks:** overlord/clan clocks currently
      accrue by sampling #1 once per 10-min tick — in the endgame the crown
      can flip 5× inside a tick and only the boundary holder gets credit.
      Fix without polling: store `crownHolderId` + `crownSinceMs`; whenever a
      state change reorders the ladder top (every change passes through the
      single writer), close the previous holder's interval and credit exact
      elapsed ms. Millisecond-accurate, zero timers. (`crownHolderId` already
      exists in meta — half-built.)
- [ ] **14.4 Decompose the durable/read-heavy edges** into the normalized
      0001 tables: battle_reports as append-only log, ranking_snapshots
      (engine inserts top-N each tick; rankings page reads one indexed row),
      messages. The LIVE world stays in the writer's memory — do not re-plumb
      the engine through row transactions. Rank itself needs no infra: it's a
      pure function of current state, correct on every read by construction.
- [ ] **14.5 Live spectator reads:** endgame ladder churn for viewers via
      short polling of /api/rankings or Supabase Realtime push on crown
      changes, reading tick snapshots (14.4) — never recomputing per viewer.
- [ ] Perf guardrails while still on the blob: keep saves off hot read paths,
      watch blob size as player count grows (every save rewrites everything —
      write amplification is the quiet killer).
