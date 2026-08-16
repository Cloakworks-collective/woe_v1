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

Spies **Incite Unrest** → a standing watch cuts it short, or turns it back.
Spies **Sow Research Doubt** → the same watch, the same answer.
Spies **Assassinate Scouts** → which strips the very watch doing the cutting.

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
Lodge, +10%/level. Delivery is a **±30%** roll — three times the battle swing,
and it has to be: both arms are capped at the same share of population, so two
comparable empires sit at parity by construction. A narrow swing would make the
shield below a deterministic wall and spying would only ever work downhill. At
±30% the rolled ratio at parity lands anywhere in 0.54–1.86, so you must
outweigh the other side by ~1.86× before any roll is certain either way.

**Interception IS the catch.** There is no separate roll. And it is graduated —
some die, some come home, replacing the old all-or-nothing massacre.

- **A clean run stays anonymous.** That is the whole prize.
- **Any interception at all names you** and opens the revenge window.
- **No rangers means no defence.** A realm without a watch is robbed at will.

**A watch that outweighs the knives turns them back outright.** Every spy
operation, not just the lingering ones: agents get over the wall, find every
door watched, and come home with nothing. Some are caught on the way. This is
not a wall between equals — the ±30% swing above is what keeps it a gamble.

### What lingers, and for how long

Unrest and Doubt are the two operations that do not finish when the spy leaves,
and they are the two the watch answers twice:

```
ticks = a day × (survivors ÷ INFILTRATION_SCALE) × (1 − watch ÷ knives)
        floored at MIN_DURATION_FRACTION of a day
```

Both halves used to be missing — the duration was a flat day whether one spy
came over the wall or a hundred, and a realm full of rangers suffered it exactly
as long as a realm with none. **Rangers are now paid twice for the same men:**
once in knives caught, once in hours cut. The floor exists so a near-miss reads
as an event rather than a phantom — fourteen minutes of unrest is an alarm with
nothing behind it by the time anyone looks.

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
- [ ] Tune `INFILTRATION_SCALE` (50) and `MIN_DURATION_FRACTION` (0.1) against
      real play — both are first guesses.
