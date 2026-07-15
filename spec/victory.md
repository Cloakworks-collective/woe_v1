# War of Empires — Victory & Eras

The game runs in **eras** (server seasons). An era ends when someone wins —
and **the next era is named after the winner**. Two ways to win.

---

## 1. Grand Overlord (individual)

**Population floor: 10,000** (civilians + regular troops; mercenaries never
count). The victory clocks only tick while you're above the floor — #1 spot
held below 10k population accrues nothing.

Hold the **#1 ranking spot**:

- **72 hours cumulative** at #1 (the cumulative clock only ticks while you
  hold #1 *and* meet the floor; it never resets), **and**
- **12 hours consecutive** at #1 (this streak restarts every time you lose
  the top spot — or drop below the floor).

Win the moment both are true. So a contender must not just touch #1 — they
must *defend* it: rivals have every incentive to bombard, revenge, and
scatter the leader's population to break the 12-hour streak. Scattering is
double poison for a would-be Overlord near 10k: it cuts score *and* can
stop the clock entirely.

## 2. Clan Victory

Same structure, clan-scale: the clan's score is the **sum of member scores
plus clan building points**, and it must hold **#1 clan** for 72 hours
cumulative + 12 consecutive.

| Clan building | Points                                   |
|---------------|------------------------------------------|
| Clan Storage  | 500 × level × integrity                  |
| Clan Hall     | 2,000 × level × integrity                |
| Clan Wonder   | 10,000 × level × integrity               |

Integrity scaling means **bombarding a rival clan's buildings directly cuts
their clan score** — at the cost of clan-wide revenge exposure (`clans.md`).

**Population floor: 150,000 total across the clan** (civilians + regular
troops, no mercenaries). Below it, the clan's clocks freeze. A full 20-member
clan needs to average 7.5k population per member — clan victory requires a
broad, developed roster, not one whale and nineteen passengers.

**War defeat freezes the clocks too:** a clan that loses a clan war accrues
no victory time during the 48-hour post-war truce (`clans.md`). Beating the
#1 clan in a war is therefore a direct play against their era win.

Whichever trigger fires first — Overlord or Clan — ends the era. The next
era bears the winner's name: *"The Era of \<clan name\>"* (or the Overlord's
empire name for an individual win).

---

## Ranking score

Ranking measures the **visible empire** — what a traveler would see riding
through. Covert and siege assets count for nothing.

| Component                          | Points                                        |
|------------------------------------|-----------------------------------------------|
| Civilian population                | 10 per citizen                                |
| Regular troops                     | 10 × tier power (light ×1, medium ×1.8, heavy ×3) |
| Walls                              | level² × 100, scaled by current integrity     |
| Levelled buildings (civilian + military) | 200 per level                           |
| Hearthsteads / Muster Halls        | 50 per building                               |
| Treasury                           | gold ÷ 100 + resources ÷ 2,000 (bulk goods valued ≈ 0.05 g; was ÷ 50 pre-sim) |
| Army experience                    | 100 × XP (0–100) — veterancy is prestige      |
| Research (eligible fields)         | 1,000 × level                                 |

**Excluded — worth zero points:**
- Siege: engineers, siege gear, Siegecraft research
- Espionage: spies, scouts, Shadow Guild/Ranger's Lodge do count as building
  levels, but Tradecraft and Pathfinding research do **not**
- Mercenaries (rented, not owned)
- Clan buildings (they're the clan's, not yours)

**Research that helps your ranking** (the "some research" rule): Crop
Rotation, Forestry, Masonry, Deep Smelting, Art of War, Shieldcraft,
Statecraft — 7 of 10 fields. The excluded three (Siegecraft, Tradecraft,
Pathfinding) mirror the excluded assets: the tools of destruction and
shadow bring power, not prestige.

### Design consequences (intended)

- Wall damage (integrity scaling) and population scattering directly cut the
  leader's score — **bombard and revenge are the anti-Overlord weapons**,
  and neither adds a point to the attacker's own score.
- A pure siege/spy empire is powerful but invisible on the ladder; a
  contender must build the *visible* empire and then protect it.
- Treasury counts, so sitting on unbanked gold is score — and bait.

---

## The Annals (grand chronicle)

Every age keeps a **world-wide chronicle** — the significant public events of
the realm, distinct from each player's private Chronicle (their own inbox).
The Annals record: the age dawning, **the crown changing hands** (a new #1 on
the ladder), **clan wars declared and won**, **castles sacked** (successful
sieges, with the gold carried off), and the **victory** that ends the age.
Entries are tone-coloured and time-stamped; the live feed is the page
`/annals`.

When an age ends, its Annals are **sealed for good** — archived with the era
name, the victor, and the final top-10 ladder — and carried forward across
every future reset as the realm's history books. The next age opens its own
fresh Annals with a naming entry. (Implementation: `world.chronicle` live +
`world.chronicleArchive[]` sealed; `eraReset()` does the sealing.)

## Era transition

- Winner declared → era closes; final ladder is frozen and archived; the age's
  **Annals are sealed** into the history books.
- Next era: fresh world, named after the winner. The first **5 days are at
  peace** — no attacks while everyone rebuilds (`combat.md`).

**What persists across eras:** player accounts and titles, era history
(winners' names **and the sealed Annals of every past age**), clan identities
and war records, and **DMs**. Everything else resets — empires, the ladder,
era chat, and clan chat are wiped. Permanent trophies: the era name, plus
"Grand Overlord \<name\>" or founding membership of the winning clan.

## Open / TBD

- [ ] Era hard cap (e.g. 12 weeks with no winner → highest cumulative #1 time wins)?
- [ ] Exact component weights need simulation against real empire snapshots.
- [ ] Anti-throne-camping: does the #1 player get marked on the world (visible target)? Proposal: yes — the crown is public.
