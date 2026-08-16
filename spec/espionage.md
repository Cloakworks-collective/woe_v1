# War of Empires — Espionage (Spies & Scouts)

Every number lives in `lib/constants/covertBalance.ts`.

---

## Two arms, one budget

Espionage is not a separate system. It runs the **same strength model as
combat** — agents have Power and Health, bonuses add, delivery multiplies, and a
mission resolves as one force meeting another.

| | **SCOUTS** | **SPIES** |
|---|---|---|
| Role | the whole intelligence arm | the whole destruction arm |
| Manner | work in the open | go over the wall |
| Risk | **never intercepted** | can be caught |
| Also | **the only defence against spies** | — |

Nobody duplicates anybody. Scouts see and shield; spies break and steal.

**Both spend from the same pool of spy turns**, which is the tension that makes
the pair interesting: every turn spent watching a rival is a turn not spent
robbing them. And sizing a spy raid means knowing how many rangers stand against
it — which costs a scout mission first. The two arms feed and starve each other.

### The loop

Spies **Incite Unrest** → scouts **Quell** it.
Spies **Sow Research Doubt** → scouts **Quell** it.
Spies **Assassinate Scouts** → which strips the defence that stops spies.

Neither arm is optional.

---

## The spy turn economy

A second, scarcer clock.

| | Action turns | **Spy turns** |
|---|---|---|
| Accrual | 2/tick = 288/day | **1/tick = 144/day** |
| Cap | 500 | **200** |
| Cost per act | 10 (attack) | **derived — see below** |
| Spent by | armies | **spies *and* scouts** |

About a day and a half of banking. A single deep operation can spend the lot,
which is what makes espionage something you plan rather than spam.

### Cost is derived, never chosen

```
turnCost = agents × turnsPerAgent[op]
```

You **cannot under-fund an infiltration** — you either afford the agents you are
sending or you send fewer. Sending a hundred spies on ten turns is not a trap
you can fall into, because the system charges you a hundred.

The interesting decision was never "how much should I short the budget." It is:

> **They have roughly N rangers. How many agents do I commit?**

Too few and the watch eats them all, turns and agents gone for nothing. Too many
and you have burned a day's budget for an effect you could have had cheaper.

---

## Resolution

```
spyPower    = agents × basePower × (1 + Σ bonuses) × delivery
scoutPower  = rangers × basePower × (1 + Σ bonuses) × delivery
intercepted = f(scoutPower vs spyPower) × op.detection
survivors   = sent − intercepted
effect      = f(survivors)        ← damage scales with who got THROUGH
```

The additive pool is race, research (Tradecraft for spies,
Pathfinding for scouts) and the relevant building — Shadow Guild or Rangers
Lodge, +10%/level. Delivery is a ±20% roll: twice the battle swing, because the
shadow war is a chancier business than a shield wall.

**Interception IS the catch.** There is no separate roll. And it is graduated —
some die, some come home, replacing the old all-or-nothing massacre.

- **A clean run stays anonymous.** That is the whole prize.
- **Any interception at all names you** and opens the revenge window.
- **No rangers means no defence.** A realm without a watch is robbed at will.

Scouts never hunt. They stand watch, and defence costs nothing — you should not
be robbed because you were asleep with an empty budget.

Within the caught, **hired agents are taken first**: one of your own is lost only
25% of the time while sellsword agents remain.

---

## Scout operations

Overt, safe, never intercepted. Gated by **Pathfinding**.

| L | Op | Turns/agent | What it tells you |
|---|---|---|---|
| 1 | Survey the Coffers | 0.10 | Exact gold and goods, and what sits exposed |
| 1 | Map the Walls | 0.15 | Wall level, health standing, every crewed counter |
| 2 | Map the Army | 0.15 | Composition by arm and tier, sellswords, stamina, sortie orders |
| 3 | **Map the Siege Train** | 0.15 | **Their engines — the one thing the ladder never shows** |
| 4 | Map the Collegium | 0.25 | Every research field and level |
| 3 | Quell the Unrest | 0.30 | Ends Incite Unrest early, in your own streets |
| 5 | Quell the Doubt | 0.30 | Ends Sow Doubt early |

**Map the Siege Train earns its place.** Ranking counts engineers and defensive
works but never the siege train, so a rival's offensive engines exist nowhere
public. This is the only way to learn whether a bombardment is coming.

---

## Spy operations

Covert, interceptable, and being caught names you. Gated by **Tradecraft**.
Higher `detection` means easier to catch.

| L | Op | Turns/agent | Detection | Effect |
|---|---|---|---|---|
| 1 | Torch the Stores | 0.40 | ×1.0 | Burns 1%/survivor of exposed goods, cap 25% |
| 2 | Steal the Stores | 0.40 | ×1.0 | Takes 0.6%/survivor, cap 15% — less than fire destroys, because it has to be carried out |
| 2 | Sabotage the Engines | 0.50 | ×1.2 | Wrecks 0.5 engines/survivor, offensive and defensive alike |
| 3 | Undermine the Walls | 0.50 | ×1.2 | 0.2%/survivor of wall health, **cap 10%** |
| 3 | Incite Unrest | 0.60 | ×1.4 | 24h: −25% tax and production, growth halted |
| 4 | Sow Research Doubt | 0.60 | ×1.4 | 24h: research at **half speed** |
| 5 | Assassinate the Scouts | 0.80 | ×1.8 | Kills 0.3 rangers/survivor — and blinds them |
| 5 | Steal the Learning | 1.00 | ×2.0 | **Copies** one research level |

**Undermining is capped hard on purpose.** If spies could meaningfully breach a
wall, the entire siege economy — trebuchets, engineers, repair costs, the
artillery duel — would be pointless. It is a nuisance, not a siege.

**Steal the Learning copies.** The victim keeps their level and loses only the
secret. Capped at **5 levels per era**, so theft can supplement doing the work
but never replace it.

**Assassination cascades.** The knives take **half from the regulars and half
from the hired**, each pool absorbing the other's share when it runs short — the
one operation aimed squarely at the thing that is hardest to touch, so it does
not hide entirely behind the screen the way a blow in the field does. Then the
hired rangers who can no longer be commanded are paid off and ride away, the
same cascade the army runs (`combat.md`).

---

## Recruitment

| | |
|---|---|
| Spies | ≤ **5%** of total population |
| Scouts | ≤ **5%** of total population |
| Combined | ≤ **10%** |

Both arms can also be **hired**, capped at a third of your own of that arm.
Hired knives need a Shadow Guild; hired rangers a Rangers Lodge. They are taken
first when a mission is intercepted, which is precisely what keeps your own
people alive.

Covert agents are civilians: they pay tax, they eat, and unlike engine crews they
need no barracks bed.

---

## Ranking

Scouts count toward ranking at a discount — they stand in the open and everyone
can see the rangers on your roads. **Spies never appear.** Covert is covert, and
it would be a strange ladder that advertised how deep your spy service runs.

---

## Open / TBD

- [ ] Tune interception against real play — `AT_PARITY` (0.4) is a first guess.
- [ ] Consider whether Quell ops should cost fewer turns; counter-play that is
      dearer than the attack it answers tends not to get used.
