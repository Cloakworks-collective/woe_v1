# War of Empires — The Empire

The peacetime game: what you build, what it produces, what you study, and what
you trade. War is `combat.md`; the shadow war is `espionage.md`.

**Numbers live in `lib/constants/balance.ts`**, not here. This file explains the
shapes and the reasoning; that file holds the values, and the Balance Workbench
(`/admin/balance`) exposes every one of them with its rationale attached.

---

## The Economy

One turn = **10 minutes**. All rates below are per turn.

---

### Taxation (the central dial)

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
at level 10** (`PRODUCTION_PER_WORKER_PER_LEVEL = 50`). Merchants, researchers,
spies, and scouts are **uncapped too** — you need only the building, and its
level scales each unit's effect: every Collegium level lifts a scholar's RP/turn
(50 × level, same curve); every Market Square level adds 1,000 to each caravan's
capacity **and shortens its road to the Bazaar**; Shadow Guild and
Ranger's Lodge levels deepen each spy/scout's bite (`espionage.md`).

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
>, and holds treasury at a few % of score. Income came
> down rather than costs going up so every cost table in the specs holds.
> Gold is scarce and resources are bulk — that's the intended texture.

- **Every civilian pays tax** — workers, merchants, researchers, spies,
  scouts, and idle peasants alike.
- 50% is the recommended default: the empire produces both gold and resources.
- Extremes are situational tools: 100% is a war chest at the cost of a frozen
  economy; 0% is maximum rebuild speed with no income.
- **Softening the penalty:** Statecraft research multiplies post-tax output
 , and the Clan Hall reduces the penalty itself — 100% felt
  at hall 1 down to 50% at hall 4 (`clans.md`). Both stack:
  `output = 50 × buildingLevel × (1 − taxRate × hallPenaltyFactor) × statecraftMult`.

### Producer outputs (per worker, at 0% tax, before race bonuses)

| Producer   | Works at        | Output / turn (per worker)        |
|------------|-----------------|-----------------------------------|
| Farmer     | The Grange      | 50 × Grange level food (50 at L1 → 500 at L10) |
| Quarryman  | Mason's Quarry  | 50 × Quarry level stone           |
| Miner      | Deepvein Mine   | 50 × Mine level ore               |
| Lumberjack | Sawyer's Mill   | 50 × Mill level wood              |
| Merchant   | Market Square   | runs trade caravans — carries 1,000 × Market Square level in goods |
| Researcher | The Collegium   | 50 × Collegium level research points (50 at L1 → 500 at L10; uncapped) |

- All outputs scale by `(1 − taxRate)` and are then modified by race bonuses.
- Merchants produce no resources — they haul caravans to the Grand Bazaar and
  sell for player-set prices. They still pay tax like every civilian.
- Spies and scouts produce nothing and cost nothing — they hold ordinary
  day jobs as cover and pay taxes like anyone else.

### Food — population upkeep

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

### Military upkeep — only mercenaries

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
- Capped at **a third of the REGULARS of their own arm** (footmen gate merc
  footmen, rangers gate merc rangers), enforced continuously rather than only at
  hire: when those regulars die the sellswords who can no longer be commanded
  are paid off and ride away. They also need barracks beds. Sellswords supplement
  an army, they never become one.
- Hired from the Black Market in the same **arms and tiers** as your regulars
  (footman/archer/cavalry × light/medium/heavy) — and needing the **same
  buildings** to raise (a heavy-cavalry sellsword needs Knights' Stables 3 +
  Forge 3). Bought with **gold only**, no peasants: **500 gold each
  (placeholder)** × tier multiplier (×1 / ×2 / ×4) × the race's `mercCost`
  factor × Clan Wonder discount. They fight as their type/tier but **die before
  your matching regulars** in combat.

### Worked example (50% tax)

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

---

## Buildings

Two categories: **civilian** and **military**.

- **Levelled buildings** — one instance per empire, upgraded through levels
  1–10. All civilian buildings except Hearthstead are levelled.
- **Counted buildings** — build many instances: **Hearthstead** (houses 10
  people) and **Muster Hall** (houses 10 troops).

Resources: **gold, food, wood, stone, ore**. Food is never a build cost — it
feeds the population. **Ore is never a build cost either
— it is the war-metal, reserved entirely for arming troops (see Training
costs below).** Buildings cost **gold + wood + stone**.

---

### Build Cost Model

Every building costs gold, plus wood and stone in a **ratio that shifts with
level**. The total cost grows with level; the ratio below is how the
non-gold portion splits (ore is always 0).

#### Civilian ratio (wood-heavy early → stone-heavy late, wood never irrelevant)

| Levels      | Wood | Stone | Ore  |
|-------------|------|-------|------|
| 1–3         | 60%  | 40%   | 0%   |
| 4–6         | 40%  | 60%   | 0%   |
| 7–8         | 30%  | 70%   | 0%   |
| 9–10 (top)  | 30%  | 70%   | 0%   |

#### Military ratio (stone-heavy — its ore went into weapons, not walls)

| Levels      | Wood | Stone | Ore  |
|-------------|------|-------|------|
| 1–3         | 45%  | 55%   | 0%   |
| 4–6         | 30%  | 70%   | 0%   |
| 7–8         | 25%  | 75%   | 0%   |
| 9–10 (top)  | 20%  | 80%   | 0%   |

Wood floors at 30% (civilian) / 20% (military) so Sawyer's Mills stay
economically relevant through the endgame — scaffolding, hoardings, roof
timbers, and siege platforms never go out of demand. The ore share that used
to go into walls now goes into swords: your miners feed the army, not the
masons.

#### Cost scaling (tunable placeholder)

```
resourceCost(level) = baseCost × 1.5^(level − 1)   // split by ratio table
goldCost(level)     = 0.5 × resourceCost(level)    // gold always required
```

**baseCost values** — calibrated so the starting purse (5,000 gold + 1,000
each resource, `architecture.md`) buys **2–3 entry-level buildings**:

| Category                        | baseCost (resources) | Level-1 example (gold + wood / stone) |
|---------------------------------|----------------------|------------------------------------|
| Civilian (levelled)             | 800                  | 400g + 480 wood / 320 stone        |
| Military (levelled/tiered)      | 1,200                | 600g + 540 wood / 660 stone        |
| Hearthstead (per instance)      | 300                  | 150g + 180 wood / 120 stone        |
| Muster Hall (per instance)      | 500                  | 250g + 225 wood / 275 stone        |

(Two civilian level-1s ≈ 960 wood — right at the starting wood supply; the
third build waits on production. Working as intended.)

Counted buildings (Hearthstead, Muster Hall) have a flat per-instance cost
using the level 1–3 ratio of their category.

**All construction and upgrades are instant** — pay the cost, get the level.
There are no build timers or queues; pacing comes entirely from resource
accumulation.

---

### Population Model

#### Housing & capacity

- **Hearthstead** (counted): each houses **10 people** — civilian population cap.
- **If housing is full, no new population arrives.**
- **Troops live in Muster Halls** (10 per hall), not Hearthsteads — training a
  peasant frees a civilian slot and consumes a barracks slot.

> **Design pillar — build capacity ahead of growth.** Settlers arrive every
> day; arrivals that find no vacant Hearthstead are **lost, not queued**. A
> player earning 40/day with 3 free slots gets 3 — the other 37 walk on. The
> same applies to the military: no free Muster Hall slot, no training, no
> matter how much gold is banked. Staying ahead of your own growth curve —
> housing for tomorrow's settlers, barracks before the war, not during it —
> is the management game. This is intentional; never add arrival queues or
> overflow buffers. (The premium Steward's build queue — `clans.md` —
> does not bend this: it issues ordinary build commands when they become
> affordable; people are never queued or buffered.)
>
> **Workers/specialists are UNLIMITED** — there are no slot caps. You only need
> the relevant building to exist (level ≥ 1); its **level scales how effective
> each worker/unit is**, not how many you may have: farmers/quarrymen/miners/
> lumberjacks and researchers make `50 × level`/turn (empire.md, empire.md);
> each Market Square level adds 1,000 to every caravan's capacity AND shortens the
> road to the Bazaar (100 turns to arrive at L1 → 10 at L10) (empire.md);
> each Shadow Guild / Ranger's Lodge level makes every spy / scout more effective
> (espionage.md). Housing (Hearthstead) and barracks (Muster Hall) beds are the
> only real caps — population and standing-army size.

#### Growth rate (peasants/day)

Growth scales with **total civilian development**. There are 13 levelled
civilian buildings × 10 levels = **130 civilian levels**. Maxing them all
is the only way to reach 100/day:

```
L          = sum of all civilian building levels        // 0 … 130
rawGrowth  = 1 + 99 × (L / 130)                          // 1/day … 100/day
popPerDay  = max(1, floor(rawGrowth × wallPenalty))
popPerDay  = min(popPerDay, vacantHousingSpace)
```

- Fresh empire: 1/day. All 13 civilian buildings at level 10: 100/day.
- Each civilian building level is worth ≈ +0.76/day.
- Nothing gates building levels except cost — the escalating price curve and
  shifting resource ratios pace progression naturally.

#### Wall damage penalty (temporary only)

Walls add nothing while intact or unbuilt. Damaged walls scare settlers:

```
wallPenalty = 1 − 0.5 × damagedFraction     // damagedFraction ∈ [0, 1]
```

- Fully rubbled walls = **−50% pop/day**.
- **Repairing fully restores the rate** — you return to exactly what your
  civilian buildings earn. No permanent loss, ever.

#### Population roles

All worker/unit roles are **unlimited** — you only need the building; its level
scales the per-unit effect.

| Role         | Needs (level ≥ 1)  | Building level scales…                          |
|--------------|--------------------|-------------------------------------------------|
| Idle peasant | Hearthsteads (10 each — the one real cap) | Awaiting assignment      |
| Farmer       | The Grange         | Food/farmer: 50 × level/turn                     |
| Quarryman    | Mason's Quarry     | Stone/quarryman: 50 × level/turn                 |
| Miner        | Deepvein Mine      | Ore/miner: 50 × level/turn                        |
| Lumberjack   | Sawyer's Mill      | Wood/lumberjack: 50 × level/turn                 |
| Merchant     | Market Square      | Caravan capacity 1,000 × level; delivery `max(10,110−10×level)` turns |
| Researcher   | The Collegium      | Research/scholar: 50 × level/turn                |
| Spy          | Shadow Guild       | Spy-mission effect (`espionage.md`)              |
| Scout        | Ranger's Lodge     | Recon sharpness & spy-catch level (`espionage.md`) |
| Troop        | Muster Hall: 10 per hall             | Combat                          |

---

### Settlement Titles (computed — not a building)

There is no hall building to construct or manage. An empire's **settlement
title** is derived automatically from its total civilian building levels
(0–130). (Not to be confused with **eras** — the server seasons in
`overview.md`.)

| Title       | Total civilian levels | Signals                                  |
|-------------|-----------------------|------------------------------------------|
| **Village** | 0–39                  | Early game; wood-heavy economy           |
| **Town**    | 40–89                 | Mid game; stone economy ramping          |
| **City**    | 90–130                | End game; stone = ore, heavy tiers afield|

The title is cosmetic-but-visible: shown in the UI, reported by scouts
("a Town of the Elves"), and available to matchmaking / anti-farming rules.
It gates nothing — all buildings are available from the start, paced purely
by cost.

---

### Civilian Buildings (13 levelled + Hearthstead)

| # | Building           | Levels | Per level                       | Function                                   |
|---|--------------------|--------|---------------------------------|--------------------------------------------|
| 1 | **The Grange**     | 1–10   | +50 food/turn per farmer        | Food production (farmers unlimited)        |
| 2 | **Mason's Quarry** | 1–10   | +50 stone/turn per quarryman    | Stone production (quarrymen unlimited)     |
| 3 | **Deepvein Mine**  | 1–10   | +50 ore/turn per miner          | Ore production (miners unlimited)          |
| 4 | **Sawyer's Mill**  | 1–10   | +50 wood/turn per lumberjack    | Wood production (lumberjacks unlimited)    |
| 5 | **Granary**        | 1–10   | +20,000 protected capacity      | Food storage                               |
| 6 | **Timberyard**     | 1–10   | +20,000 protected capacity      | Wood storage                               |
| 7 | **Mason's Yard**   | 1–10   | +20,000 protected capacity      | Stone storage                              |
| 8 | **Ironhold**       | 1–10   | +20,000 protected capacity      | Ore storage                                |
| 9 | **Counting House** | 1–10   | +20,000 protected gold capacity | Bank — protects gold from sieges           |
| 10| **Market Square**  | 1–10   | +1,000 caravan capacity & −10 turns delivery time per merchant | Grand Bazaar access; merchants unlimited; caravan reaches market in 100 turns @L1 → 10 @L10 |
| 11| **The Collegium**  | 1–10   | +50 research/turn per scholar   | Research / technologies (scholars unlimited) |
| 12| **Shadow Guild**   | 1–10   | +10% spy-mission effect         | Train & run spies (spies unlimited)        |
| 13| **Ranger's Lodge** | 1–10   | sharper recon & higher spy-catch | Train & run scouts (scouts unlimited)     |
| — | **Hearthstead**    | counted| houses 10 people each           | Population cap; growth stops when full     |

All 13 levelled buildings contribute equally to pop/day (≈ +0.76 per level);
**100/day requires every one of them at level 10** plus enough vacant housing.

#### How storage protection works

- Capacity = **20,000 × level** per storage building (200k at level 10).
- Everything *inside* storage is fully protected from raids and sieges;
  everything above capacity sits **outside** and is lootable (`combat.md`
  takes 50–70% of what's outside — see the loot bands in `combat.md`). Same for gold: banked (≤ Counting House
  capacity) is safe, the rest is "unbanked."
- Bombardment damages storage-building **integrity**, to a floor of **50%**
  — artillery cracks a storehouse open but never levels it. Protected
  capacity scales with integrity: a half-wrecked Granary shelters half as
  much, spilling the rest outside for the follow-up **castle attack (siege)**.

#### Building integrity (health) — the bombard model

Every building carries an **integrity** of 0.5–1.0 (full when unbombarded).
Bombard is the only thing that lowers it (walls first, then random town
buildings; `combat.md`), and it never drops below the **50% floor**. Integrity
has teeth beyond storage:

| Building type                 | What its integrity scales                          |
|-------------------------------|----------------------------------------------------|
| Storage (Granary, etc.)       | protected capacity (goods above it spill, lootable)|
| Production (Grange/Quarry/Mine/Mill) | that resource's output per turn             |
| The Collegium                 | research points banked per turn                    |
| The Walls                     | wall defence bonus **and** the pop-growth penalty  |

**Repair** any building for `damagedFraction × build cost × 0.5` (same
formula as walls) to restore full integrity. The UI shows a health bar per
building.

**A cracked work cannot be raised — repair first.** A building at less than
100% integrity **cannot be upgraded** until it is mended (`build()` throws
`damaged`). Masons will not add a storey to a broken one. This gives bombard a
second bite: besides cutting output, it *stalls the victim's growth* until they
pay the repair, so a raid costs the defender tempo as well as goods.

- Applies to the Walls too (their integrity lives on `wallIntegrity`); use
  `structureIntegrity()` when you mean "is this thing whole?" for any structure.
- **Founding is never blocked** — only levels above the first, since a building
  that doesn't exist yet cannot be damaged.
- Hearthsteads and Muster Halls are unaffected in practice: they are not on the
  `BOMBARDABLE` list, so they can never crack.
- The Steward's build queue and standing orders go through the same `build()`,
  so a damaged head simply **waits** (keeping its order) until you repair it —
  exactly as it already waits on an unaffordable cost.
- **Clan works follow the same rule** (`buildClanBuilding`): a bombarded Clan
  Storage, Hall, or Wonder must be mended from the pool before it can be raised.

---

### Military Buildings

Troops come in three tiers — **light, medium, heavy** — and each troop trainer
has exactly **3 levels that map 1:1 to those tiers**. Building level N = you
can train tier-N units of that type. (Siege is different — see the War
Foundry's own 10-level ladder below.)

| Building             | Type     | Levels | Function                                                       |
|----------------------|----------|--------|----------------------------------------------------------------|
| **Muster Hall**      | counted  | —      | Barracks. Converts peasants to troops; houses **10 troops** each |
| **Drill Yard**       | tiered   | 1–3    | **Footmen**: light → medium → heavy                            |
| **Fletcher's Range** | tiered   | 1–3    | **Archers**: light → medium → heavy                            |
| **Knights' Stables** | tiered   | 1–3    | **Cavalry**: light → medium → heavy                            |
| **The Forge**        | tiered   | 1–3    | Weapons & armour stock: light → medium → heavy                 |
| **War Foundry**      | 1–10     | —      | Siege engineering: alternating offense/defense unlocks (below) |
| **The Walls**        | 1–10     | —      | Defence, named per level (below). No pop bonus intact; damaged → up to −50% pop/day until repaired |

**Tier gating:** trainer level 2 requires Forge 2; trainer level 3 requires
Forge 3 — the Forge is the military spine, and its steep costs pace tier
progression. Training a tier consumes matching Forge stock — e.g. heavy
cavalry needs Knights' Stables 3 **and** Forge 3.

**Tiered building costs** use the military ratio bands: level 1 = the 1–3
ratio, level 2 = the 4–6 ratio, level 3 = the 9–10 ratio (stone-heavy, no ore).

#### Wall level names

| Level | Name                  | Flavor                                              |
|-------|-----------------------|-----------------------------------------------------|
| 1     | **Timber Palisade**   | Sharpened stakes ringing the village                |
| 2     | **Earthen Rampart**   | Packed-earth bank and ditch behind the stakes       |
| 3     | **Motte & Bailey**    | Raised mound and fortified yard                     |
| 4     | **Stone Footings**    | First courses of quarried stone replace the timber  |
| 5     | **Curtain Wall**      | Full stone circuit with a walkway                   |
| 6     | **Flanking Towers**   | Round towers command every approach                 |
| 7     | **Machicolated Wall** | Overhanging galleries rain stones on attackers      |
| 8     | **The Barbican**      | Fortified gatehouse, drawbridge, and murder-holes   |
| 9     | **Concentric Walls**  | A second inner circuit — walls within walls         |
| 10    | **The Citadel**       | A mountain of stone; armies break upon it           |

Training pipeline: peasant → **footman / archer / cavalry** in a single step,
trained at the Drill Yard / Fletcher's Range / Knights' Stables. You pick the
class *and* tier up front; each tier draws matching **Forge** stock (tier N
needs trainer N **and** Forge N) and consumes a free **Muster Hall** bed. There
is **no intermediate "warrior" step** — peasants are armed directly.
Sellswords are hired the same way (same buildings), and siege engineers are
trained at the War Foundry.

---

### Population → Troop Allocation & Training Costs

**All training and reassignment is instant.** Pacing comes from gold/resource
costs and building capacity, never from timers.

#### Allocation flow

```
Idle Peasant ──(free, reversible)──────────► Worker (farmer/quarryman/miner/
     │                                        lumberjack/merchant/researcher)
     │                                        capped by building slots (20/lvl)
     │
     ├──(gold cost)───────────────────────► Spy / Scout
     │                                        capped 20/lvl of guild/lodge
     │
     ├──(gold + ore; trainer lvl = tier, ──► Footman / Archer / Cavalry
     │   Forge lvl = tier; Muster Hall slot)  at light / medium / heavy
     │
     └──(gold; needs War Foundry) ─────────► Siege Engineer
```

- **Troop cap = Muster Halls × 10.** That IS the population-to-military
  allocation limit — no separate percentage rule.
- Worker assignment is free and freely reversible (it's just labor allocation).
- **Discharge** a troop → the soldier returns straight to civilian life and its
  equipment is lost, but only if there's a vacant Hearthstead slot **and** the
  guard stays above the 30% scatter line (no housing, or would-scatter → no
  discharge). There is no separate warrior pool to disband into.

#### Training costs (base = light tier; tunable)

**Ore is the war-metal.** Buildings need none, so every scrap a miner digs
goes into blades, arrowheads, and barding — troop ore costs are steep to
match, and a strong army is now the main reason to mine ore at all.

Peasants train **directly** into footmen/archers/cavalry — there is no warrior
step. The old 50-gold muster levy is folded into each troop's gold cost. Costs
below are the **per-light** figure; medium ×2, heavy ×4 (equipment multiplier).

| Unit           | Trained at        | Gold | Wood | Stone | Ore | Notes                        |
|----------------|-------------------|------|------|-------|-----|------------------------------|
| Footman        | Drill Yard        | 150  | 20   | —     | 90  | Muster levy + sword, shield, mail |
| Archer         | Fletcher's Range  | 150  | 40   | —     | 55  | Muster levy + bow, ore arrowheads |
| Cavalry        | Knights' Stables  | 350  | 20   | —     | 130 | Muster levy + barding, lance, blade — hungriest for ore |
| Siege Engineer | War Foundry       | 200  | —    | —     | —   | Crews weapons (below)        |
| Spy            | Shadow Guild      | 300  | —    | —     | —   | Gold buys silence            |
| Scout          | Ranger's Lodge    | 200  | —    | —     | —   | —                            |

Tier N (medium/heavy) needs the trainer **and** the Forge at level N; the cost
multiplier (×1 / ×2 / ×4) applies to the whole row above.

#### Tier multiplier (equipment cost)

| Tier   | Cost multiplier | Combat power (approx) |
|--------|-----------------|------------------------|
| Light  | ×1              | 1                      |
| Medium | ×2              | ~1.8                   |
| Heavy  | ×4              | ~3                     |

Heavy costs slightly more per point of power, but each troop occupies one
Muster Hall slot regardless of tier — heavy armies are slot-efficient, which
is what you're really paying for.

#### Siege — the War Foundry ladder (levels 1–10)

The War Foundry alternates **offensive weapon → its defensive counter**, five
pairs across ten levels. Only a level-10 foundry owns the complete kit; every
empire below that has holes in its siege game — attacks it can't mount, or
counters it doesn't have.

| Lvl | Side      | Unlock               | Effect                                                       |
|-----|-----------|----------------------|--------------------------------------------------------------|
| 1   | Offense   | **Ropes & Grapples** | Cheap escalade; small wall-breach bonus                      |
| 2   | Defense   | **Bill-hooks**       | Wall crews cut climbing ropes — counters Ropes & Grapples    |
| 3   | Offense   | **Ladders**          | Mass escalade; solid breach bonus                            |
| 4   | Defense   | **Fork Poles**       | Topple ladders off the walls — counters Ladders              |
| 5   | Offense   | **Battering Ram**    | Direct gate/wall damage                                      |
| 6   | Defense   | **Boiling Oil**      | Scalds ram crews at the gate — counters Battering Ram        |
| 7   | Offense   | **Ballista**         | Bolt fire: anti-personnel + shoots at enemy siege equipment  |
| 8   | Defense   | **Hoardings**        | Covered galleries shelter wall troops — counters Ballista    |
| 9   | Offense   | **Trebuchet**        | The wall-breaker: massive wall + proportional troop damage   |
| 10  | Defense   | **Counter-Engine**   | Defender's own trebuchet duels attacker engines — counters Trebuchet |

**How counters work:** defensive counters are **purchased, crewed equipment**,
not permanent installations — bought like offensive gear (each gated by its War
Foundry level) and **manned by engineers when you defend**. Each crewed counter
**cancels one incoming enemy engine of its paired weapon, one-for-one** — there
is no flat percentage. Field enough of a counter and the whole matching salvo is
stopped; field fewer and only that many are cancelled, the surplus still fires.
On defence, engineers man the counters first (heaviest-crew first), then any
spare engineers crew your own offensive engines to fire back (see `combat.md`).

**Offensive gear** — purchased equipment, crewed by siege engineers:

| Weapon           | Gold | Wood | Stone | Ore | Crew | Foundry |
|------------------|------|------|-------|-----|------|---------|
| Ropes & Grapples | 50   | 10   | —     | 5   | 1    | 1       |
| Ladders          | 100  | 50   | —     | 10  | 1    | 3       |
| Battering Ram    | 400  | 200  | —     | 50  | 2    | 5       |
| Ballista         | 800  | 300  | 20    | 100 | 3    | 7       |
| Trebuchet        | 2000 | 800  | 100   | 300 | 5    | 9       |

**Defensive counters** — bought & crewed the same way; each cancels its paired
offensive weapon one-for-one:

| Counter        | Cancels        | Gold | Wood | Stone | Ore | Crew | Foundry |
|----------------|----------------|------|------|-------|-----|------|---------|
| Bill-hooks     | Ropes & Grapples | 50   | 10   | 5     | 5   | 1    | 2       |
| Fork Poles     | Ladders        | 100  | 50   | 10    | 10  | 1    | 4       |
| Boiling Oil    | Battering Ram  | 400  | 100  | 100   | 50  | 2    | 6       |
| Hoardings      | Ballista       | 800  | 300  | 200   | 100 | 3    | 8       |
| Counter-Engine | Trebuchet      | 2000 | 800  | 200   | 300 | 5    | 10      |

Stone in the heavier costs is ammunition. Siege gear is equipment, not people —
uncrewed gear (offensive or defensive) cannot be fielded, and enemy spies can
sabotage it.

---

---

## Research — the Collegium

Research is conducted by **researchers** — **unlimited** in number (no slot cap;
you only need a Collegium). Each Collegium level lifts how much research every
scholar makes: **50 × Collegium level RP per turn at 0% tax** (50 at level 1 up
to 500 at level 10), scaled by `(1 − taxRate)` and Statecraft like all producers
. A cracked Collegium slows every scholar proportionally.

---

### Mechanics

- **One active project at a time.** All RP generated each turn flow into it;
  the level completes the moment its cost is paid (no timers beyond earning
  the points).
- Switching projects is allowed, but **abandoning a field forfeits half** the
  progress banked toward its next level (`RESEARCH_SWITCH_LOSS = 0.5`): e.g. a
  field 40% of the way to its next level drops to 20% when you switch away. The
  UI shows each field's progress bar + a time-to-next-level ETA so you can
  finish a level before re-pointing the scholars.
- Charter holders can chart a **research queue** (`clans.md`): the Steward
  re-points the scholars to the next queued field-level as each completes.
  Same RP economy — the queue only automates the switching.
- **Every field has 5 levels. Each level = +20% efficiency**, so level 5
  = 100% of the field's maximum effect.

```
fieldEfficiency = level × 20%          // 0%, 20%, 40%, 60%, 80%, 100%
actualBonus     = fieldEfficiency × maxEffect
```

#### Global progressive cost — the order is the strategy

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

#### The Collegium sets speed, never a ceiling

There is **no level gate** — every field level is researchable at any time. The
**Collegium sets only the speed**: scholars are unlimited, and each Collegium
level lifts every scholar's RP/turn (50 × level). A small library still learns
anything, it just crawls; combined with the rising cost, a level-1 Collegium can
eventually research anything — it just takes a very long time. Raise the
Collegium (and assign more scholars) to go faster.

---

### The Ten Fields

| Field              | Name                | Affects                                        | Max effect (level 5)                          |
|--------------------|---------------------|------------------------------------------------|-----------------------------------------------|
| Food production    | **Crop Rotation**   | Farmer output                                  | +100% food/turn                               |
| Wood production    | **Forestry**        | Lumberjack output                              | +100% wood/turn                               |
| Stone production   | **Masonry**         | Quarryman output                               | +100% stone/turn                              |
| Ore production     | **Deep Smelting**   | Miner output                                   | +100% ore/turn                                |
| Spy efficiency     | **Tradecraft**      | Unlocks spy ops; agent strength against the enemy watch | +100% effectiveness              |
| Scout efficiency   | **Pathfinding**     | Scout intel depth/accuracy, evade detection    | +100% effectiveness                           |
| Army offense       | **The Art of War**  | Attack multiplier, all troops                  | +100% attack ⚠ tune                           |
| Army defense       | **Shieldcraft**     | Defence multiplier, all troops                 | +100% defence ⚠ tune                          |
| Siege weapons      | **Siegecraft**      | Siege weapon damage (and wall damage dealt)    | +100% siege damage                            |
| Tax resilience     | **Statecraft**      | Multiplies post-tax producer output            | ×2 production at level 5                      |

#### Statecraft (keeping people effective under high taxes)

A straight production multiplier applied **after** the tax penalty (the same
factor the Collegium's own scholars enjoy):

```
outputPerWorker = 50 × buildingLevel × (1 − taxRate × hallPenaltyFactor) × (1 + statecraftLevel × 0.2)
```

- Statecraft 5 = ×2: at 50% tax, workers produce as if untaxed (a level-1
  Grange farmer makes 25 → 50/turn).
- The tax trade-off itself never disappears — 100% tax is still 0 production
  (2 × 0 = 0). Statecraft softens the dial, never removes it.
- Stacks multiplicatively with the per-resource fields (Crop Rotation etc.).

+100% army offense/defense at level 5 is accepted as-is for now (it's a
1.25M-RP capstone); revisit only if playtesting shows it dominating.

---

### Costs (per level, any field)

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

- Full field: ~1.56M RP. Entire tree (12 fields): ~18.7M RP.
- **You cannot research everything.** Pacing at 100 researchers, 50% tax
  (1,000 RP/turn = 144,000 RP/day): level 1 in minutes, one *field* maxed in
  ~11 days, the full tree in ~3.5 months. Specialization is the design intent:
  empires choose an identity — the economist, the warlord, the spymaster —
  and dabbling (levels 1–2 everywhere, ~120k RP) stays cheap while mastery
  (level 5) is a serious commitment per field.
- Research generation competes with the tax dial: a war-chest economy
  (high tax) starves its own Collegium.

---

---

## The Grand Bazaar

One **centralized market shared by the whole server**. Merchants haul caravans
of resources there and sell them for gold at whatever price they set. There is
no NPC vendor — all supply is player caravans — and the market is **fully
anonymous**: no one ever sees who is selling or buying. You trade with *the
Bazaar*, never with a named player.

---

### What merchants do

A **merchant** (unlimited; you only need a Market Square, whose level scales each
caravan's capacity **and delivery speed** — see `empire.md`) runs caravans:

- Each merchant can carry **1,000 × Market Square level** worth of goods —
  1k at level 1 up to **10k at level 10**.
- One caravan = one listing = one resource type (food, wood, stone, or ore).
- A dispatched caravan must **travel to the Bazaar** before its goods go on
  sale (see *Delivery time* below).
- While their caravan is out (traveling **or** listed), the merchant is
  **busy** — more merchants means more simultaneous caravans.
- **Recalling costs you half the load** (`MARKET_RECALL_LOSS`). The merchant is
  freed and gold already earned is untouched, but only 50% of the remaining
  goods reach your stores — see *Recall* below.
- Merchants pay tax like every civilian; caravans themselves are free to send.

### Delivery time (Market Square level)

Goods are **not** listed the instant you dispatch — the caravan rides to the
Bazaar first, and a bigger Market Square keeps faster roads and runners.
Delivery time falls **linearly** with the Market Square level:

```
caravanDeliveryTurns(level) = max(10, 110 − 10 × level)
// level 1 → 100 turns, level 5 → 60, level 10 → 10 (floor)
```

Until a caravan **arrives** (`arrivesAtTick = createdTick + caravanDeliveryTurns`),
its goods do **not** count toward market price or supply and **cannot be
bought**. The market UI shows each of your caravans' journey and its ETA.
Raising the Market Square is therefore a double win: bigger loads *and* fresher
goods reaching the market sooner.

### How trading works

**Selling:**
1. Load a caravan: pick a resource, an amount (≤ capacity), and an **ask price
   per unit in gold** — a **whole number** in the **2–19** band
   (`MARKET_PRICE_MIN`..`MARKET_PRICE_MAX`). The band sits strictly *inside* the
   Black Market's spread (below), so a player caravan always beats the fence.
2. The caravan **travels** to the Bazaar (delivery time above). On arrival it
   joins the anonymous order book. Nobody sees your name, only the aggregate
   supply.
3. As your goods sell, gold arrives immediately; the merchant frees up when
   the caravan sells out or is recalled.

**Buying:**
- Buyers never see or choose individual listings. Each resource shows one
  number: the **market price** (the current cheapest **arrived** ask).
- You buy N units *from the market*; the order fills from the cheapest asks
  upward, crossing into higher-priced caravans as cheaper ones empty.
  En-route caravans are skipped — only arrived goods can fill you.
- Goods deliver to the buyer instantly. Partial fills of a caravan are normal.

**Price discovery:** the market price moves as supply dictates — sellers
undercut each other to be the ask that fills next; heavy buying eats the
cheap end and the price climbs. War zones starve and prices spike; peacetime
gluts crash them. The UI shows current market price and recent price history
per resource, never counterparties.

```
caravanCapacity     = 1,000 × marketSquareLevel        // per merchant
caravanDeliveryTurns = max(10, 110 − 10 × marketLevel)  // travel time to Bazaar
marketPrice         = lowest ARRIVED ask listed        // per resource
```

### Market fee (gold sink — tunable)

A **5% fee on every sale**, paid by the seller, burned (not given to anyone).
Persistent economies mint gold endlessly through taxes; the Bazaar is the
drain that keeps prices meaningful. Tunable; set to 0 to disable.

### Recall — half the load is lost

Turning a caravan around returns only **50%** of its remaining goods
(`MARKET_RECALL_LOSS`); the rest is lost on the road. It works en route or
after arrival, and the merchant is freed either way.

The penalty exists because a free recall makes the Bazaar a **raid-proof
warehouse**. Goods riding with a caravan are not in your stores, so they cannot
be plundered — without a cost, the optimal play is to post everything at an
absurd ask, watch for an incoming attack, and pull it all back untouched.
Losing half makes stashing goods there cost more than it saves, so what is on
the road is genuinely committed. If you only want the gold, the Black Market
pays for the goods outright instead of destroying them.

### Anti-abuse

Anonymity + cheapest-first filling is itself the main defense against
funneling: you cannot sell *to* a specific player. A deliberately underpriced
caravan goes to whoever buys next — dumping 10k ore at 2 gold is a donation
to the whole server, not to your friend. Coordinated snipes (friend lists
cheap, you buy instantly) remain possible but are racy and unreliable by
design.

- [ ] TBD: remaining guardrails if snipe-funneling proves common — minimum
      price floor or randomized fill delay. Observe real behavior first.

---

## The Black Market (the fence)

A **system** counterparty, not a player one. Everything settles **instantly**:
no caravan, no road, no order book, no one on the other side who might not show
up. You pay for that certainty in price — the fence is deliberately the worst
deal in the realm, in both directions.

```
  sell to the fence  ──►   1 gold / unit    BLACK_MARKET.SELL_PRICE   the FLOOR
  the Grand Bazaar   ──►   2 … 19 gold      MARKET_PRICE_MIN..MAX     where trade happens
  buy from the fence ──►  20 gold / unit    BLACK_MARKET.BUY_PRICE    the CEILING
```

### Why the spread is the whole design

The two prices **straddle** the player band, and that single property is what
makes an unlimited system counterparty safe:

- **No arbitrage loop.** Every round trip through the fence loses money. Buy at
  20 and dump at 1 and you are down 19 a unit; buy a player's caravan at 19 and
  dump at 1 and you are down 18. There is no cycle that ends with more than it
  started, so it cannot be farmed.
- **No free minting.** Selling is a gold *faucet* and a resource *sink*; buying
  is exactly the reverse. Neither creates both.
- **Players always prefer players.** Any legal ask (2–19) beats the fence for
  both parties, so the Bazaar stays the real market and the fence stays the
  option you take when you cannot wait 100 turns for a caravan.

Invariant to preserve when tuning: `SELL_PRICE < MARKET_PRICE_MIN` and
`MARKET_PRICE_MAX < BUY_PRICE`. Break either and the fence starts undercutting
player caravans or paying better than them, and the Bazaar empties.

### What it does

| | |
|---|---|
| **Sell resources** | Any amount you hold, at `SELL_PRICE` each. Instant gold. |
| **Buy resources** | Any amount you can afford, at `BUY_PRICE` each. Instant delivery, unlimited supply — the fence never runs out. |
| **Break up siege engines** | `SIEGE_SALVAGE_VALUE` (50%) of the build cost back in gold, wood and ore, **scaled by the engine's condition** — a wreck salvages for less than a whole machine, so mend before selling. |

The breaker's yard lives here rather than on the Siege Works page: building
engines is a military decision, but selling them is a *liquidity* one, and it
belongs beside the other place you go when the treasury is empty.

---
