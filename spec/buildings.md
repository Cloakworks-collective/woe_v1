# War of Empires — Buildings

Two categories: **civilian** and **military**.

- **Levelled buildings** — one instance per empire, upgraded through levels
  1–10. All civilian buildings except Hearthstead are levelled.
- **Counted buildings** — build many instances: **Hearthstead** (houses 10
  people) and **Muster Hall** (houses 10 troops).

Resources: **gold, food, wood, stone, ore**. Food is never a build cost — it
feeds the population (see `economy.md`). **Ore is never a build cost either
— it is the war-metal, reserved entirely for arming troops (see Training
costs below).** Buildings cost **gold + wood + stone**.

---

## Build Cost Model

Every building costs gold, plus wood and stone in a **ratio that shifts with
level**. The total cost grows with level; the ratio below is how the
non-gold portion splits (ore is always 0).

### Civilian ratio (wood-heavy early → stone-heavy late, wood never irrelevant)

| Levels      | Wood | Stone | Ore  |
|-------------|------|-------|------|
| 1–3         | 60%  | 40%   | 0%   |
| 4–6         | 40%  | 60%   | 0%   |
| 7–8         | 30%  | 70%   | 0%   |
| 9–10 (top)  | 30%  | 70%   | 0%   |

### Military ratio (stone-heavy — its ore went into weapons, not walls)

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

### Cost scaling (tunable placeholder)

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

## Population Model

### Housing & capacity

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
> overflow buffers. (The premium Steward's build queue — `premium.md` —
> does not bend this: it issues ordinary build commands when they become
> affordable; people are never queued or buffered.)
>
> The same rule covers every specialist: merchants need Market Square slots,
> researchers need Collegium slots, spies and scouts need guild/lodge slots
> (20 per level, all of them). No free slot, no training — the building level
> always comes first. Only plain workers (farm/quarry/mine/mill labor) can be
> assigned as long as production slots allow, and those too are capped at
> 20 per building level.

### Growth rate (peasants/day)

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

### Wall damage penalty (temporary only)

Walls add nothing while intact or unbuilt. Damaged walls scare settlers:

```
wallPenalty = 1 − 0.5 × damagedFraction     // damagedFraction ∈ [0, 1]
```

- Fully rubbled walls = **−50% pop/day**.
- **Repairing fully restores the rate** — you return to exactly what your
  civilian buildings earn. No permanent loss, ever.

### Population roles

| Role         | Capacity gate                        | Function                        |
|--------------|--------------------------------------|---------------------------------|
| Idle peasant | Hearthsteads (10 each)               | Awaiting assignment             |
| Farmer       | The Grange: 20 slots/level           | Food production                 |
| Quarryman    | Mason's Quarry: 20 slots/level       | Stone production                |
| Miner        | Deepvein Mine: 20 slots/level        | Ore production                  |
| Lumberjack   | Sawyer's Mill: 20 slots/level        | Wood production                 |
| Merchant     | Market Square: 20 slots/level        | Trade caravans, 1k × lvl capacity (`market.md`) |
| Researcher   | The Collegium: 20 slots/level        | Research points                 |
| Spy          | Shadow Guild: 20 slots/level         | Espionage                       |
| Scout        | Ranger's Lodge: 20 slots/level       | Reconnaissance                  |
| Troop        | Muster Hall: 10 per hall             | Combat                          |

---

## Settlement Titles (computed — not a building)

There is no hall building to construct or manage. An empire's **settlement
title** is derived automatically from its total civilian building levels
(0–130). (Not to be confused with **eras** — the server seasons in
`victory.md`.)

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

## Civilian Buildings (13 levelled + Hearthstead)

| # | Building           | Levels | Per level                       | Function                                   |
|---|--------------------|--------|---------------------------------|--------------------------------------------|
| 1 | **The Grange**     | 1–10   | +20 farmer slots                | Food production                            |
| 2 | **Mason's Quarry** | 1–10   | +20 quarryman slots             | Stone production                           |
| 3 | **Deepvein Mine**  | 1–10   | +20 miner slots                 | Ore production                             |
| 4 | **Sawyer's Mill**  | 1–10   | +20 lumberjack slots            | Wood production                            |
| 5 | **Granary**        | 1–10   | +20,000 protected capacity      | Food storage                               |
| 6 | **Timberyard**     | 1–10   | +20,000 protected capacity      | Wood storage                               |
| 7 | **Mason's Yard**   | 1–10   | +20,000 protected capacity      | Stone storage                              |
| 8 | **Ironhold**       | 1–10   | +20,000 protected capacity      | Ore storage                                |
| 9 | **Counting House** | 1–10   | +20,000 protected gold capacity | Bank — protects gold from sieges           |
| 10| **Market Square**  | 1–10   | +20 merchant slots, +1k caravan capacity | Grand Bazaar access (`market.md`)   |
| 11| **The Collegium**  | 1–10   | +20 researcher slots            | Research / technologies                    |
| 12| **Shadow Guild**   | 1–10   | +20 spy slots                   | Train & run spies                          |
| 13| **Ranger's Lodge** | 1–10   | +20 scout slots                 | Train & run scouts                         |
| — | **Hearthstead**    | counted| houses 10 people each           | Population cap; growth stops when full     |

All 13 levelled buildings contribute equally to pop/day (≈ +0.76 per level);
**100/day requires every one of them at level 10** plus enough vacant housing.

### How storage protection works

- Capacity = **20,000 × level** per storage building (200k at level 10).
- Everything *inside* storage is fully protected from raids and sieges;
  everything above capacity sits **outside** and is lootable (`combat.md`
  takes 25% of what's outside). Same for gold: banked (≤ Counting House
  capacity) is safe, the rest is "unbanked."
- Bombardment damages storage-building **integrity**, to a floor of **50%**
  — artillery cracks a storehouse open but never levels it. Protected
  capacity scales with integrity: a half-wrecked Granary shelters half as
  much, spilling the rest outside for the follow-up **castle attack (siege)**.

### Building integrity (health) — the bombard model

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

---

## Military Buildings

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

### Wall level names

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

Training pipeline: peasant → **Muster Hall** (warrior) → equipped from
**Forge** stock → specialized at Drill Yard / Fletcher's Range /
Knights' Stables / War Foundry.

---

## Population → Troop Allocation & Training Costs

**All training and reassignment is instant.** Pacing comes from gold/resource
costs and building capacity, never from timers.

### Allocation flow

```
Idle Peasant ──(free, reversible)──────────► Worker (farmer/quarryman/miner/
     │                                        lumberjack/merchant/researcher)
     │                                        capped by building slots (20/lvl)
     │
     ├──(gold cost)───────────────────────► Spy / Scout
     │                                        capped 20/lvl of guild/lodge
     │
     └──(50 gold, needs Muster Hall slot)──► Warrior
                                               │
              (equipment cost + trainer lvl)   ▼
             Footman / Archer / Cavalry / Siege Engineer
```

- **Troop cap = Muster Halls × 10.** That IS the population-to-military
  allocation limit — no separate percentage rule.
- Worker assignment is free and freely reversible (it's just labor allocation).
- **Disband** a troop → equipment is lost, warrior returns.
- **Discharge** a warrior → peasant returns to civilian life, but only if
  there's a vacant Hearthstead slot (no housing, no discharge).

### Training costs (base = light tier; tunable)

**Ore is the war-metal.** Buildings need none, so every scrap a miner digs
goes into blades, arrowheads, and barding — troop ore costs are steep to
match, and a strong army is now the main reason to mine ore at all.

| Unit           | Trained at        | Gold | Wood | Stone | Ore | Notes                        |
|----------------|-------------------|------|------|-------|-----|------------------------------|
| Warrior        | Muster Hall       | 50   | —    | —     | —   | Prerequisite for all troops  |
| Footman        | Drill Yard        | 100  | 20   | —     | 90  | Sword, shield, mail — ore-hungry |
| Archer         | Fletcher's Range  | 100  | 40   | —     | 55  | Wood bow, ore arrowheads     |
| Cavalry        | Knights' Stables  | 300  | 20   | —     | 130 | Barding, lance, and blade — the hungriest for ore |
| Siege Engineer | War Foundry       | 200  | —    | —     | —   | Crews weapons (below)        |
| Spy            | Shadow Guild      | 300  | —    | —     | —   | Gold buys silence            |
| Scout          | Ranger's Lodge    | 200  | —    | —     | —   | —                            |

### Tier multiplier (equipment cost)

| Tier   | Cost multiplier | Combat power (approx) |
|--------|-----------------|------------------------|
| Light  | ×1              | 1                      |
| Medium | ×2              | ~1.8                   |
| Heavy  | ×4              | ~3                     |

Heavy costs slightly more per point of power, but each troop occupies one
Muster Hall slot regardless of tier — heavy armies are slot-efficient, which
is what you're really paying for.

### Siege — the War Foundry ladder (levels 1–10)

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

**How counters work:** defensive unlocks are permanent wall installations —
no purchase, no crew, always active when defending. Each counter reduces the
effectiveness of its paired offensive weapon by **75% (tunable)** in any
attack against you.

**Offensive gear** is purchased equipment, crewed by siege engineers:

| Weapon           | Gold | Wood | Stone | Ore | Engineers to crew |
|------------------|------|------|-------|-----|-------------------|
| Ropes & Grapples | 50   | 10   | —     | 5   | 1                 |
| Ladders          | 100  | 50   | —     | 10  | 1                 |
| Battering Ram    | 400  | 200  | —     | 50  | 2                 |
| Ballista         | 800  | 300  | 20    | 100 | 3                 |
| Trebuchet        | 2000 | 800  | 100   | 300 | 5                 |

Stone in ballista/trebuchet costs is ammunition. Siege gear is equipment, not
people — uncrewed gear cannot be fielded, and enemy spies can sabotage it.

---

## Deferred / TBD

- [ ] Clan buildings — separate system, designed later.
- [ ] baseCost values per building (the 1.5× curve and 50% gold share are placeholders).
- [x] Production rates and merchant income — resolved, see `economy.md` (tax-scaled: 20/turn at 0% tax; race modifiers still TBD).
- [ ] Storage capacity numbers per level.
- [x] Player-trade mechanics — resolved, see `market.md` (Grand Bazaar, caravan capacity 1k × Market Square level).
- [x] Research tree — resolved, see `research.md` (10 fields × 5 levels, Collegium-gated).
- [x] Wall integrity — resolved, see `combat.md` (ram 3%/round, trebuchet 5%/round, counters −75%; repair = damagedFraction × wall build cost × 0.5, fully restores pop rate).
