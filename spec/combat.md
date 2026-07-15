# War of Empires — Combat

How a battle actually resolves, end to end. All constants are tunable.

---

## Unit base stats

| Unit               | Attack / Defence (light) | Medium (×1.8) | Heavy (×3)  |
|--------------------|--------------------------|----------------|-------------|
| Footman            | 10 / 10                  | 18 / 18        | 30 / 30     |
| Archer             | 12 / 6                   | 22 / 11        | 36 / 18     |
| Cavalry            | 15 / 8                   | 27 / 14        | 45 / 24     |
| Warrior (unequipped)| 3 / 3                   | —              | —           |
| Siege engineer     | 0 / 5                    | —              | — (crew only)|
| Mercenary          | 18 / 18 (fixed, medium-footman equivalent) |  |             |

Siege weapon fire (per crewed engine, per round):

| Engine    | Troop damage | Wall integrity damage |
|-----------|--------------|------------------------|
| Ballista  | 40           | —                      |
| Trebuchet | 60           | 5%                     |
| Battering Ram | —        | 3%                     |

Ropes & Grapples / Ladders deal no damage — they are **escalade** tools that
bypass the wall bonus (below).

## Combat multipliers (apply to both attack and defence)

```
effectiveStat = baseStat
              × raceModifier                       // per race, per stat
              × staminaMod                         // 0.5 + 0.005 × stamina (0–100)
              × experienceMod                      // 1 + experience/100 → up to ×2 at 100 XP
              × researchMod                        // Art of War (attack) / Shieldcraft (defence), +20%/lvl
              × luck                               // random 0.90–1.10, rolled per side per round
```

**The fog of war:** every battle carries a **±10% luck roll** — each side's
damage is multiplied by a fresh random 0.90–1.10 each round. Evenly matched
battles can genuinely go either way; no attack is a sure thing on paper.

Siege damage is further multiplied by Siegecraft research and the race's
`siegeStrength` (Trolls best).

## Attack modes & the turn economy

Players spend **action turns** to attack: every attack costs **10 turns**.
Turns accrue at **2 per game turn** (10 min) = 288/day; new players start
with **200** (cap: 500, tunable). Resting troops also spends turns.

Every attack serves one of three goals: **take stuff** (raid, siege),
**break infrastructure** (bombard), or **kill regulars** (revenge).

| Mode        | Fight                          | Walls & siege | Loot                                        |
|-------------|--------------------------------|---------------|---------------------------------------------|
| **Raid**    | field army vs field army       | none          | **everything outside storage, never gold** — not resource-specific: all four resources sitting in the open |
| **Siege** (the *castle attack*) | full 4-phase assault | yes  | gold and stored goods are its business: unbanked **gold** + everything outside storage — including goods **spilled from bombarded storages** |
| **Revenge** | full 4-phase assault           | yes           | none — the payment is regular kills         |
| **Bombard** | engines only, no troop battle  | trebuchets vs Counter-Engine | none — wrecks the **walls first**, then the town's buildings (max 50% damage each) |

Killing regulars is **hard by design** — mercenaries absorb all casualties
first, so you must chew through the merc buffer before touching real troops —
and it's the worst thing you can do to an enemy: every dead regular is dead
*population*, and heavy losses trigger peasant scattering (below). Losing
100–200 population sets an empire's ranking back hard.

**Protection windows (no attacks of any kind, revenge included):**
- **Era peace:** no one can attack anyone during the **first 5 days of an
  era** — everyone builds, scouts, and schemes first.
- **Newcomer shield:** a player joining mid-era is unattackable for **72
  hours**. Attacking someone drops your own shield early (implemented
  provisionally — pending final confirmation).
- Spy missions are also blocked against protected players, otherwise the
  shield leaks through arson and sabotage (implemented provisionally).

**Mercy rules:** raid, siege, and bombard cannot target a player who has
**surrendered** or whose army stamina is **below 25** (beaten down).
**Revenge ignores all of it** — surrender, low stamina, rubbled walls — and
is available for **18 hours** after the original attack, once per attacker.
**Revenge chains:** a revenge attack is itself an attack — it opens a fresh
18-hour revenge window for the side that just got revenged. Feuds don't end
until someone lets the clock run out.

**Clan-building bombardment:** members of warring clans can bombard the enemy
**clan buildings** (Storage, Hall, Wonder — integrity damage like any
bombard). The attacked clan gets **one revenge attack** in return — but any
member who was in the clan at that moment can be the one to deliver it
(membership snapshot, 18h window, first to strike uses it). You never know
which knife is coming.

**Surrender** (voluntary status): while surrendered you cannot attack, and
tax income is halved (tribute and shame). Lift it any time; attacking lifts
it automatically. Revenge still finds you.

**Bombard** is the pure artillery duel: attacker sends trebuchets + crews
(no army). **You do not choose a target** — the engines follow the siege's
own logic:

1. **Walls first.** Each trebuchet grinds **5% wall integrity per round**
   until the walls are **breached (≤ 50% integrity)**.
2. **Then the town.** Once the walls are down (or the defender has none),
   each round's fire spills onto a **random building**, weighted — storages
   take the most, then production buildings, then the Collegium:
   - **storages** → protection degrades, goods above the reduced capacity
     **spill outside** for a follow-up **castle attack (siege)**;
   - **production buildings** (Grange / Quarry / Mine / Mill) → their output
     drops proportionally to integrity;
   - **the Collegium** → research banks proportionally slower.
   Each takes **3% integrity per crewed trebuchet per round**.

Every building (walls included) has an integrity **floor of 50%** — artillery
cracks a structure open but never levels it. All damage persists until the
defender **repairs** it (½ × damage × the building's build cost). The
defender's Counter-Engine (War Foundry 10) reduces bombard damage 75% and
destroys one attacker trebuchet per round. No loot; bombard is the softening
strike before the castle attack.

## The wall bonus (defender, siege & revenge attacks only)

```
wallBonus     = wallLevel × 10%                    // Citadel (10) = +100% defence
effectiveWall = wallBonus × integrity × (1 − escalade)
```

- **Integrity** (0–100%): rams and trebuchets destroy it during battle (see
  table above); damage **persists after the battle**, causing the pop-growth
  penalty in `buildings.md` until repaired.
- **Escalade**: each crewed Ropes team lets 10 attacking troops ignore the
  wall; each Ladder team 25. `escalade = min(1, coveredTroops / attackerTroops)`.
- **Counters** (War Foundry installations, `buildings.md`): each reduces its
  paired weapon's effect by 75% — Bill-hooks vs ropes, Fork Poles vs ladders,
  Boiling Oil vs rams, Hoardings vs ballista troop-damage, Counter-Engine vs
  trebuchets (also returns fire, destroying attacker engines).
- Raids: **no wall bonus, no siege phase** — fought in the open countryside.
- Bombard: no troop battle at all (see attack modes above).

---

## Battle resolution

### 0. Commitment
Attacker picks target and mode; the attack costs **10 action turns** and runs
up to **10 combat rounds** (fewer if a side breaks). Attacks resolve
**instantaneously** — no march time, no march food. (A starving empire —
food at 0 — cannot launch attacks; see `economy.md`.)

### 1. Rounds
Each round runs the four phases in order. Both sides act in every phase;
damage within a phase is simultaneous.

```
Phase 1 — SIEGE       ballistae/trebuchets fire; proportional troop damage;
                      rams + trebuchets grind wall integrity; Counter-Engine
                      duels attacker engines. Siege & revenge only.
Phase 2 — ARCHERS     proportional damage across all enemy groups
Phase 3 — CAVALRY     targeted: enemy cavalry → footmen → engineers → archers
Phase 4 — FOOTMEN     targeted: enemy footmen → archers → cavalry → engineers
```

- *Proportional*: if the enemy is 50% footmen, footmen absorb 50% of the damage.
- *Targeted*: all damage lands on the first group until it's dead, then spills
  to the next.

### 2. Casualties

```
groupDamage   = Σ(unitAttack × count) × multipliers
unitsKilled   = floor(groupDamage / (k × effectiveDefencePerUnit))    // k = 2, lethality dial
```

- Defender's `effectiveDefence` includes `effectiveWall` in siege/revenge.
- **Mercenaries die first**: casualties assigned to mercs until none remain,
  then regulars. (Engineers die only via proportional damage or targeted
  spill-through.)

### 3. Breaking & victory
After each round, compare each side's **remaining strength** (Σ attack power)
to its starting strength. A side **breaks** below 30%.

- Defender breaks → **attacker victorious**, battle ends.
- Attacker breaks or rounds run out with defender standing → **defender holds**.

### 4. Aftermath

**Stamina:** −8/round for the attacker, −5/round for the defender.
Recovery: +1/turn passive, or the **rest action** — 5 action turns +
0.2 food per troop → **+20 stamina** for the whole army (tunable;
unavailable while starving).

**Experience** (global army stat, 0–100): troops keep getting stronger up to
**+100%** at 100 XP (`experienceMod` above). What the *attacker* earns
depends on who they picked, measured by ranking-score ratio
(`defenderScore / attackerScore`):

| Target vs you        | Ratio        | Attacker XP | Flavor                          |
|----------------------|--------------|-------------|---------------------------------|
| ≥ 75% stronger       | ≥ 1.75       | **attack refused** | Your troops back off and call you an idiot |
| 20–75% stronger      | 1.20 – 1.75  | **+8**      | Bold — glory in punching up     |
| Within ±20%          | 0.80 – 1.20  | **+5**      | A fair fight                    |
| 20–50% weaker        | 0.50 – 0.80  | **+1**      | Little glory                    |
| > 50% weaker         | < 0.50       | **−5**      | Bullying — the army is ashamed  |

- The **defender always gains +5** — they didn't choose the fight.
- **Revenge is exempt from refusal** (vengeance overrides fear) and never
  loses XP regardless of the ratio.
- The refusal band saves players from suicide runs; the −5 band plus reduced
  loot (below) is what makes farming minnows a losing habit.

Experience is *lost* by losing regulars — veterancy dies with the veterans:

```
newXP = XP × (1 − regularsLost / regularsBefore)
```

Mercenary deaths cost no XP (they were never yours). A crushing defeat that
kills half your regulars halves your army's experience — rebuilding numbers
is fast (training is instant), but rebuilding *veterancy* takes many battles.

**Peasant scattering** (population warfare): civilians only stay where they
feel protected. If, at the **daily reset**, an empire's troop count is below
**30% of its civilian population**, unprotected peasants scatter:

```
if troops < 0.3 × civilians:
    civiliansAfter = floor(troops / 0.3)      // scatter down to the 30% line
```

**Exemption:** empires below **500 total population** never scatter
(`architecture.md`) — small and rebuilding empires are safe from the spiral.

Idle peasants scatter first, then workers, then specialists. The daily-reset
timing is the grace window: after a devastating defeat you have until the
next reset to train troops back above the line (instant, if you have gold,
Muster Hall slots, and peasants) before your population walks. This is how
revenge attacks translate military destruction into 100–200 lost population
and a hard ranking setback.

**Wall integrity** lost during battle persists → pop/day penalty until the
defender pays repairs:

```
repairCost = damagedFraction × (wallLevel build cost) × 0.5   // gold/wood/stone by wall ratio
```

**Loot (attacker victory only):**

| Mode    | Takes                                                                  |
|---------|------------------------------------------------------------------------|
| Raid    | 25% of **all** resources outside storage — never gold                  |
| Siege (castle attack) | 25% of **unbanked** gold **plus** 25% of everything outside storage, incl. goods spilled from bombarded storages |
| Revenge | nothing — the payment is troop kills                                   |
| Bombard | nothing — wall & building destruction is the point (engines trade fire; no victor) |

Size scaling: target ≥150% of your strength → +50% loot; target ≤50% → loot
scaled down proportionally (floor 25% of normal).

**Siege gear fate:** attacker's engines survive if the attacker wins; on a
loss, 50% of committed gear is destroyed (Counter-Engine kills count extra).
Defender installations (counters) are permanent and never lost.

**The War Ledger (public).** Every battle also produces a **redacted public
view** any player may browse (global last-100 page; per-empire profiles):
who attacked whom, mode, victor, rounds, **aggregate** troops lost per side,
siege gear destroyed (count), wall damage, and how many buildings a bombard
cracked open (count). Composition
(per-class losses), loot, stamina/XP, and the narrated log stay with the
combatants — an army's makeup is intelligence you pay spies for.

**Battle report** (`evt:battleReport`) itemizes casualties per unit class
for both sides (mercenaries separate — the buffer is visible dying first),
wall & storage damage, siege gear lost (incl. Counter-Engine kills),
stamina/experience changes, and loot. The report's **narrated log** tells
the battle phase by phase with real numbers: counter callouts up front
("Boiling Oil scalds our ram crews (−75%)"), then per round — the siege
volley (kills + wall %), the defenders' engines answering, Counter-Engine
trebuchet kills, archer volleys, cavalry charges, and the melee, each
naming who lost what ("Cavalry charge: defenders lose 4 footmen, 2
mercenaries; the attackers hold"), closed by a strength summary per round.
The defender receives `evt:attacked`, enabling revenge for 18 hours (and a
revenge attack re-arms the window for its victim — see revenge chains above).

---

## Worked micro-example

Attacker: 100 light footmen (A10) + 2 crewed ladder teams. Defender: 60 light
footmen behind Curtain Wall (level 5, +50%), full integrity, no Fork Poles.

- Escalade: 2 ladders cover 50 of 100 troops → wall bonus halved: +25%.
- Round 1, Phase 4: attacker damage = 100×10 = 1,000 → kills = 1000/(2×10×1.25)
  = 40 defenders. Defender damage = 60×10 = 600 → kills = 600/(2×10) = 30.
- Round 2: 70 vs 20 — defender at 33% strength… round 3 breaks them.
  Attacker wins, takes 25% of unbanked gold.

With Fork Poles the ladders drop to 12.5 covered troops (75% countered),
wall stays ~+44%, and the math tilts toward the defender holding.

---

## Open / TBD

- [ ] Tune k (lethality), break threshold (30%), stamina/XP rates via simulation.
- [x] Food — no march costs; population upkeep in `economy.md` (starvation blocks attacking).
- [ ] Simultaneous-attack / reinforcement rules (clan coordinated attacks).
