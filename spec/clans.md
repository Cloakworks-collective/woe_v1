# War of Empires — Clans

Cooperative play: shared buildings, war, and diplomacy. All numbers tunable.

---

## Leadership

| Position       | Count | Powers                                                        |
|----------------|-------|---------------------------------------------------------------|
| **Leader**     | 1     | Everything: appoint/demote, invite/kick, build, war, diplomacy |
| **Vice-Leader**| 1     | Same as Leader except appointing/removing the Leader          |
| **Officer**    | 3     | Build clan buildings, invite members                          |

Only these **5 leadership positions can build clan buildings**. Regular
members contribute resources and fight.

## Membership churn (joining & leaving)

Clans are commitments, not revolving doors:

- **Leaving (or being kicked) forfeits all deposits.** The resources stay in
  Clan Storage; the departing member's withdrawal ledger is wiped. Rejoining
  any clan later starts the lifetime-deposit counter at zero.
- **48-hour cooldown:** after leaving or being kicked, a player cannot join
  *any* clan for 48 hours.
- **Two departures per era, maximum.** Leaves and kicks both count. After a
  player's second departure, they cannot join another clan until the era
  ends (counters reset with the era wipe).

Kicks counting toward the limit prevents kick/rejoin churn gaming; the
forfeiture rule means clan-hopping always costs the hopper, never the clan.

## Clan buildings

Built from the **Clan Storage** pool — which is why storage comes first:
nothing else can be built until there's a treasury to build it from.

### 1. Clan Storage (levels 1–10) — build this first

- All members can **deposit** gold/food/wood/stone/ore.
- Capacity: **250,000 × level** per resource type.
- Every other clan building (and its upgrades) is paid from this pool.
- **Withdrawals — anyone, capped at 3× what they donated** (lifetime, per
  resource, leader included):

```
withdrawableNow = 3 × lifetimeDeposited − lifetimeWithdrawn
```

- The one exception: when the 5 leadership positions spend storage on **clan
  building upgrades**, that spending bypasses the cap entirely — it's the
  clan's money doing the clan's work, not a personal withdrawal.
- The 3× cap makes the pool mutual aid, not a piggy bank: a member in crisis
  (post-revenge rebuild) can pull out triple their contribution, but leeches
  who never deposit can never withdraw.

### 2. Clan Hall (levels 1–4) — the roster & the tax shelter

Founding a clan (5 players minimum, together) erects Hall level 1.

Clan members help each other bear the tax burden: the Hall reduces the
**production penalty from taxation** for every member — capped at a **50%
reduction** at max level, so solo play stays viable and the tax dial never
stops mattering.

| Hall level | Member cap | Tax penalty felt |
|------------|------------|------------------|
| 1          | 5          | 100% (normal)    |
| 2          | 10         | 83%              |
| 3          | 15         | 66%              |
| 4          | 20         | 50%              |

```
outputPerProducer = 20 × (1 − taxRate × hallPenaltyFactor) × statecraftMult
```

Stacks with Statecraft research (`research.md`). Hall-4 at 100% tax leaves
producers at half output (instead of zero) — a strong war economy, not a
free one.

### 3. Clan Wonder (levels 1–3) — the crown

**Extremely expensive**, and felt by every member: each level lowers the
whole clan's war economy costs.

| Wonder level | Mercenary price | Troop training cost | Siege gear cost | Requires        |
|--------------|-----------------|---------------------|-----------------|-----------------|
| 1            | −10%            | −10%                | −10%            | Clan Storage 4  |
| 2            | −20%            | −20%                | −20%            | Clan Storage 7  |
| 3            | −30%            | −30%                | −30%            | Clan Storage 10 |

Suggested costs (tunable): L1 = 1M gold + 500k each of wood/stone/ore;
L2 = 2.5M + 1.25M each; L3 = 5M + 2.5M each. A Wonder is a server-visible
statement: this clan out-produced everyone.

## Clan War

- Leadership declares war on another clan (no consent needed — war is war).
- **Battle damage between members of warring clans is +100%** (both
  directions). Wars are twice as bloody: kills, wall damage, everything
  lands double.
- **Clan buildings become bombardable:** members of a warring clan can
  bombard the enemy's Clan Storage, Hall, and Wonder (integrity damage, like
  any bombard; effects degrade proportionally until repaired from the pool).
- **The price:** bombarding clan buildings grants the attacked clan **one
  revenge attack** — but it can be executed by **any member who was in the
  clan at that moment** (membership snapshot, 18h window, first to strike
  uses it). The clan chooses its champion: expect their strongest.
- Mercy rules still apply (surrender, stamina < 25) — except revenge, as always.
- Peace: either leadership can offer; both must accept.

### Winning a clan war

The server tallies **net regular kills** between the warring clans
(mercenaries don't count). When one clan has killed **200 more regulars**
than it has lost to the other, it **wins the war**. The spoils:

1. **Experience transfer:** every member of the losing clan loses **5%** of
   their army experience; every member of the winning clan gains 5%
   (capped at 100). Veterancy flows to the victor.
2. **Tribute — whichever is smaller:**
   - **20% of the defeated clan's production, siphoned per turn for one day**
     (144 turns) into the winning clan's storage, **or**
   - **1,000,000 gold** total value — the siphon stops early once the
     cumulative take reaches 1M gold-equivalent (resources valued at 1 gold
     per unit for the cap, tunable).

The war ends on victory, followed by a **48-hour truce**:

- The beaten clan **cannot be re-declared on by the victor** — but the truce
  does **not** pause or prevent any *other* war: existing wars continue, and
  third clans can still declare freely. Losing one war doesn't shield you
  from the rest of the world (or from smelling blood).
- The beaten clan's **Clan Victory clocks are frozen** for the full truce —
  a clan that just lost a war cannot accrue time toward the era win for
  48 hours. Defeat has a price on the ladder, not just in tribute.

Clan war records (wins/losses) are permanent and public — the clan's
reputation across eras.

## Diplomacy

| Stance       | Effect                                                              |
|--------------|---------------------------------------------------------------------|
| **Neutral**  | Default between all clans. No shared information.                   |
| **Friendly** | Mutual (both leaderships accept). Members see each other's **online status** and **when each member was last attacked**. |
| **At war**   | +100% battle damage both ways.                                      |

Friendly intel is the coordination layer: seeing a friend was just attacked
(revenge window open, walls damaged) or is offline (vulnerable) lets allied
clans time joint defense and counterattacks without any formal mechanic.

---

## Build costs (tunable)

| Building     | Cost per level                                              |
|--------------|--------------------------------------------------------------|
| Clan Storage | level × (100k gold + 50k each wood/stone/ore)                |
| Clan Hall    | L1: 50k gold (founding fee) · L2: 500k gold + 250k each · L3: 1.5M + 750k each · L4: 3M + 1.5M each |
| Clan Wonder  | L1: 1M gold + 500k each · L2: 2.5M + 1.25M each · L3: 5M + 2.5M each |

Storage 1 is reachable by 5 founders within their first serious week;
Hall 4 + Wonder 3 is a whole-era project for a full roster. All paid from
the pool — deposits first, always.

## Open / TBD

- [ ] Coordinated attack mechanics (simultaneous strikes, reinforcements) — v2.
- [ ] War goals / scoring (kills tally? tribute on peace?) or purely emergent.
- [ ] Member-to-member transfers happen via the pool (deposit → ally
      withdraws within *their own* 3× cap), so funneling to a fresh account
      is naturally limited — the recipient must have donated first.
- [x] Leaving/kicked members forfeit deposits — **confirmed, always** (see
      Membership churn above; plus 48h rejoin cooldown, 2 departures/era).
