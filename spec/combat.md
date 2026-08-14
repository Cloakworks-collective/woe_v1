# War of Empires — Combat

How a battle resolves, end to end. Every number lives in
`lib/constants/battleBalance.ts`; this file explains what they mean and why.

---

## The model

The whole engine is one line:

```
damage = basePower × (1 + Σ bonuses) × delivery
```

**Everything that fights has Power. Everything that can be hurt has Health.**
Troops, walls, buildings and siege engines all sit on ONE scale, so "damage"
means the same thing everywhere and a single formula covers the lot.

**Bonuses ADD.** Race, veterancy, research, the wall's edge, clan war,
entrenchment, unit-role bonuses — they sum into one pool. A new bonus therefore
contributes exactly what it says and never multiplies the whole stack. This is
what keeps the ceiling predictable as the game grows.

**Delivery MULTIPLIES**, and only three things qualify. Each answers *what
fraction of my power actually shows up?*

| Gate | Range | Meaning |
|---|---|---|
| Stamina | 0.5 – 1.0 | how much power you can bring |
| Effectiveness | 0 – 1.0 | how much applies to **this** target |
| Luck | 0.9 – 1.1 | how much lands today |

These are ratios, and ratios don't add. Folding the trebuchet's 30% wall
accuracy into the additive pool as "−70%" would leave a maxed attacker's
trebuchet doing ~79% of a ram's wall damage instead of 30% — the ram/trebuchet
distinction would die. Same for stamina (exhaustion would cost 15% instead of
50%) and luck (the fog of war would shrink to ±3%).

---

## The effectiveness matrix

The most important table in the game. Read a row to learn what a thing is FOR.
A zero means "cannot touch that target at all".

| | vs Troops | vs Walls | vs Buildings | vs Engines |
|---|---|---|---|---|
| Footmen / Archers / Cavalry | 100% | — | — | — |
| **Battering ram** | — | **100%** | — | — |
| **Trebuchet** | 15% | **30%** | 20% | 20% |
| Ballista | 10% | — | — | — |
| Ropes / Ladders / Siege tower | — | — | — | — (escalade) |
| Any defensive counter | — | — | — | **100%** |

The ram reads 100% against walls and zero against everything else: it is the
wall-breaker and nothing more. The trebuchet is the only engine that reaches
walls, buildings *and* other engines — but badly. That contrast is the siege
game, and **Siege Accuracy** research is what closes it (30%→60% vs walls,
20%→50% vs buildings, and sharper counter-battery fire for the defender too).

Counters read 100% because they are emplaced, purpose-built, and shooting at
something crawling toward them at walking pace.

---

## Unit power & health

Light tier; medium ×1.8 and heavy ×3 on **both** power and health.

| Unit | Power | Health |
|---|---|---|
| Footman | 10 | 20 |
| Archer | 12 | 12 |
| Cavalry | 15 | 16 |
| Siege engineer | 0 | 10 |

Engineers never attack. They crew engines and they die.

---

## Attack modes

Every attack costs **10 action turns** and runs up to 10 rounds.

| Mode | Fight | Walls & engines | Takes |
|---|---|---|---|
| **Raid** | field army only | none — open country | **goods**: everything outside storage |
| **Castle attack** | full assault | yes | **gold**: everything outside the vault |
| **Revenge** | full assault | yes | nothing — the payment is dead regulars |
| **Bombard** | engines only | trebuchets vs Counter-Engines | nothing — walls, then the town |

Raids take goods, castle attacks take gold, **never both**. That is what turns
*bombard the storehouses open → raid the spill → storm the castle for the
treasury* into a campaign rather than a button.

**Engineers take no part in a raid at all.** It is open country; there is
nothing to besiege.

### Protection

- **Era peace** — nobody may be attacked in the opening days of an age.
- **Newcomer shield** — 72h for anyone joining mid-era. Attacking drops your own.
- **The refusal band** — your captains refuse a target ranked ≥1.75× your score.
  This applies to **bombard** as well as assaults: its job is to stop a small
  account making itself a permanent nuisance to a large one with nothing to
  lose. A siege specialist is not locked out by it, because engineers and
  defensive works both count toward ranking (see `overview.md`) — the investment
  shows even though the siege train does not.
- **Vacation** — a departed ruler cannot be touched **at all**, revenge
  included. Nobody may depart while owing revenge; departure queues until every
  window against them closes. The queue is the guard, so combat needs no
  special case.

---

## Walls

```
edge      = +50%, FLAT, for any standing wall
health    = 10,000 × level²        (Citadel = 1,000,000)
```

**A wall is a wall.** The defence edge does not scale with level — what level
buys is how much punishment the masonry absorbs before it is rubble, and that
scales hard: a Citadel soaks a hundred times what a Timber Palisade does. This
is a far more interesting thing for a level to mean than a bigger percentage.

Damage persists between battles until repaired, and battered walls frighten off
settlers (see `empire.md`).

### Escalade

Escalade no longer bypasses the wall. Each tool delivers troops onto a **lesser**
wall, and the host fights at the blended average:

| Tool | Troops carried | Wall edge they face |
|---|---|---|
| — (bare stone) | — | +50% |
| Ropes & Grapples | 10 each | +30% |
| Ladders | 30 each | +20% |
| **Siege tower** | **100 each** | **+10%** |

Troops are assigned to the best tackle first. Bring enough and the wall stops
mattering; bring none and you are climbing sheer stone into the full edge.

### Arms on the wall

| Arm | On the parapet |
|---|---|
| Archers | **+20%** — lethal from cover |
| Footmen | **+10%** — built for holding it |
| Cavalry | **+0%** — dismounted and wasted |

Attacking archers shoot badly at men behind cover: delivery falls to ×0.5
against an intact wall, recovering toward ×1.0 as the masonry comes down. That
is the counterweight to the defenders' +20%, and it is why breaching matters
even to an army with no intention of storming the breach.

Cavalry being worthless on a wall is deliberate — it is what makes the **sortie**
a real choice rather than free value.

---

## Siege engines

Costs are gold, wood and ore. **Stone went into the walls it will break** —
quarries feed buildings now, forges feed war.

| Engine | Power | Health | Crew | Engine Yard |
|---|---|---|---|---|
| Ropes & Grapples | — | 100 | 1 | 1 |
| Ladders | — | 200 | 1 | 3 |
| Battering ram | 300 | 600 | 2 | 5 |
| Ballista | 400 | 800 | 3 | 7 |
| **Siege tower** | — | 1,500 | 4 | 7 |
| Trebuchet | 400 | 1,000 | 5 | 9 |

| Counter | Answers | Power | Health | Crew | Engine Yard |
|---|---|---|---|---|---|
| Bill-hooks | ropes | 100 | 200 | 1 | 2 |
| Fork Poles | ladders | 150 | 300 | 1 | 4 |
| Boiling Oil | rams | 300 | 800 | 2 | 6 |
| **Fire Pots** | **siege towers** | 400 | 900 | 2 | 8 |
| Hoardings | ballistae | 400 | 1,200 | 3 | 8 |
| Counter-Engine | trebuchets | 400 | **2,000** | 5 | 10 |

The Counter-Engine's doubled health is load-bearing: an emplaced battery that
survives long enough to shoot back is what turns a ten-bombard siege into a
twenty-bombard one.

### Wear, wreck and repair

Engine health is tracked **per type** and persists between battles. A battered
park fires proportionally weaker, so attrition compounds on its own. Below
**20% health** engines are wreckage and the count drops for good.

- **Mend** — a third of the build cost, scaled by damage.
- **Salvage** — sell back for half.

Rebuilding therefore costs three times repairing, which is why a long
bombardment is a running expense and why a ruler who is at the keyboard between
volleys can hold out against one who is not.

---

## The engine duel

**Counters do not "cancel" engines. They shoot at them.** Every round, each
counter type trades fire with the one it answers, and both sides come away with
wreckage.

There is no suppression constant anywhere in the engine. A battery that has shot
half your trebuchets to splinters suppresses you by arithmetic.

- Defenders roll a **+10–20% emplacement edge** once per battle — a fixed
  position, a known range, and a target crawling toward them.
- **Boiling Oil gets +100% against rams**, and scalds the ram crews besides.
- A counter outgunning its target by **3×** stops bothering with the woodwork
  and starts killing the crews.

### When a battery falls silent

Only when **both** hold: 70% of it is wreckage **and** what remains is at most
half the attacker's strength.

Requiring both is deliberate. With an OR, a defender who kept almost no counters
would qualify immediately and lose nothing — turtling by under-investing would
be free. Requiring 70% destroyed means you cannot reach the give-up state
without first being ground down to it, paying engineers and engines on the way.
And a defender with *no* counters makes the attacker instantly dominant, so
their walls fall roughly three times faster. The incentive points the right way
at both ends.

Once silent, no more engines or crews are lost — but walls and buildings take
fire freely.

---

## The round

```
0  COUNTER DUEL   counters and engines shoot each other to pieces
1  WALLS          rams grind masonry, trebuchets throw, their engines answer
2  ARCHERS        spread fire; attackers shoot badly at an intact parapet
3  CAVALRY        aimed: cavalry → footmen → archers
4  FOOTMEN        aimed: footmen → archers → cavalry; ram crews join a breach
5  SORTIE         the defender rides out, if they chose to
```

A **raid** is phases 2–4 only. Castle attacks and revenge run the lot.

Damage within a phase is simultaneous — both sides' damage is computed before
either is applied. Phases themselves are sequential.

**Engineers are never a target for a charge.** They die in the duel, or to a
sortie that got past the screen, and nowhere else.

### Ram crews

Twenty pairs of hands per ram, drawn **footmen → cavalry → archers**, with
effectiveness ×1.20 / ×1.10 / ×1.00 by who is pushing. They are *not* in the
battle line — pushing a ram against a gate is not holding a shield wall — and
Boiling Oil can scald them where they stand. At a breach (wall ≤50%) they drop
the beams and join the assault.

### The sortie

A standing order the defender sets out of combat. Cavalry lead, each bringing
three footmen behind, and cavalry fight at **+50%** in the open. It triggers
only when the defender's field arm outweighs the attacker's screen by 1.5×.

The attacker's footmen and cavalry form a **screen** that holds off 5× its own
strength, entrenched at +20%. Only the surplus reaches the engineers and the
engines. Defenders keep the wall's protection either way.

---

## Casualties

Damage into an arm splits **70% to the sellswords, 30% to your own**. Regulars
therefore ALWAYS leak a little, even while the buffer holds — which is what
keeps losing them the worst thing that can happen to you.

Within each pool the cheap ranks fall first: **light → medium → heavy**. A layer
of light troops beneath your heavies is a genuine shock absorber.

A side **breaks** below 30% of its starting power.

### The mercenary cascade

Sellswords serve under the regulars of **their own arm**, and no more than a
third of them. When those regulars die — in battle, to an assassin, to
starvation, to a discharge — the men who can no longer be commanded are paid off
and ride away.

```
75 regulars / 25 hired  →  lose 1 regular  →  74 supports only 24  →  74 / 24
```

**Killing one regular kills two soldiers.** And the buffer protecting the
survivors thins at the same time:

| Regulars lost | Regulars | Hired | Total lost |
|---|---|---|---|
| 0 | 75 | 25 | — |
| 25 | 50 | 16 | **34** |
| 40 | 35 | 11 | **54** |

It fires *after* a battle, never mid-round — mid-battle disbanding would collide
with the casualty split and make the report unreadable. Disbanded sellswords are
simply gone and must be re-hired with gold.

Note it never fires while the buffer is doing its job: with the 70/30 split, a
force at full ratio absorbs a normal night's losses without dropping under the
cap. The cascade is a late-stage punishment for being ground down, not a tax on
every skirmish.

---

## The battlefield yield

Before the first round, a defender lays down arms if either holds:

- their defensive power is below **60%** of the attacker's (walls count only on
  castle attacks — a raid is open field), **or**
- their stamina is below the mercy floor of **25**.

A yield resolves as a real battle with `rounds: 0` and the attacker victorious:
full loot for the mode, the defending **regulars untouched**, their sellswords
losing 25% covering the retreat, no wall damage, and next to no stamina drain.

**Revenge never yields.** However beaten a target is, a revenge strike is a real
battle and their regulars die. It is the only answer to a player who turtles
behind repeated yields.

---

## Aftermath

**Stamina** drains with the damage you **dealt**, measured against what it would
have taken to wipe the enemy out — ceiling 80 for the attacker, 50 for the
defender. Swinging hard tires an army; standing in a shield wall absorbing blows
does not. Cut them down to the last man and you pay the full price; walk into a
yield and you pay almost nothing. Bombard drains none from either side — it is
engines against masonry, not men.

**Loot** is a rolled band, then scaled by relative size:

| | Won | Yielded |
|---|---|---|
| Raid (goods) | 50–70% | 30–50% |
| Castle (gold) | 50–70% | 30–50% |

Punching up (target ≥1.5× your power) pays **×1.25**; farming someone half your
weight pays **×0.75**. The maximum is therefore 0.70 × 1.25 = 87.5% — it can
never exceed what they own, so no cap is needed.

**Experience is outcome-based**, not opponent-based:

| | |
|---|---|
| Per enemy **regular** killed | +0.05 |
| Per civilian driven off | +0.025 |
| Per mercenary killed | **0** — they were never anybody's people |
| Defending, always | +5 |
| Ceiling per battle | +10 |

There is no "bully band" any more and none is needed: farming a minnow pays
badly because there is nothing there to kill. Veterancy dies with the veterans —
`XP × (1 − lost/before)` — and discharging costs **half** what dying does, which
closes the old laundering hole where you could discharge to a skeleton and
retrain a fully-veteran army.

Engineers keep their **own** veterancy stat, covering both the engines they push
forward and the ones they man on the wall.

**Civilians flee a sacked town.** Every successful attack drives some off
outright — 1–3% on a raid, 3–6% on a castle attack, 4–8% on revenge, 1–2% on a
bombard (terror needs no swordsman), halved on a yield. This is separate from,
and compounds with, peasant scattering at the daily reset: the attack drives some
away now, and the troops it killed may drop the garrison under the 20% floor,
driving more away at dawn.

---

## Bombard

Trebuchets against Counter-Engines and nothing else. No troops march.

1. **The duel** — both batteries grind each other down (above).
2. **The walls** — surviving trebuchets work the masonry at 30% accuracy.
3. **The town** — once walls are breached (≤50%), fire spills onto a random
   building, weighted toward storages. Cracking those spills goods out for the
   raid that follows.

Every structure has a **50% integrity floor**: artillery cracks things open but
never levels them.

### What a bombard may burn

**The walls must fall first.** Nothing in the town is reachable until the
masonry is breached, which is what makes bombardment a campaign rather than a
button.

Past the breach, a bombard burns the **town**, never the **army**:

| Hit | Weight | What the damage costs |
| --- | --- | --- |
| The five stores | 3 | Protected capacity — the vault spills, and the spill is lootable |
| The four producers | 2 | That resource line's output |
| The Hearthsteads | 2 | Beds for tomorrow's settlers — see below |
| The Muster Halls | 2 | Bunks for tomorrow's recruits — see below |
| The Collegium | 1 | Research per scholar |
| The Market Square | 1 | Caravan capacity — a cracked market loads smaller |

Immune, by design and not by oversight:

- **The war yards** (Drill Yard, Fletcher's Range, Knight's Stables, Forge, War
  Engine Yard). An enemy may not disarm you by shelling. You break an army by
  killing it, not by cracking the sheds that built it.
- **Shadow Guild and Ranger's Lodge.** Spies and scouts are the intel game;
  blinding a rival from outside their walls would gut it.
Anything added to this table needs an integrity **effect** wired somewhere, or
the damage is inert and the battered sprite lies to the player.

#### Roofs cost capacity, not occupants

The Hearthstead and the Muster Hall were immune until 2026-08, on the grounds
that terror already displaces civilians and their roofs should not be a second
lever on the same thing. They are targetable now because the lever turned out to
be a different one.

**Shelling a roof evicts nobody.** Every peasant already under one stays; the
garrison stays to the last man. What falls is **capacity** — housing and bunks
scale by integrity — so a town shelled to 60% keeps everything it has and gains
nothing further: the next dawn's settlers find no bed and walk on, and no fresh
troops can be raised until the halls are mended. A besieger who wants your army
smaller must still kill it. What they can do is make sure you never replace it.

That makes bombardment a **slow strangling** rather than a massacre, and it is
the only damage in the game whose cost is entirely invisible on the dashboard —
no number moves, growth simply stops. The population advisor calls it out
explicitly for that reason.

#### Two health models

| | Shape | Why |
| --- | --- | --- |
| **Levelled** buildings | `level² × 3,000` | Exactly a tenth of a wall at the same level. One curve for all of them; they differ in *weight*, not toughness |
| **Counted** structures | `2,000` / cottage, `4,000` / hall | Linear, because `level()` on a counted building returns **how many you own**. Squaring a count would read a 240-hall barracks as 172,800,000 health — fifty-seven Citadels |

Repair follows the same split: `buildingCost` quotes one cottage, so
`repairCost` multiplies by the count. Mending a quarter of two hundred
Hearthsteads is fifty cottages' worth of carpentry, not a quarter of one — the
bigger the army, the dearer its roof is to keep over its head.

### The anchor

Every siege number is fitted to one target, and it is written into
`battleBalance.ts` so it cannot silently drift:

> A **mid-game** attacker (Siegecraft 3, ~50 engineer veterancy, no race bonus)
> with **40 crewed trebuchets** levels a **Citadel in 10 bombards** (100 action
> turns). With full defensive siege answering, **20**.

Move `SIEGE_GEAR.trebuchets.power` or `WALL_HP_CURVE` and that target moves;
everything else is calibrated against it.

---

## The report

Structured, not prose. Every entry carries its round, its phase, and the
**regular losses on each side**, so a reader can see *where* their army died
rather than hunting for it in a paragraph. `regularsKilled` and
`civiliansDisplaced` are surfaced on the report itself, and sellswords paid off
by the cascade are reported separately from battle deaths so the arithmetic is
legible.

The **public War Ledger** stays redacted: who attacked whom, mode, victor,
rounds, aggregate losses, engines destroyed, wall damage. Composition, loot,
stamina and veterancy stay with the combatants — an army's makeup is
intelligence you pay spy turns for.

---

## Open / TBD

- [ ] **Race spread is 34.6 points** in open-field raids — but that figure
      measures one axis and must not be read as a balance defect on its own.
      Trolls (siege 1.4, stone 1.6) and Dwarves (walls 1.25, ore 1.4) are the
      siege and fortress races; losing field raids is what they trade away.
      Balance is whether every race has a *path to winning an age* — production,
      ranking, siege, defence, or the shadow war — not whether they all win the
      same fight. The sim needs broadening to score all of those before any
      multiplier moves. See the tuning backlog in `todo.md`.
- [ ] **The archer phase is the one genuine suspect.** It fires first and
      spreads proportionally, so it can decide a raid before cavalry or footmen
      swing — which would make archer multipliers worth more than any other unit
      stat regardless of race intent. Test by reordering or damping phase 2
      BEFORE concluding anything about races.
- [ ] Tune the anchor against real play once an age has run.
- [ ] Simultaneous-attack / reinforcement rules for coordinated clan assaults.
