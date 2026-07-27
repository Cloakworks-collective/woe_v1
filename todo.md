# Todo

## Design — done (tunables marked in specs)
Deferred to v2: coordinated clan attacks, war scoring, bazaar buy-orders,
spy-vs-spy sweeps. Rejected: caravan raiding. Decided: scattering exemption
<500 pop; leave/kick forfeits clan deposits + 48h rejoin cooldown + max 2
departures per era. Open proposals awaiting confirmation:
shield-drop-on-attack, spy-block vs protected players.

## UX & content batch — DONE (this pass)
- [x] ReqTip/CostTip tooltips on every acting button (what/cost/why-disabled);
      top-bar rate popovers + dawn explainer + live next-turn countdown.
- [x] Nav regroup: sidebar = own empire (Court/Realm/War incl. Clan); top bar =
      wider world (Rankings/World/Annals/Forum). Mobile drawer mirrors.
- [x] Caravan delivery time: max(10, 110−10×lvl) turns; arrivesAtTick gates
      price/supply/buys; road graphic + ETA; specs + API + 2 tests.
- [x] Field Manual de-staled + Advanced Manual (regulars/clocks/revenge/market/
      rich); every page deep-links its chapter.
- [x] Btn pending hourglass, animated Flash, CountInput +10/+100/Max, unified
      muster cards (:has tier highlight), meters, damage strip, anchors, empty
      states, reduced-motion.
- [x] BARE per-arm merc-screen warnings (census/troops/black market + advisor).
- [x] Records of the Age trophy hall (dais + laurel SVG + pennants + medals +
      charter cards; Elder Ages get medals free).
- [x] Pixel art enlarged (market 3×, troops 3×, buildings 2×, advisors 2×);
      advisors now bulleted multi-counsel (advisorCounsel engine fn).
- [x] Housing shortfall surfaced (min(perDay,vacant) tile + Steward banner);
      settlement ZENITH ribbons; theWallName fixes "The The Barbican".

## Military model — DONE (this pass)
- [x] Removed the "warrior" middle step: peasants train straight into
      footmen/archers/cavalry by tier (`trainTroops`), discharge straight home
      (`dischargeTroops`). `Player.warriors` + equip/disband/discharge-warrior
      commands deleted; muster levy folded into troop gold cost.
- [x] Mercenaries are now typed/tiered (`MercForce`): `buyMercs(type,tier,count)`,
      gold-only, require the same buildings as regulars, tier-scaled price, still
      25%-cap + upkeep + zero-ranking. Combat: mercs fight in their arm's phase
      at tier but die before matching regulars (die-first per arm). Legacy saves
      migrated (`normalizePlayer`). Specs + CLI + plugin + tests updated (110 pass).

## Research economy rework — DONE (this pass)
- [x] Removed Collegium level-gate (collegiumRequired) — everything researchable
      any time; Collegium = speed only (scholar slots). Tier ladder + lock pips
      gone.
- [x] Global progressive cost: researchOrdinalCost(N)=2000×1.3^(N-1) by TOTAL
      levels earned across all fields (totalResearchLevels helper). rpCost
      replaced in tick/ResearchView/research page/eraTables. UI banner + per-node
      "your Nth research" cost. Spec updated; 4 tests.

## Uncapped worker/unit buildings — DONE (this pass)
- [x] Removed all "20×level" slot caps; every worker/unit is unlimited (need only
      the building). Building level scales per-unit effect: producers + researchers
      50×level/turn (productionPerWorker); Market Square +1k caravan cap/level
      (freeMerchants uncapped); Guild/Lodge already scale spy/scout effect. tick +
      reports + assignWorkers/trainSpies/trainScouts + UI + specs; tests reworked.

## Chronicle focus + zenith badge — DONE (this pass)
- [x] pushInbox whitelists 5 categories (attacked/battleResult/spyReport/
      spiesCaught/sabotaged/crownClock); new crownClock event emitted from
      updateCrown (overlord + clan clock start/stop). Live inboxes pruned. 2 tests.
- [x] Maxed buildings show a gold "★ ZENITH" badge (was plain italic text).

## Defensive siege rework — DONE (this pass)
- [x] Defensive counters are purchasable crewed gear (SIEGE_COUNTERS,
      buySiegeCounter, ArmyState.siegeCounters + migration). Engineers man them
      when defending (counters first, spares fire back). Each crewed counter
      cancels ONE incoming enemy engine of its paired weapon (decided model);
      bombard counter-engines cancel volleys + splinter 1 treb/round. Siege
      Works Ramparts tab rebuilt as buyable cards. combat.md updated; 130 tests.
- [ ] ART: regenerate Hoardings + Counter-Engine sprites — BLOCKED: PixelLab
      account out of generations/credits (HTTP 402 on both MCP + REST token).

## Research page UX — DONE (this pass)
- [x] Fixed disjointed tree connector lines (equal 3-col grid + rail inset 15%).
- [x] Switch penalty: setResearch forfeits 50% of the current field's banked
      progress toward its next level (RESEARCH_SWITCH_LOSS); UI says so (intro +
      "Switch here" button title); spec updated; 2 tests.
- [x] Every node shows a progress bar + %; active field shows time-to-next-level
      ETA (~N turns (Xh Ym)); dashboard ResearchView widget too.

## Market whole-number prices — DONE (this pass)
- [x] Ask prices are whole gold, bounded 2–50 (MARKET_PRICE_MIN/MAX). postOrder
      validates integer+band; pipeline floors input; caravan price field
      number/min2/max50/step1; all displayed prices Math.round'd; PriceChart fnum
      → Math.round (no decimals). Seeds repriced whole 2–50; spec updated; live
      world migrated (orders + priceHistory rescaled). Verified in-browser.

## Market caravans UX — DONE (this pass)
- [x] Moved "Your Caravans" above Price History; rebuilt as a per-resource table
      (Goods · Loose · Market price · Amount · Ask gold/unit · 🐫 Send caravan).
      Each row is its own marketPost via CmdForm `id` + inputs' `form={id}`
      attribute; ask prefills market price; Send button green/red by merchant
      availability + loose goods; no-merchants warning links to Market Square.
      Verified a real dispatch in-browser.

## Siege built-vs-manned UX — DONE (this pass)
- [x] Command dashboard + Siege Works now distinguish engines built vs manned
      (crewGear allocation). Dashboard: "X of Y engines manned" title, per-engine
      manned/built tiles (amber when short), unmanned-warning banner → /siege.
      Siege Works: "Engines manned X/Y" stat + "recruit K more" CTA + inline
      "🔧 Train" engineers form (green/red afford) on the page itself.

## Affordability UI — DONE (this pass)
- [x] Green (affordable) / dull-red disabled (can't afford) buttons via .btn-no,
      on Buildings (Upgrade/Repair), /train (spies/scouts), /troops (troops,
      engineers, mercs). Recomputed each render (server-rendered reload). New
      <CostTip> shows cost as a table on hover (Cost · Need · You have, short
      rows red) — wired onto Buildings Upgrade + Repair.

## Repairs UX — DONE (this pass)
- [x] Shared repairCost(id,level,integrity) engine helper (repairWalls/
      repairBuilding call it). Buildings page: removed the context-free "Repairs"
      button panel; each cracked building card now shows an amber "🔨 Repair"
      button next to Upgrade with the exact cost on hover (title), disabled when
      unaffordable. Top panel is now a read-only "Repairs needed" list (HealthBar
      + name + tab hint/link). Bombard confirmed working as designed (trebuchet-
      scaled, walls-first to 0.5 pivot, buildings to 0.5 floor, Counter-Engine
      kills a treb/round) — no code change, just explained.

## Command View polish — DONE (this pass)
- [x] Counting House rewritten: one "Store all" button per holding (auto-max,
      no inputs), removed the separate Bank-all + all withdraw buttons. Shows
      FULL, and spilled overflow in Exposed. Unified gold+resources holdings
      model. bank tooltip updated (no withdraw). Damaged stores show a graphic
      HealthBar + "🔥 repair" link to /buildings; new AdvisorAlerts banner
      ("storehouses breached", Treasurer Poll) with a Repair CTA when any store
      integrity < 1.
- [x] Dashboard icons enlarged: census 32→52px (container 54, glyph 40); Siege
      Train + Shadow Work StatTile icons 26→46px.
- [x] Removed the Chronicle feed from the Command View (still at /chronicle);
      kept "⚔ Revenge windows open" as its own panel.

## War Records — DONE (this pass)
- [x] Expanded live War Records to full Elder-Age parity (were battle-only):
      added lifetime per-ruler flow tallies (`EraRecords.feats`) folded in by
      recordBattle/recordSpyFeat/recordSaleFeat/recordGiftFeat (wired through
      pipeline spy/marketBuy/clanDeposit; runSpyMission now returns
      resources/gear destroyed). `lib/server/eraTables.ts#buildEraTables` builds
      all 10 tables as ElderTable[] (Greatest Rulers, Strongest Empires, Lords &
      Ladies, Champions of the Realms + epithets, Non-Battle Titles, + 5 battle
      tables) rendered via LeaderTable; /rankings/records live, eraReset freezes
      into ArchivedAge.sealedTables. Specs (victory.md) + 3 tests (124 total);
      verified in-browser. NOTE: no gold-stealing spy op → "the Thief" omitted.
      Renamed the page "War Records" → "🏆 Records of the Age" (nav + all
      cross-links). "Banner" column → "Clan", now a link to /clan/[id] (ElderTable
      gained a {text,href} link-cell; buildEraTables has a {link} flag — sealed
      ages render plain since clans are gone at reset).

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

- [x] **14.1 CAS — DONE.** `saveWorld` (Supabase) is now a version-guarded
      compare-and-swap: `update(...).eq("version", loadedVersion)`, throwing
      `WorldConflictError` on a lost race instead of clobbering (insert path for
      the fresh seed row). New `commitWithRetry(apply)` primitive in `world.ts`
      does load → apply → CAS-save → on conflict reload-fresh + **replay** +
      retry (bounded); a read-only pass (`dirty:false`) skips the save. Routed
      the hot/frequent write paths through it — `runCommand`, `getGame`,
      `/api/tick`, `/api/state` — so same-player command races and the era
      attack storm reload+replay rather than silently reverting. File store
      (single-process dev) is unaffected. 5 concurrency tests; verified live
      against Supabase (5 concurrent same-player commands all landed). Rarely-hit
      one-shot paths (join/premium/admin/createEmpire) are still protected by
      CAS (loud conflict, not silent loss) — wrap them in `commitWithRetry` too
      when convenient. Still one global write lock — does NOT scale; that's 14.2.
- [x] **14.2 Single-writer world service — DONE (built + verified; deploy is
      user's).** `worldService/main.ts` (run `pnpm world-service`, via tsx): one
      always-on Node process owns the world in memory, serializes EVERY mutation
      through an in-order promise queue, self-ticks (`runDueTicks` on a timer),
      and persists off the request path — snapshot every 2s (+ on SIGTERM) plus
      an append-only `commands.jsonl` truncated per snapshot, with boot replay.
      Reuses the engine verbatim: extracted `applyOneCommand` (the shared heart)
      is what both the service and the §14.1 in-process path run. HTTP: `POST
      /command`, `GET /world` (consistent, queued read), `GET /health`; shared
      secret (`x-woe-secret`). Next.js became a thin forwarder, gated by
      `WORLD_SERVICE_URL`: `runCommand` → forward, `getWorld` → fetch snapshot;
      `getGame`/`/api/state`/`/api/tick` read the service; found/premium/
      onboarding routed through commands (new `createEmpire`/`syncPlayer`/
      `grantCharter`/`dismissOnboarding`/`finishTour` in dispatch). `saveWorld`
      throws under service mode (loud safety net). Verified live end-to-end:
      found via Next `/api/join` → build/assign via `/api/cmd` → read via
      `/api/state`, all landing in the SERVICE world (not Supabase); restart
      preserves state (snapshot+replay). Deploy artifacts: `worldService/`
      Dockerfile + fly.toml + README + `.env.example`. tsc clean, 116 tests.
      **Remaining:** admin write ops (disabled under service mode — wire through
      commands); RNG-faithful replay (log per-command seed); actual deploy
      (Fly/Railway — needs your creds). Run exactly ONE instance.
- [x] **14.3 Event-driven crown clocks — DONE.** Overlord/clan hold-clocks now
      accrue by exact elapsed **milliseconds** whenever the ladder top reorders
      (after every command *and* every tick, via `updateCrown` called from
      `applyOneCommand` + `runOneTick`), not sampled once per 10-min tick. Meta
      went ms-based: `overlordClocksMs`/`overlordAccruing` (open interval) +
      `clanClocksMs`/`clanAccruing`; `overlordHold`/`clanHold` selectors read
      cum + live streak; `normalizeMeta` migrates legacy tick clocks. Only the
      #1 above the pop floor accrues; streak resets on losing #1. UI (VictoryTracker,
      both rankings pages) shows ms→hours. 4 tests (flip-inside-a-tick credits
      each holder exactly, floor freeze, win threshold). No infra.
- [x] **14.4 Durable read edge — DONE (spectator snapshots).** `lib/server/
      analytics.ts`: the tick writes a top-N ladder + crown snapshot to Postgres
      (`spectator_snapshots`, `supabase/migrations/0003_*.sql`) off the request
      path — from `/api/tick` (§14.1) and the world-service tick loop (§14.2).
      Supabase-gated (graceful no-op + crash-safe without it — verified live:
      the tick still succeeds when the table is absent). Pure `buildSpectatorSnapshot`
      is unit-tested. NOTE: this is the *new* read edge; migrating battle_reports/
      messages **out of the blob** (blob-shrink) is still open — the append-only
      logs live in the blob for now, read paths unchanged.
- [x] **14.5 Live spectator reads — DONE.** Public `/spectate` (outside the auth
      shell) polls `/api/spectate`, which reads one indexed snapshot row (14.4) —
      every viewer shares it, none recompute the ladder; crown clocks animate
      client-side. Linked from /login. Realtime-push (vs polling) noted as an
      enhancement. Needs migration 0003 applied + a tick to populate; until then
      it shows "no snapshot yet" (verified graceful).
- [ ] Perf guardrails while still on the blob: keep saves off hot read paths,
      watch blob size as player count grows (every save rewrites everything —
      write amplification is the quiet killer).
