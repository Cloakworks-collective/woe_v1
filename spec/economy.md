# War of Empires — Economy: Taxes, Production, Upkeep

One turn = **10 minutes**. All rates below are per turn.

---

## Taxation (the central dial)

The kingdom earns gold by levying taxes on its people. Tax rate is **0–100%**,
set by the player at any time (instant, `cmd:setTax`).

**Gold and production trade off inversely:**

```
goldPerCivilian   = 0.4 × taxRate                          // 0.4 g/turn at 100% tax
outputPerProducer = 50 × buildingLevel × (1 − taxRate)     // per worker; 50/turn per level at 0% tax
```

**Production buildings are UNCAPPED and level-scaled.** The Grange, Mason's
Quarry, Deepvein Mine, and Sawyer's Mill do **not** limit worker slots — you may
assign as many farmers/quarrymen/miners/lumberjacks as your population allows.
Instead each **building level lifts every worker's output**: a worker produces
`50 × buildingLevel` units/turn at 0% tax — **50/turn at level 1 up to 500/turn
at level 10** (`PRODUCTION_PER_WORKER_PER_LEVEL = 50`). Merchants and researchers
are still slot-capped by their halls (Market Square / Collegium, 20 × level).

| Tax rate | Gold / civilian / turn | Gold / civilian / DAY |
|----------|------------------------|------------------------|
| 0%       | 0                      | 0                      |
| 25%      | 0.1                    | 14.4                   |
| **50% (default, recommended)** | **0.2** | **28.8**      |
| 75%      | 0.3                    | 43.2                   |
| 100%     | 0.4                    | 57.6                   |

(Producer output per worker is `50 × buildingLevel × (1 − taxRate)` units/turn,
before race and research bonuses.)

> **Rebalanced (was 40 g at 100%, sim-driven, twice):** at 40 g an idle
> 100-pop empire banked ~700k gold in three days; at 4 g the 60-day sim
> still hoarded 5.3M and treasury was 93% of ranking score. The chosen
> anchor: **one civilian at 50% tax nets ~29 g/day**, which makes a
> mid-game army cost days of income to rebuild (military losses hurt),
> keeps the starting purse calibrated to 2–3 entry buildings
> (`buildings.md`), and holds treasury at a few % of score. Income came
> down rather than costs going up so every cost table in the specs holds.
> Gold is scarce and resources are bulk — that's the intended texture.

- **Every civilian pays tax** — workers, merchants, researchers, spies,
  scouts, and idle peasants alike.
- 50% is the recommended default: the empire produces both gold and resources.
- Extremes are situational tools: 100% is a war chest at the cost of a frozen
  economy; 0% is maximum rebuild speed with no income.
- **Softening the penalty:** Statecraft research multiplies post-tax output
  (`research.md`), and the Clan Hall reduces the penalty itself — 100% felt
  at hall 1 down to 50% at hall 4 (`clans.md`). Both stack:
  `output = 50 × buildingLevel × (1 − taxRate × hallPenaltyFactor) × statecraftMult`.

## Producer outputs (per worker, at 0% tax, before race bonuses)

| Producer   | Works at        | Output / turn (per worker)        |
|------------|-----------------|-----------------------------------|
| Farmer     | The Grange      | 50 × Grange level food (50 at L1 → 500 at L10) |
| Quarryman  | Mason's Quarry  | 50 × Quarry level stone           |
| Miner      | Deepvein Mine   | 50 × Mine level ore               |
| Lumberjack | Sawyer's Mill   | 50 × Mill level wood              |
| Merchant   | Market Square   | runs trade caravans — carries 1,000 × Market Square level in goods (see `market.md`) |
| Researcher | The Collegium   | 20 research points (slot-capped)  |

- All outputs scale by `(1 − taxRate)` and are then modified by race bonuses.
- Merchants produce no resources — they haul caravans to the Grand Bazaar and
  sell for player-set prices (`market.md`). They still pay tax like every civilian.
- Spies and scouts produce nothing and cost nothing — they hold ordinary
  day jobs as cover and pay taxes like anyone else.

## Food — population upkeep

**People eat; armies don't march on extra rations.** There is no food cost
for attacks (they're instantaneous) — food is a steady population upkeep:

```
foodConsumed = 0.1 × (civilians + regular troops) per turn    // tunable
```

- Mercenaries feed themselves (their gold upkeep covers it).
- Deducted every tick, before production is added.

**Starvation — if food hits 0, everything stops:**
- No production (any resource), no research, no tax income.
- No population growth; no stamina recovery.
- Cannot launch attacks (starving armies won't march). You can still defend,
  build, train, and **buy food** — the Grand Bazaar and your farmers are the
  way out.
- Nobody dies or scatters from hunger; the empire just freezes until fed.

Scale check: 100 pop eats 10/turn — one farmer at 50% tax feeds 100 people.
At 10,000 pop it's 1,000/turn — ~100 working farmers. Food farming grows
with the empire but never dominates it.

## Military upkeep — only mercenaries

**Regular military is free to maintain.** Troops, siege engineers, and siege
weapons pay no tax and cost no upkeep — keeping the economy simple.

| Unit                       | Tax paid | Upkeep                  |
|----------------------------|----------|-------------------------|
| Troops (all types, tiers)  | none     | none                    |
| Siege engineers / weapons  | none     | none                    |
| **Mercenaries**            | none     | **1 gold/turn (tunable — ≈ 5 civilians' net income each)** |

**Mercenary rules:**
- Upkeep must be paid every turn; **unpaid mercenaries defect** — all at
  once, they're professionals (implemented).
- Capped at **25% of your regular army's headcount** — sellswords supplement
  an army, they never become one.
- Hired from the Black Market in the same **arms and tiers** as your regulars
  (footman/archer/cavalry × light/medium/heavy) — and needing the **same
  buildings** to raise (a heavy-cavalry sellsword needs Knights' Stables 3 +
  Forge 3). Bought with **gold only**, no peasants: **500 gold each
  (placeholder)** × tier multiplier (×1 / ×2 / ×4) × the race's `mercCost`
  factor × Clan Wonder discount. They fight as their type/tier but **die before
  your matching regulars** in combat.

## Worked example (50% tax)

Empire: 100 civilians — 20 farmers, 20 quarrymen, 20 miners, 20 lumberjacks,
10 idle, 10 researchers — plus 40 troops and 10 mercenaries.

```
Tax income:        100 × 0.2       =    20 gold/turn   (2,880/day)
Mercenary upkeep:   10 × 1         =   −10 gold/turn
────────────────────────────────────────────────────
Net gold:                               10 gold/turn
Resources:  200 food, 200 stone, 200 ore, 200 wood + 100 research/turn
```

(Ten sellswords eat half this empire's gross tax income — sellswords are a
premium, exactly as intended.)

(Mercenary cap check: 10 mercs ≤ 25% of 40 regular troops ✓)

## Open / TBD

- [ ] Mercenary upkeep rate (10 gold/turn is a placeholder) and defection
      details (all at once vs N per turn).
- [x] Merchant role — resolved, see `market.md` (caravans to the Grand Bazaar).
- [x] Race modifiers — table in `architecture.md` (production per resource; tax income unmodified).
- [x] Food — population upkeep (0.1/person/turn), starvation freezes the empire. No army march costs; attacks are instantaneous.
