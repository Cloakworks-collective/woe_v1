# War of Empires — Architecture

## High-Level Architecture

```
┌──────────────┐  cmd:* → API routes   ┌──────────────────────┐
│   Browser     │ ────────────────────► │  Next.js on Vercel    │
│  (Next.js UI) │                       │  (API routes = game   │
│               │ ◄──────────────────── │   logic, serverless)  │
└──────────────┘  evt:* ← Supabase     └─────────┬────────────┘
                   Realtime channels              │
                                        ┌─────────┴────────────┐
        Vercel Cron (*/10) ───────────► │  Supabase             │
        tick endpoint                   │  (Postgres + Auth +   │
                                        │   Realtime)           │
                                        └──────────────────────┘
```

---

## Server Architecture

### Turn / Tick System

The game is turn-based with a 10-minute tick interval. Each tick:

1. **Food upkeep** — 0.1 × (civilians + regular troops) deducted; at 0 food the empire **starves**: steps 2–4 and attacking are suspended until fed (`economy.md`).
2. **Tax income** — Every civilian pays `0.4 × taxRate` gold; mercenary upkeep is deducted — unpaid mercenaries defect (see `economy.md`). Regular military has no upkeep.
3. **Production** — Each producer yields `20 × (1 − taxRate)` units of their resource (food, stone, ore, wood, gold-commerce, research), modified by race bonuses.
4. **Stamina recovery** — Idle troops regain 1 stamina point per turn (passive).
5. **The Steward** (premium holders only, `premium.md`) — build queue, research queue, standing orders; issues ordinary instant commands when they become possible.
6. **Daily reset** — Once per day: recruit new peasants based on civilian buildings, reduced by wall damage (see `buildings.md`); then the peasant-scattering check (troops < 30% of civilians → peasants leave).
7. **Queue processing** — Research completion. (Building upgrades and troop training are instant — no construction timers.)

Key design point: food upkeep is deducted *before* production is added each
tick, so a starving empire can't feed itself with the same tick's harvest —
recovery takes a fed tick (farmers) or a Bazaar purchase.

### Starting Conditions (new empire)

| What            | Amount                                      |
|-----------------|---------------------------------------------|
| Gold            | 5,000                                       |
| Resources       | 1,000 each (food, wood, stone, ore)         |
| Population      | 100 — 80 civilians + 20 light footmen       |
| Hearthsteads    | 15 (houses 150)                             |
| Muster Halls    | 2 (20 troop slots — exactly filled)         |
| Action turns    | 200                                         |
| Tax rate        | 50% (default)                               |

- The starting purse is calibrated to build **2–3 entry-level buildings**
  (baseCosts in `buildings.md`).
- **Scattering exemption (confirmed):** empires below **500 total
  population** don't scatter — the starting 20/80 troop/civilian ratio is
  under the 30% line, so without this new players would bleed peasants at
  their first daily reset. First lesson anyway: train more footmen as you
  grow toward the 500 line.

### Target Discovery

No world map. Players find targets through a **browsable ranking list with
search and filters** (name, score range, settlement title, clan, online
recency). The ladder is the world; the XP bands (`combat.md`) make your
±20% score neighborhood the natural hunting ground.

### Peasant & Population System

```
Peasant lifecycle:
  [New Recruit] → [Idle Peasant]
                      │
          ┌───────────┼───────────────┬──────────────┐
          ▼           ▼               ▼              ▼
      [Worker]    [Warrior]    [Spy/Scout]    [Siege Engineer]
          │           │
          │     ┌─────┼──────┐
          │     ▼     ▼      ▼
          │  [Footman][Archer][Cavalry]   ← equipped with weapons/armour
          │     │
          │     ▼
          │  [Disband] → back to [Warrior] (lose equipment cost)
          │
    ┌─────┼──────┬────────┐
    ▼     ▼      ▼        ▼
  [Farmer][Miner][Lumberjack][Other]
```

- Daily recruitment: scales with total civilian building levels, from 1/day to 100/day when all 13 civilian buildings hit level 10 (formula in `buildings.md`).
- Damaged walls reduce the raw daily number by up to 50% (proportional to damage); repairing fully restores it. Intact or absent walls have no effect.
- Worker output and tax income per `economy.md` (tax-scaled).

### Race System

Every race's bonuses and penalties **sum to zero** (in ±10/20% steps) —
Humans are the flat-1.0 baseline, okay at everything, bad at nothing.
Research speed is identical for all races.

```ts
interface RaceModifiers {
  production: { food: number, wood: number, stone: number, ore: number }
  attack: number                 // global, all troops
  defence: number                // global, all troops
  units: { footman: number, archer: number, cavalry: number }  // per-type atk & def
  siege: number                  // siege damage dealt
  spy: number                    // mission effectiveness
  scout: number                  // recon + catch chance
  mercCost: number               // mercenary price factor
}
```

| Modifier   | Human | Elf  | Orc  | Troll | Dwarf | Gnoll |
|------------|-------|------|------|-------|-------|-------|
| Food       | 1.0   | 1.0  | 1.0  | 1.0   | 0.8   | 1.1   |
| Wood       | 1.0   | 1.2  | 0.9  | 0.9   | 0.8   | 0.9   |
| Stone      | 1.0   | 1.0  | 0.9  | 1.2   | 1.0   | 0.9   |
| Ore        | 1.0   | 1.0  | 1.1  | 0.9   | 1.2   | 1.0   |
| Attack     | 1.0   | 1.0  | 1.1  | 1.0   | 0.9   | 1.0   |
| Defence    | 1.0   | 1.0  | 1.0  | 1.0   | 1.1   | 0.9   |
| Footman    | 1.0   | 1.0  | 1.0  | 1.1   | 1.1   | 1.0   |
| Archer     | 1.0   | 1.2  | 1.0  | 0.9   | 1.0   | 0.9   |
| Cavalry    | 1.0   | 0.8  | 1.2  | 0.8   | 1.0   | 1.0   |
| Siege      | 1.0   | 0.8  | 0.9  | 1.2   | 1.1   | 0.8   |
| Spy        | 1.0   | 1.0  | 0.9  | 1.0   | 1.0   | 1.2   |
| Scout      | 1.0   | 1.0  | 1.0  | 1.0   | 1.0   | 1.2   |
| Merc cost  | 1.0   | 1.0  | 1.0  | 1.0   | 1.0   | 0.9   |

Identities: **Elves** — archers from the deep woods (wood +20, archer +20 /
cavalry −20, siege −20). **Orcs** — the cavalry horde (cavalry +20, attack
+10, ore +10 / wood, stone, spy, siege −10 each). **Trolls** — stone and
siege (stone +20, siege +20, footman +10 / cavalry −20, archer, wood, ore
−10 each). **Dwarves** — the iron wall (ore +20, defence, footman, siege
+10 each / attack −10, food −20, wood −20). **Gnolls** — jackal spymasters:
best espionage in the game and cheap sellswords, living off the land (spy
+20, scout +20, food +10, mercs −10%) but poor builders and formal soldiers
(siege −20, defence, archer, stone, wood −10 each).

### Troop & Equipment System

Warriors are peasants trained for combat. They must then be **equipped** with weapons and armour (costing gold + resources) to become a specific unit type.

**Equipment tiers** unlock via military building upgrades:
- Light → Medium → Heavy (progressively stronger, more expensive)
- "One heavy troop ≈ three light troops" in combat effectiveness.

**Disband:** strips equipment (resources lost), returns the warrior for re-equipping.

```ts
interface TroopUnit {
  type: "footman" | "archer" | "cavalry"
  tier: "light" | "medium" | "heavy"  // unlocked by building level
  attack: number
  defence: number
}

interface ArmyState {
  footmen: { tier: string, count: number }[]
  archers: { tier: string, count: number }[]
  cavalry: { tier: string, count: number }[]
  siegeEngineers: number
  siegeGear: {            // offensive equipment, needs engineer crews (buildings.md)
    ropes: number
    ladders: number
    rams: number
    ballistae: number
    trebuchets: number
  }
  spies: number
  scouts: number
  mercenaries: number     // die before regular troops; max 25% of regular army
  stamina: number         // 0-100, affects combat effectiveness
  experience: number      // affects combat bonuses/penalties
}
```

### Stamina System

- Troops lose stamina from combat.
- Low stamina → reduced attack and defence multipliers.
- **Rest action:** 5 action turns + 0.2 food/troop → +20 stamina, whole army.
- **Passive recovery:** 1 stamina point per turn (if not fighting).
- Food is population upkeep, deducted before production each tick — run dry and the empire freezes (`economy.md`).

### Experience System

- XP gain depends on the target's ranking score vs yours (bands in
  `combat.md`): ±20% = +5, punching 20–75% up = +8, 20–50% down = +1,
  >50% down = −5. Targets ≥75% stronger: troops refuse to attack.
  Defenders always gain +5.
- Combat multiplier: `1 + XP/100` — up to ×2 at 100 XP.
- Losing regulars loses XP proportionally: `newXP = XP × (1 − regularsLost/regularsBefore)`. Mercenary deaths cost no XP.
- Experience is a global army stat, not per-unit.

### Peasant Scattering (population warfare)

- Checked at the daily reset: if `troops < 0.3 × civilians`, peasants scatter
  down to `floor(troops / 0.3)` civilians — idle first, then workers, then
  specialists (see `combat.md`).
- Empires below **500 total population** are exempt — no scattering, ever
  (see Starting Conditions).
- The reset timing is the deliberate grace window: instant training lets a
  defeated player race to rebuild their army before the population walks.

### Combat Engine

Full resolution algorithm, unit stats, damage formulas, and worked examples
live in **`combat.md`**. Summary:

- Battles run up to **10 rounds**, each round four phases: siege → archers →
  cavalry → footmen. Siege phase and wall bonus apply only in siege/revenge;
  raids are open-field; bombard is engines-only.
- Damage: proportional across groups (siege, archers) or targeted with
  spill-through (cavalry, footmen). Casualties = damage / (k × effective
  defence); mercenaries die first.
- Modifiers: race, equipment tier, stamina, experience, research (Art of
  War / Shieldcraft / Siegecraft), and the defender's wall bonus
  (level × 10% × integrity, reduced by escalade and siege).
- War Foundry offense/defense pairs: each defensive installation counters its
  paired weapon at 75% (see `buildings.md`).
- A side breaks below 30% remaining strength; victory/loot/wall-integrity/
  stamina/experience outcomes per `combat.md`.

### Attack Mode Logic

Every attack costs **10 action turns**. Action turns accrue at 2 per game
turn (10 min); new players start with 200 (cap 500, tunable).

#### Raid
- Field army vs field army — no walls, no siege phase.
- Victor steals resources sitting **outside storage** (fields, mines, woodlots).
- Size-based loot scaling (bigger target = bonus; much smaller = reduced).

#### Siege
- Full assault: siege weapons vs walls, then the 4-phase battle.
- Victor steals **unbanked gold plus unstored resources**.
- Wall integrity damage persists after battle (pop-growth penalty until repaired).

#### Revenge Attack
- **Precondition:** defender attacked you within last 18 hours.
- Ignores surrender, low defender stamina, and mercy rules entirely.
- Goal: kill troops. No loot.
- One-time use per attacker (resets if they attack you again).
- A revenge attack opens a fresh 18h revenge window for its victim (chains).
- Clan-building bombardment (clan war): the attacked clan gets ONE revenge
  attack, executable by any member present at attack time (snapshot, 18h,
  consumed by whoever strikes first).
- Walls still matter — failing to breach = possible loss.

#### Bombard
- Pure artillery duel: attacker's trebuchets (+ crews) vs the defender's
  Counter-Engine. No troop combat, no loot, no victor, **no target choice**.
- Pounds the **walls first**; once they are breached (≤50% integrity), the
  fire spills onto **random town buildings** (weighted: storages > production
  > Collegium). Every building has a 50% integrity floor and gameplay-
  affecting integrity (storage protection, production output, research speed).
  The softening strike before a siege or raid.

#### Mercy rules
- Raid, siege, and bombard cannot target surrendered players or defenders
  with army stamina < 25 (beaten down). Revenge can.
- Surrender: voluntary; blocks all attacks except revenge, halves tax income,
  and prevents attacking. Lifted manually or by attacking.

### Building System

Three categories:

#### Defences
- Walls (multiple levels) — reduce incoming damage. No recruitment bonus; damaged walls cut daily recruitment by up to 50% until repaired.
- Fortifications — additional defensive bonuses.

#### Civilian Buildings
- Drive daily peasant recruitment from base 1/day to a cap of 100/day (tree, prerequisites, and per-level values in `buildings.md`).
- **Storage** — protect portion of resources from being plundered (no recruitment bonus).

#### Military & Specialty
- **Barracks upgrades** — unlock higher troop tiers (light → medium → heavy).
- **War Foundry (siege)** — 10 levels alternating offensive weapon / defensive counter, five pairs from Ropes & Grapples to Counter-Engine (see `buildings.md`).
- **Research facility** — unlock technologies.
- **Marketplace** — trade resources with other players.
- **Bank** — protect portion of gold from being stolen.
- **Shadow Guild** — spy capacity (20/level) and mission effectiveness (+10%/level).
- **Ranger's Lodge** — scout capacity (20/level); level gates which spy-op levels your scouts can catch (see `espionage.md`).

Buildings have levels; upgrades cost resources and complete instantly (no timers).

### Clan System

Full design in `clans.md`. Summary: 5 leadership positions (leader, vice, 3
officers) build clan buildings from a shared storage pool; Clan Hall caps
membership (5→20); Clan Wonder discounts mercenary/troop/siege costs for all
members (−10/20/30%); wars double battle damage; friendly clans share
online/last-attacked visibility.

```ts
interface Clan {
  id: string
  name: string
  leaderId: string
  viceLeaderId?: string
  officerIds: string[]        // max 3
  members: string[]           // player IDs, capped by Clan Hall level (5/10/15/20)
  buildings: {
    storageLevel: number      // 0-10; capacity 250k × level per resource
    hallLevel: number         // 1-4; member cap
    wonderLevel: number       // 0-3; -10%/lvl merc, troop, siege costs
    integrity: { storage: number, hall: number, wonder: number }  // 0-1; bombardable in clan war
  }
  storage: { gold: number, food: number, wood: number, stone: number, ore: number }
  memberLedger: Record<string, {          // per player, per resource — enforces the 3× rule
    deposited: Record<string, number>     // lifetime deposits
    withdrawn: Record<string, number>     // lifetime withdrawals (building spends excluded)
  }>

  wars: {                     // active wars (+100% battle damage)
    clanId: string
    regularKills: number      // our kills of their regulars
    regularLosses: number     // their kills of ours; net +200 kills = war victory
  }[]
  warRecord: { wins: number, losses: number }   // permanent, public
  tributeIncoming?: { fromClanId: string, endsAtTurn: number, collectedValue: number }  // 20%/turn for a day, cap 1M gold-eq
  friendly: string[]          // mutual friendly clans (share online/last-attacked)
  chat: ChatMessage[]
}
```

### Black Market

- Purchase mercenaries with gold.
- Mercenaries add to troop totals, capped at 25% of regular army headcount.
- Per-turn gold upkeep; unpaid mercenaries defect.
- Mercenaries die before regular troops in combat (expendable buffer).

### Social System (forum-style)

Three channels, different lifetimes:

| Channel       | Scope                | Lifetime                          |
|---------------|----------------------|-----------------------------------|
| **Era chat**  | Global, everyone     | Wiped when the era ends           |
| **Clan chat** | Clan members         | Wiped when the era ends           |
| **DMs**       | Player ↔ player      | **Permanent** — persists across eras |

Forum-style threads (not just a scrolling feed): posts, replies, timestamps.
Permanent things that survive era resets: DMs, player accounts/titles, clan
war records, era history (winners' names). Everything in-world (chat, state,
ladder) resets with the era.

### Protection Windows

- **Era peace:** all attacks disabled for the first **5 days** of an era.
- **Newcomer shield:** 72 hours of attack immunity on joining mid-era;
  attacking drops your shield early. Spy missions vs protected players are
  also blocked. (Both implemented provisionally — pending final confirmation.)
- Scattering exemption below 500 population (see Starting Conditions).

### Advisor System (Command View)

Server computes advisor recommendations based on player state:

```ts
interface AdvisorReport {
  defensive: {
    wallLevel: number
    recommendation: string    // e.g. "Upgrade walls to level 3"
  }
  military: {
    troopReadiness: string
    recommendation: string    // e.g. "Rest your troops, stamina is low"
  }
  economic: {
    productionRate: ResourceRates
    recommendation: string    // e.g. "Train more miners, ore production is low"
  }
  population: {
    dailyRecruitment: number
    recommendation: string    // e.g. "Build more housing to increase recruitment"
  }
}
```

---

## Data Model

### Player
```ts
interface Player {
  id: string
  name: string
  race: "human" | "dwarf" | "elf" | "orc" | "troll" | "gnoll"

  // Premium — the Royal Charter (premium.md)
  premium?: boolean            // unlocks the Steward
  buildQueue?: BuildingId[]    // FIFO; head built when affordable (≤10)
  researchQueue?: { field: string, toLevel: number }[]   // one entry = one level (≤10)
  standingOrders?: StandingOrder[]   // "once X, do Y" (≤10)

  clanId?: string
  clanDepartures: number    // leaves + kicks this era; at 2, no more joining (clans.md)
  clanJoinableAt?: Date     // 48h cooldown after leaving/being kicked

  // Population
  idlePeasants: number
  workers: {
    farmers: number
    quarrymen: number
    miners: number
    lumberjacks: number
    merchants: number      // capped by Market Square level × 20
    researchers: number    // capped by Collegium level × 20
  }
  warriors: number          // trained but unequipped
  army: ArmyState

  // Economy
  gold: number
  taxRate: number           // 0.0 – 1.0, default 0.5
  resources: {
    food: number
    wood: number
    stone: number
    ore: number
  }
  turnsAvailable: number    // action turns: +2 per game turn, start 200, cap 500; attacks cost 10
  surrendered: boolean      // blocks all attacks except revenge; halves tax; can't attack

  // Buildings
  buildings: BuildingState[]
  wallIntegrity: number     // 0.0–1.0; damaged walls cut pop growth (buildings.md)
  buildingIntegrity?: Partial<Record<BuildingId, number>>  // 0.5–1.0, absent = full; bombard damage (buildings.md)

  // Research (research.md)
  research: {
    activeField?: string
    banked: Record<string, number>   // RP progress per field
    levels: Record<string, number>   // 0–5 per field
  }

  // Stats
  battlesWon: number
  battlesLost: number
  goldWon: number
  goldLost: number
  resourcesWon: Record<string, number>
  resourcesLost: Record<string, number>

  // Revenge tracking
  recentAttackers: { playerId: string, timestamp: Date }[]
  revengeUsed: string[]     // player IDs already revenged
}
```

### Building
```ts
interface BuildingState {
  type: string              // "walls", "muster_hall", "grange", "hearthstead", etc.
  level: number             // levelled buildings; for counted buildings (hearthstead, muster_hall) this is the count
}
```

### Battle Log
```ts
interface BattleReport {
  id: string
  attackerId: string
  defenderId: string
  mode: "raid" | "siege" | "revenge" | "bombard"
  turnsUsed: number
  phases: CombatPhaseResult[]   // siege, archers, cavalry, footmen
  attackerLosses: UnitLosses
  defenderLosses: UnitLosses
  staminaLoss: { attacker: number, defender: number }
  wallIntegrityDamage: number   // % of defender's wall destroyed (persists until repaired)
  buildingDamage?: { building: BuildingId, integrityLost: number }[]  // bombard: town buildings cracked open
  siegeGearLost: { attacker: Record<string, number> }
  victor: "attacker" | "defender"
  loot: {
    gold?: number
    resources?: Record<string, number>
  }
  experienceChange: { attacker: number, defender: number }
  timestamp: Date
}
```

---

## Networking Protocol

Logical protocol: `cmd:*` are Next.js API routes (request/response);
`evt:*` are delivered via Supabase Realtime channels (see Engineering
Decisions). The tables below define the contract, not the transport.

### Auth: session cookie + realm tokens

Two credentials open the same empire:

- **Browser session cookie** — set on found/re-enter (Supabase Auth takes
  this over later).
- **Realm token** (`woe_…`, per empire) — bearer credential for the CLI and
  any headless client (`Authorization: Bearer` or `X-Realm-Token`). Minted
  at creation (and lazily backfilled), shown in the Command View ("Rule
  from the terminal") and by `woe token`; also re-enters the empire at the
  login gate. Server-managed field on the Player doc — never game state.

### Read endpoints (JSON, for CLI / agent clients)

| Route                | Returns                                              |
|----------------------|------------------------------------------------------|
| `POST /api/join`     | Found an empire: `{name, race}` → realm token (the only unauthenticated route) |
| `GET /api/state`     | Own empire: meta, population, economy + production, army, buildings (+next costs), research, steward, advisors, chronicle, revenge windows |
| `GET /api/rankings`  | The public ladder (target discovery — id, name, race, title, clan, score, shield/surrender flags) |
| `GET /api/market`    | Bazaar board (price + supply per resource) and own caravans — counterparties never exposed |
| `GET /api/battle/:id`| Full battle report — participants only               |
| `GET /api/battles`   | The public **War Ledger**: last 100 battles, redacted (aggregate losses, gear count, wall/storage % — never composition, loot, or the log) |
| `GET /api/empire/:id`| Public profile: ladder facts + that empire's recent battles and aggregate battle totals (same redaction) |

Every read runs due wall-clock ticks first, like every page and command.

### Client → Server (commands)

| Type                 | Description                                  |
|----------------------|----------------------------------------------|
| `cmd:setTax`         | Set tax rate (0–100%)                        |
| `cmd:trainWorker`    | Train peasant as a worker type               |
| `cmd:trainWarrior`   | Train peasant as warrior                     |
| `cmd:equipTroop`     | Equip warrior as footman/archer/cavalry      |
| `cmd:disbandTroop`   | Strip equipment, return to warrior           |
| `cmd:restTroops`     | Spend turns + food to restore stamina        |
| `cmd:build`          | Start or upgrade a building                  |
| `cmd:research`       | Set the active research project (field)      |
| `cmd:attack`         | Launch attack (mode: raid/siege/revenge/bombard, target) — 10 action turns |
| `cmd:surrender`      | Raise or lift the white flag                 |
| `cmd:spy`            | Spy mission (op type, target, spies sent) — 5 action turns |
| `cmd:scout`          | Scout recon against target — 2 action turns  |
| `cmd:trade`          | Post or accept marketplace trade             |
| `cmd:bankDeposit`    | Deposit gold in bank                         |
| `cmd:buyMercenary`   | Purchase mercenaries from black market       |
| `cmd:clanDeposit`    | Deposit gold/resources into clan storage     |
| `cmd:clanWithdraw`   | Withdraw from clan storage (≤ 3× lifetime deposits) |
| `cmd:clanManage`     | Leadership: build, appoint, invite/kick, declare war, set diplomacy |
| `cmd:chat`           | Post to era chat, clan chat, or DM (forum-style) |
| `cmd:queueBuild` / `cmd:queueBuildCancel` | Premium: manage the Steward's build queue (`premium.md`) |
| `cmd:queueResearch` / `cmd:queueResearchCancel` | Premium: manage the research queue |
| `cmd:orderAdd` / `cmd:orderRemove` | Premium: standing orders ("once X, do Y") |

### Server → Client (events)

| Type                    | Description                              |
|-------------------------|------------------------------------------|
| `evt:stateSync`         | Full state on connect                    |
| `evt:turnTick`          | Resource/gold production update          |
| `evt:dailyRecruitment`  | New peasants arrived                     |
| `evt:buildComplete`     | Build/upgrade confirmed (instant — direct response to `cmd:build`) |
| `evt:researchComplete`  | Research field level finished            |
| `evt:espionage`         | Mission result (attacker) / damage or caught-spy report (defender) |
| `evt:ranking`           | Ladder updates; #1 hold-timers (72h/12h) for era victory |
| `evt:battleReport`      | Full combat result                       |
| `evt:attacked`          | You were attacked (enables revenge)      |
| `evt:advisorUpdate`     | Updated advisor recommendations          |
| `evt:clanEvent`         | War declared, member joined/left, etc.   |
| `evt:chat`              | Incoming chat message                    |
| `evt:marketUpdate`      | Trade completed or new listing           |

---

## Client Architecture

Three clients, one backend:

- the **Next.js web UI**;
- **`cli/woe.mjs`** — a zero-dependency Node terminal client (`pnpm woe`)
  speaking realm-token auth over the same `cmd:*` pipeline + read
  endpoints. Full-color ANSI + ASCII art (castle banner, battle standards,
  trophy/skull); `join` founds an empire entirely from the terminal;
- the **Claude Code plugin** (`claude-plugin/`, marketplace manifest at
  `.claude-plugin/marketplace.json`): `/woe` slash command + a
  `playing-war-of-empires` skill (API reference, rules digest, strategy,
  ASCII dashboard templates) that lets Claude play as the user's herald
  over plain HTTP. Same tokens, same authority: the server validates
  everything, so agent play can't cheat. An MCP server on the same surface
  remains an option later.

### Visual direction (decided)

**Classic browser-strategy aesthetic — Travian / Tribal Wars.** Parchment
backgrounds, wood-and-gold chrome, small type (Verdana ~13px body, Georgia
serif headers), dense bordered data tables, beveled panels. Persistent top
resource bar and left navigation; server-rendered pages, minimal animation.
No world map (the ladder is the world), no heavy SPA effects. Hand-rolled
CSS (no UI framework) — the retro look *is* the design system.

### Pages / Views

- **Home / Command View** — Empire overview, historical stats, advisor panel.
- **Train** — Assign peasants to worker classes or military roles.
- **Troops** — Equip warriors, manage army composition, disband, rest.
- **Rankings** — Browsable ladder with search/filters; the primary target-discovery surface (no world map).
- **Attack** — Select target, choose mode and turns, view battle results.
- **Buildings** — Construct and upgrade defences, peasant, and military buildings.
- **Clan** — Clan management, chat, resource transfers, war declarations.
- **Black Market** — Purchase mercenaries.
- **Spy/Scout** — Launch espionage and recon operations.

### UI Elements
- Resource bar (gold, food, wood, ore) — always visible.
- Turn counter / next turn timer — always visible.
- Next day timer (for peasant recruitment) — bottom left.
- Stamina indicator for army.
- Advisor notifications/alerts.

---

### Admin — the Crown Chamber (`/admin`)

Hidden console (no nav link), enabled only when `ADMIN_PASSWORD` is set;
the session cookie is an HMAC keyed by the password (unforgeable without
it, timing-safe check). Crown decrees bypass the game pipeline:

- **Banish / pardon** — `player.banned` blocks the session cookie, the
  realm token, and every command; the empire remains in the world (still
  ticks, still attackable) until pardoned.
- **Royal grant** — give (or take, negative) gold/resources; the player
  sees "👑 A royal grant arrives" in their Chronicle.
- **Force turns** — +1 / +144 / N ticks (cap 1,008) on top of the wall
  clock; works in production, unlike the dev clock.
- **Grant / revoke the Royal Charter** (premium flag).

## Security & Validation

- Server is authoritative — all commands validated server-side.
- Resource checks before any action (sufficient gold, resources, turns, peasants).
- Prerequisite checks (building level requirements for troop tiers).
- Revenge attack: verify attacker was attacked within 18 hours (or their clan's buildings were bombarded while they were a member), hasn't already revenged.
- Mercy checks: raid/siege/bombard blocked vs surrendered or stamina < 25 defenders.
- Protection checks: era peace (first 5 days) and 72h newcomer shield block all attacks.
- Action-turn balance checked before any attack (10 per attack).
- Rate limiting on attacks (prevent abuse / excessive targeting).
- Anti-farming: reduced loot and XP loss for attacking much smaller players; mercy rules block repeat attacks on beaten-down targets.
- Attack refusal: troops refuse targets ≥75% stronger by ranking score (revenge exempt).
- Clan membership churn: joining blocked during the 48h post-departure cooldown and after a player's 2nd departure of the era (see `clans.md`).

---

## Engineering Decisions

**Stack: Next.js on Vercel + Supabase. Everything deploys with `git push`.**

- **App:** one Next.js repo (App Router). UI pages + API route handlers in
  the same deployment. The game engine is a **pure TypeScript module**
  (`lib/engine/` — all rules; `lib/constants/` — every number in these
  specs), imported by API routes, the cron handler, and sim scripts alike.
  No side effects in the engine: `(state, command|tick) → (state, events)`.
- **DB + Auth:** **Supabase** — Postgres for state, Supabase Auth
  (email/password) for accounts. Player state as a JSONB document (one row
  per player, versioned for optimistic concurrency); normalized tables for
  market orders, battle reports, clans, chat/forum, rankings snapshots, and
  the era registry. DMs and era history live outside the per-era wipe.
  Writes go through API routes with the service role; RLS restricts direct
  client reads to each player's own rows and public data (ladder, forum).
- **Realtime (`evt:*`):** **Supabase Realtime** replaces the WebSocket
  server — serverless can't hold sockets. API routes and the tick write
  events to an `events` table / broadcast channels; clients subscribe to
  their own channel (private events), their clan channel, and public
  channels (ladder, era chat, market prices).
- **Tick:** **Vercel Cron** hits `/api/tick` every 10 minutes (secured by
  `CRON_SECRET`); a designated tick runs the daily reset + scattering.
  Ticks are numbered and idempotent — the handler processes all ticks since
  `lastProcessedTick`, so missed or delayed cron runs catch up safely.
  All time-windows (revenge, unrest, truce, tribute, shields, victory
  hold-clocks) are stored as timestamps and evaluated on tick + on access —
  never via in-process timers.
- **Commands (`cmd:*`):** each is an API route through one pipeline:
  auth → validate → apply (pure engine) → persist (optimistic version
  check) → publish events. The client never computes outcomes.
- **Sim:** the same pure engine driven by scripts (`pnpm sim`) for balance
  tuning — no server needed.
- **Payments:** **Stripe Checkout** for the Royal Charter premium
  (`premium.md`): hosted checkout page, webhook + success-redirect
  verification, idempotent grant. Dual-mode like the store — without
  `STRIPE_SECRET_KEY` a built-in terminal emulates Stripe's test cards
  (4242 4242 4242 4242) so the flow works with zero setup.

Constraints accepted with this stack: cron minimum granularity fits the
10-min tick; `/api/tick` must finish within serverless limits (fine at
launch scale — batch by player, resume via `lastProcessedTick` if needed).

**Current implementation status.** Supabase project `war-of-empires`
(`jmidtuoxclntwluygiab`, us-west-1) is live: migrations applied, and the
store (`lib/server/store.ts`) persists the whole World as a versioned JSONB
document (`world_docs`, migration 0002) whenever the env keys exist —
serverless-safe today. Falls back to a JSON file (`data/world.json`) with
no env keys. Still pending: decomposing the world doc into the normalized
0001 tables, Supabase Auth (a session cookie stands in), and Realtime
(page-load refresh stands in). The `cmd:*` protocol is live at
`POST /api/cmd/[name]`; UI forms use server actions calling the same
pipeline (`lib/server/pipeline.ts`). `/api/tick` + Vercel Cron
(`vercel.json`) do wall-clock catch-up ticks; without a `CRON_SECRET`,
in-game dev time controls (+1 turn / +1 day) are enabled.

## Open Questions / TBD

Resolved (see the dedicated docs):
- [x] Production rates — `economy.md` (tax-scaled, 20/turn at 0% tax; race modifiers still TBD).
- [x] Combat formulas — `combat.md` (unit stats, damage, breaking, aftermath).
- [x] Building cost model — `buildings.md` (ratio bands, 1.5× curve; per-building baseCost values still TBD). Upgrades are instant; no prerequisite tree beyond Forge gating.
- [x] Troop equipment costs — `buildings.md` (light ×1 / medium ×2 / heavy ×4).
- [x] Stamina drain — `combat.md` (−8/round attacker, −5/round defender); rest cost formula still TBD.
- [x] Experience — `combat.md` (+5/battle, ×2 at 100 XP, proportional loss with dead regulars).
- [x] Marketplace — `market.md` (anonymous Grand Bazaar, caravans, 5% fee).
- [x] Bank/storage protection — `buildings.md` (5% per level, max 50%).
- [x] Daily recruitment — `buildings.md` (civilian levels → 1–100/day, wall-damage penalty).

- [x] Victory & ranking — `victory.md` (Grand Overlord / Clan win, 72h cumulative + 12h straight at #1; score components and exclusions).

- [x] Race modifiers — sum-zero table above.
- [x] baseCosts, storage capacities, rest action — `buildings.md` / `combat.md`.
- [x] Spy and scout operations — `espionage.md` (Tradecraft op ladder, catch mechanics, scout counter-espionage).
- [x] Clan buildings & costs — `clans.md`. Coordinated-attack mechanics still v2.
- [x] Client stack, DB, auth, tick engine, deployment — Engineering Decisions above (Next.js on Vercel, Supabase Postgres/Auth/Realtime, Vercel Cron).

Still open:
- [ ] Numeric tuning via simulation (ranking weights, lethality k, cost curves).
