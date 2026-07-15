# War of Empires — Espionage (Spies & Scouts)

Spies attack in the shadows; scouts see and catch. All numbers tunable.

---

## The core trade-off

You choose how many spies to send on a mission. **More spies = more damage,
more noise:**

- Mission effect scales with spies sent.
- Catch chance also scales with spies sent.
- **Caught spies are executed** — that's real population loss, permanent,
  the espionage equivalent of losing regulars. A failed 20-spy mission is a
  massacre.
- Uncaught missions are **anonymous** — the victim sees the damage, not the
  hand. Caught missions expose the attacker (and open the 18h revenge window).

## Spy missions (unlocked by Tradecraft research, `research.md`)

| Tradecraft | Operation              | Effect                                                        |
|------------|------------------------|---------------------------------------------------------------|
| 1          | **Survey the Coffers** | Exact gold + resources, what sits outside storage             |
| 2          | **Map the Defences**   | Wall level & integrity, War Foundry level & counters, army composition, stamina |
| 3          | **Sabotage the Engines**| Destroy siege gear: up to `spiesSent / 2` pieces             |
| 4          | **Torch the Stores**   | Burn unstored resources: 1% per spy (cap 25%)                 |
| 5          | **Incite Unrest**      | 24h: tax income −25%, production −25%, pop growth halted      |

Mission cost: **5 action turns**. Spies sent are busy until the mission
resolves (same tick, they're just committed).

**Shadow Guild level = spy effectiveness.** Every mission's effect is
multiplied by `(1 + 0.1 × guildLevel)` — a level-10 guild doubles sabotage
kills, burn percentages, and unrest severity.

**Luck:** spycraft is messier than open battle — every mission's outcome
(effect delivered, and the catch roll) carries a **±20% random swing**
(multiplier 0.80–1.20, rolled per mission). Twice the variance of battle:
plans survive contact with the enemy; spies don't always.

## Scouts — the counter (and the eyes)

Scouts do two jobs:

**1. Recon missions** (2 action turns): surface intel from outside the walls —
settlement title, army size (fuzzy ±20%), wall level. Cheap, low-risk, no execution
mechanic; what spies see deeply, scouts see broadly.

**2. Counter-espionage (passive):** scouts kept at home watch for infiltration.

### Catching spies

The **Ranger's Lodge level determines what level of spy operation your
scouts can even detect:**

```
catchableOpLevel = ceil(lodgeLevel / 2)     // lodge 2 → L1 ops … lodge 10 → L5 ops
```

A lodge-4 empire is blind to Sabotage (L3) and above — those missions run at
**zero catch risk** against it. Only a lodge-9+ empire can catch Incite
Unrest. Sophistication beats vigilance.

If the op level is catchable:

```
catchChance = min(90%, spiesSent × 0.5% × lodgeLevel × min(1, scoutsHome / spiesSent))
              × (1 + 0.2 × pathfindingLevel)     // Pathfinding research sharpens the watch
```

- 20 spies vs lodge 10 with enough scouts: ~90% caught (huge missions against
  hard targets are suicide).
- 5 spies vs lodge 4: ~4% — small teams slip through almost anywhere.
- No scouts home = no catches, regardless of lodge level.

**On a catch:** mission fails, every spy sent is executed (population loss),
the attacker is named, and the defender gets the revenge window.

## Research split

- **Tradecraft** (spy field): unlocks the op list above; also +20%/level
  mission effect (stacks with Shadow Guild).
- **Pathfinding** (scout field): +20%/level catch chance and sharper recon
  (fuzzy numbers tighten toward exact).

## Worked example

Attacker (Tradecraft 3, Shadow Guild 6) sends 8 spies to Sabotage the
Engines against a defender with Ranger's Lodge 5, 30 scouts home,
Pathfinding 2.

- Lodge 5 → catchable up to op level 3 ✓ (just barely — lodge 4 would be blind)
- catchChance = min(90%, 8 × 0.5% × 5 × 1) × 1.4 = 20% × 1.4 = **28%**
- If unseen: destroys up to 8/2 = 4 pieces of siege gear × 1.6 (guild) →
  **6 engines wrecked**, anonymously — likely the defender's trebuchets on
  the eve of their siege.
- If caught: 8 spies executed, attacker named, revenge unlocked.

---

## Open / TBD

- [ ] Can Incite Unrest stack from multiple attackers? (Proposal: no — refreshes duration only.)
- [ ] Do sabotaged engines hit crewed engineers too? (Proposal: no — gear only.)
- [ ] Spy-vs-spy: counter-intelligence sweeps to purge enemy intel? (v2)
- [ ] Recon detection: can defenders catch scouts? (Proposal: no — scouts stay outside the walls; only spies risk death.)
