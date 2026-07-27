# Graphics & Animation Roadmap — less text, more Age-of-Empires

The plan for making WoE read as a *game* in the browser, not a website —
grounded in what we have: a full PixelLab pixel-art library (21 buildings,
all units/workers, 6 races + per-race advisors, siege gear + counters,
resources), a DOM `SettlementView`, Next 15 + React 19 server-rendered pages,
and the PixelLab MCP as the asset factory.

**Guiding decision: 2D isometric pixel art + sprite animation, not 3D.**
Our identity IS pixel art; it's cheap on mobile GPUs and every asset we own
already speaks it. DOM/CSS sprites first, Canvas2D only for the two dense
scenes, no WebGL by default (see §F).

Ratings: ⭐ impact · 🔨 effort · every item must hold the mobile/perf budget
in §F-20.

---

## A. The centerpiece — a living isometric town

- [ ] **A1. Isometric settlement view** ⭐⭐⭐⭐ 🔨high — replace the flat
      sprite grid on Command with a diamond-grid town: PixelLab
      `create_isometric_tile` ground (grass/dirt/cobble), roads connecting
      buildings, trees/rocks via `create_map_object`, buildings on a fixed
      hand-authored layout that **fills in as you build** (empty plots =
      staked-out ground). Click a building → its upgrade card. Pure
      absolutely-positioned DOM sprites, row-based z-index — no WebGL;
      degrades to the current grid as fallback.
- [ ] **A2. Walls that are actually walls** ⭐⭐⭐ 🔨med — draw the wall RING
      around the town from wall-segment tiles; style steps up with wall level
      (palisade → stone → citadel); **visible breaches + rubble** at low
      integrity.
- [ ] **A3. Damage states on buildings** ⭐⭐ 🔨med — cracked/smoking overlay
      sprites (or building-kit damage stages) when integrity < 100%; ties the
      bombard system into the picture.
- [ ] **A4. Villagers going about their day** ⭐⭐⭐ 🔨med — 4–8 tiny
      walk-cycle sprites (`animate_character` → CSS `steps()` sprite sheets)
      on fixed paths between Grange/Mill/Market; count scales subtly with
      population; paused off-screen (IntersectionObserver) and behind
      `prefers-reduced-motion`.
- [x] **A5. Day/night & dawn tint** ⭐⭐ 🔨low — *(done, phase 1)* time-of-day
      sky band on the top bar: a phase-tinted gradient strip with a sun/moon
      glyph tracking its arc across the 144-turn day, keyed to `tickNumber`; the
      phase name rides the "dawn in N turns" tooltip. Pure CSS, no new assets.
      (Full-page/town tinting deferred until the isometric town A1 exists.)

## B. War made visible

- [ ] **B6. Battle replay theater** ⭐⭐⭐⭐ 🔨high — Canvas2D side-view
      replay driven by the existing per-round battle report (read-only
      renderer, zero engine risk): two ranks of sprites (1 sprite ≈ N
      troops), arrow volleys, cavalry charge, trebuchet arcs chipping the
      wall, casualty numbers popping, mercs falling first. Skippable; text
      log stays beside it.
- [ ] **B7. March animation on attack** ⭐⭐ 🔨low — the Strike pending state
      becomes a banner-and-spears sprite marching across a parchment strip
      until the redirect lands (extends the caravan-road pattern).
- [ ] **B8. The muster field** ⭐⭐ 🔨med — /troops draws the actual army in
      ranks on a field (footman blocks, archer lines, cavalry wings, engines
      behind; 1 sprite ≈ N). BARE arms visibly lack their merc front line.
- [ ] **B9. Siege Works arsenal shelf** ⭐ 🔨low — engines as a rowed armory,
      crewed ones manned by tiny engineer sprites (assets already exist).

## C. The world

- [ ] **C10. Parchment realm map** ⭐⭐⭐ 🔨med-high — "the ladder is the
      world", literally: every empire a castle icon on a stylized map
      (positions hashed from empire id → stable, no engine change), castle
      size = settlement tier, clan territories tinted, crossed-swords markers
      on recent battles, ⚔ Act console opens from the map pin. SVG + sprites;
      a second tab beside the table, not a replacement.
- [ ] **C11. Caravan road, literalized** ⭐ 🔨low — the market road bar
      becomes a tiny isometric path with an animated walking camel
      (`animate_object`).

## D. Ambient life & polish

- [ ] **D12. Idle animations on key art** ⭐⭐ 🔨med — chimney smoke,
      waterwheel turn, forge glow, fluttering clan banner, market pennant.
      2–4 frame sprite-sheet loops via `steps()` — pennies on the GPU.
- [x] **D13. Resource tick feedback** ⭐⭐ 🔨low — *(done, phase 1)*
      `ResourceDeltas` floats "+1,250 / −40" chips up from each top-bar figure
      when it moved since the previous tick (diffed against a per-player
      localStorage snapshot), plus a gold-coin glint sweep on gold gains.
      Additive over the server-rendered numbers; off under reduced-motion.
- [x] **D14. Event toasts with sprites** ⭐ 🔨low — *(done, phase 1)*
      `EventToasts` slides in the tidings a reader hasn't seen since their last
      load (newest-first, capped 4), each with its tone sprite
      (`/art/tones/<tone>.png`); last-seen tick kept in localStorage so nothing
      repeats. Purely additive over the Chronicle.
- [x] **D15. Page transitions** ⭐ 🔨low — *(done, phase 1, minimal)*
      `@view-transition { navigation: auto }` cross-fade on cross-document
      navigations; progressive enhancement, off under reduced-motion. The
      card-grows-into-page morph is a later enhancement.

## E. Game chrome — the whole app reads as a game

- [ ] **E16. 9-slice pixel UI kit** ⭐⭐⭐ 🔨med — PixelLab `create_ui_asset`:
      carved-wood panel frames, parchment scrolls, pixel buttons
      (idle/hover/pressed), ribbon headers, ornate ⓘ seals. Applied via CSS
      `border-image` — reskins the site in one stylesheet pass.
- [ ] **E17. Scene-framed pages** ⭐ 🔨low — thin environmental header strips
      per page (battlefield on /troops, bazaar awning on /market, library on
      /research) from wide PixelLab scene strips.

## F. Tech approach & constraints

- [ ] **F18. Rendering strategy** — DOM/CSS sprites first; Canvas2D only for
      the two dense scenes (B6 battle replay; A1 town if DOM ever strains).
      At our object counts (≤ ~100 sprites/scene) DOM is smooth on mid-range
      phones and idles at zero cost. Canvas renders only while visible,
      devicePixelRatio capped at 2.
- [ ] **F19. Three.js verdict: NOT the right tool here.** 3D fights the pixel
      identity, triples the asset problem, and burns mobile battery. If we
      ever want one 3D flourish: a single low-poly hero moment (rotating
      crown on victory/records, or the login hero), lazy-loaded and paused
      off-screen — or fake it with CSS 3D transforms (perspective-tilted
      cards/map): 90% of the wow at 1% of the cost. PixiJS (WebGL-2D) only
      if the town/battle scenes outgrow DOM — not needed at current scale.
- [ ] **F20. Asset pipeline + perf budget** — **top up PixelLab credits
      first** (account has been HTTP 402 since the siege-sprite batch); then
      batch-generate: iso tileset, wall segments, damage overlays, 6–8
      walk/attack cycles, the UI kit. Global rules: sprite atlases,
      `image-rendering: pixelated`, every animation behind
      `prefers-reduced-motion`, IntersectionObserver-paused, no large-area
      CSS filters, a static-image fallback for every scene.

---

## Recommended build order

1. ~~**Cheap-life batch (no new assets):** A5 day/night tint · D13 resource
   deltas · D14 sprite toasts · D15 transitions.~~ **✅ Done.**
2. **A1 + A2 — the isometric town.** The single biggest "less text-based"
   jump. (Gated on F20 credits.)
3. **B6 — battle replay theater.** The biggest wow.
4. **E16 — UI kit reskin.**
5. **C10 — parchment realm map.**
6. Everything else (A3/A4, B7–B9, C11, D12, E17) as garnish between the
   big rocks.

Non-negotiables throughout: the game stays server-authoritative and fully
playable as text/forms — every graphic here is a **read-only view layered on
existing data**, never a new gameplay path; and every scene ships with its
static fallback so low-end mobile loses nothing but motion.
