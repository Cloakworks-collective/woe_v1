# War of Empires — Research (The Collegium)

Research is conducted by **researchers** (20 slots per Collegium level, max
200 at Collegium 10), each producing **20 research points (RP) per turn at 0%
tax**, scaled by `(1 − taxRate)` like all producers (see `economy.md`).

---

## Mechanics

- **One active project at a time.** All RP generated each turn flow into it;
  the level completes the moment its cost is paid (no timers beyond earning
  the points).
- Switching projects is allowed, but **abandoning a field forfeits half** the
  progress banked toward its next level (`RESEARCH_SWITCH_LOSS = 0.5`): e.g. a
  field 40% of the way to its next level drops to 20% when you switch away. The
  UI shows each field's progress bar + a time-to-next-level ETA so you can
  finish a level before re-pointing the scholars.
- Charter holders can chart a **research queue** (`premium.md`): the Steward
  re-points the scholars to the next queued field-level as each completes.
  Same RP economy — the queue only automates the switching.
- **Every field has 5 levels. Each level = +20% efficiency**, so level 5
  = 100% of the field's maximum effect.

```
fieldEfficiency = level × 20%          // 0%, 20%, 40%, 60%, 80%, 100%
actualBonus     = fieldEfficiency × maxEffect
```

### Global progressive cost — the order is the strategy

Research cost is **global and progressive**, not per-field-level. The cost of a
level depends on **how many levels you've already earned across ALL fields**:

```
researchOrdinalCost(order) = RESEARCH_ORDINAL_BASE × RESEARCH_ORDINAL_GROWTH^(order−1)
                             // base 2,000, growth 1.3 (tunable placeholders)
order = (total levels earned across all fields) + 1
```

So if you've done 3× Masonry + 1× Siegecraft + 2× Pathfinding (6 levels), your
**next** level — in *any* field — is your **7th** research and costs
`researchOrdinalCost(7)`, regardless of which field it is. Every level makes the
next dearer, so **what you research first is the strategy**.

### The Collegium sets speed, never a ceiling

There is **no level gate** — every field level is researchable at any time. The
**Collegium sets only the speed**: it caps researcher slots (20 × level), so a
small library still learns anything, it just crawls. Combined with the rising
cost, a level-1 Collegium can eventually research anything — it just takes a very
long time. Raise the Collegium (and assign scholars) to go faster.

---

## The Ten Fields

| Field              | Name                | Affects                                        | Max effect (level 5)                          |
|--------------------|---------------------|------------------------------------------------|-----------------------------------------------|
| Food production    | **Crop Rotation**   | Farmer output                                  | +100% food/turn                               |
| Wood production    | **Forestry**        | Lumberjack output                              | +100% wood/turn                               |
| Stone production   | **Masonry**         | Quarryman output                               | +100% stone/turn                              |
| Ore production     | **Deep Smelting**   | Miner output                                   | +100% ore/turn                                |
| Spy efficiency     | **Tradecraft**      | Spy success chance, sabotage strength, evade counter-spies | +100% effectiveness              |
| Scout efficiency   | **Pathfinding**     | Scout intel depth/accuracy, evade detection    | +100% effectiveness                           |
| Army offense       | **The Art of War**  | Attack multiplier, all troops                  | +100% attack ⚠ tune                           |
| Army defense       | **Shieldcraft**     | Defence multiplier, all troops                 | +100% defence ⚠ tune                          |
| Siege weapons      | **Siegecraft**      | Siege weapon damage (and wall damage dealt)    | +100% siege damage                            |
| Tax resilience     | **Statecraft**      | Multiplies post-tax producer output            | ×2 production at level 5                      |

### Statecraft (keeping people effective under high taxes)

A straight production multiplier applied **after** the tax penalty:

```
outputPerProducer = 20 × (1 − taxRate) × (1 + statecraftLevel × 0.2)
```

- Statecraft 5 = ×2: at 50% tax, producers work as if untaxed (10 → 20/turn).
- The tax trade-off itself never disappears — 100% tax is still 0 production
  (2 × 0 = 0). Statecraft softens the dial, never removes it.
- Stacks multiplicatively with the per-resource fields (Crop Rotation etc.).

+100% army offense/defense at level 5 is accepted as-is for now (it's a
1.25M-RP capstone); revisit only if playtesting shows it dominating.

---

## Costs (per level, any field)

Costs grow **exponentially** (×5 per level), far steeper than linear:

```
rpCost(level) = 2,000 × 5^(level − 1)
```

| Level | RP cost    | Cumulative  |
|-------|------------|-------------|
| 1     | 2,000      | 2,000       |
| 2     | 10,000     | 12,000      |
| 3     | 50,000     | 62,000      |
| 4     | 250,000    | 312,000     |
| 5     | 1,250,000  | 1,562,000   |

- Full field: ~1.56M RP. Entire tree (10 fields): ~15.6M RP.
- **You cannot research everything.** Pacing at 100 researchers, 50% tax
  (1,000 RP/turn = 144,000 RP/day): level 1 in minutes, one *field* maxed in
  ~11 days, the full tree in ~3.5 months. Specialization is the design intent:
  empires choose an identity — the economist, the warlord, the spymaster —
  and dabbling (levels 1–2 everywhere, ~120k RP) stays cheap while mastery
  (level 5) is a serious commitment per field.
- Research generation competes with the tax dial: a war-chest economy
  (high tax) starves its own Collegium.

---

## Open / TBD

- [x] Max-effect values for Art of War / Shieldcraft / Statecraft — accepted for now (revisit after playtesting).
- [x] Spy/scout research roles — resolved, see `espionage.md`: Tradecraft levels
      unlock the five op types (and +20%/lvl effect); Pathfinding boosts catch
      chance and recon sharpness.
- [ ] RP cost curve tuning against real player counts.
- [ ] Race research bonuses (e.g. Humans research faster?).
