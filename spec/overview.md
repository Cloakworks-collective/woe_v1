# War of Empires (WoE) — Game Overview

## Concept

War of Empires is a persistent, turn-based multiplayer strategy game where players manage empires — training peasants as workers or soldiers, building infrastructure, and waging war against other players. The game runs in real time (resources generated every 10 minutes per turn), and empires persist while players are offline.

## Races

There are 6 playable races, each with distinct bonuses and penalties:

| Race     | Strengths                                          | Weaknesses                               |
|----------|----------------------------------------------------|------------------------------------------|
| Humans   | +25% all production, best spies, solid troops      | No specialty; average walls and siege    |
| Elves    | Best archers, wood production                      | Poor stone/ore, frail, weak siege        |
| Orcs     | Best cavalry, food & ore production                | Poor wood, weak siege, soft walls        |
| Trolls   | Best siege, stone production, strong footmen       | Poor cavalry, archers, food              |
| Dwarves  | Best footmen & walls, stone/ore mining             | Very poor wood, poor food, slow cavalry  |
| Gnolls   | Skirmisher archers, best counter-intel, wood       | Poor stone, frail                        |

(Exact multipliers — balanced by equal-cost army power, not sum-zero — in
`architecture.md`; ported from the original 2006 balance workbook.)

## Core Loop

1. **Recruit** — Receive peasants daily (base 1/day, up to 100/day via civilian buildings; damaged walls cut growth up to 50% — see `buildings.md`).
2. **Train** — Assign peasants as workers (gold + resources per turn) or military (warriors, engineers, spies, scouts).
3. **Equip** — Arm warriors with weapons and armour to create footmen, archers, or cavalry at various strength levels.
4. **Build** — Construct defences, peasant buildings, and military/specialty buildings to unlock capabilities.
5. **Attack** — Launch raids, sieges, revenge attacks, or bombardments against other players (10 action turns each).
6. **Manage** — Monitor stamina, food, experience, and use advisors to guide strategy.

## Economy

- **Taxes** are the kingdom's gold engine: 0–100% rate, ~29 gold/citizen/**day** at the 50% default (0.4/turn at 100%). Production drops inversely — producers yield 20 units/turn at 0% tax. Gold is scarce, resources are bulk (see `economy.md`).
- **Resource types:** Gold, Food, Wood/Lumber, Stone, Ore/Metal. 1 turn = 10 minutes.
- Military pays no tax and costs no upkeep — except mercenaries (paid per turn or they defect; max 25% of regular army).
- Food is population upkeep (0.1/person/turn): if it runs out, **everything stops** — production, research, taxes, growth, attacking — until the empire is fed. Attacks themselves are instantaneous and cost no food.
- Resources outside storage can be stolen via raids; gold and resources via sieges.
- Resource storage buildings protect a portion from being plundered.

## Military

### Unit Types
- **Footmen** — Melee infantry, various tiers (light → heavy). Attack order: footmen → archers → cavalry → engineers.
- **Archers** — Ranged units, damage distributed proportionally across enemy army. Fire before melee.
- **Cavalry** — Mobile, strike from flanks. Attack order: cavalry → footmen → engineers → archers.
- **Siege Engineers** — Operate siege weapons; target walls and all troops proportionally. Fire first in battle.
- **Spies** — Espionage: intel, sabotage, arson, unrest (op list by Tradecraft research, `espionage.md`). More spies sent = more damage but higher catch risk; caught spies are executed (population loss).
- **Scouts** — Reconnaissance on opponents + counter-espionage at home: Ranger's Lodge level determines what level of enemy spies they can catch.
- **Mercenaries** — Purchased from the Black Market; die before regular troops. Require per-turn gold upkeep or they defect; capped at 25% of regular army size.

### Combat Phases (in order, per round; full math in `combat.md`)
1. Siege weapons fire (proportional damage to all troops; rams/trebuchets grind wall integrity; defender's War Foundry counters reduce paired weapons by 75%)
2. Archers fire (proportional damage)
3. Cavalry charge (targeted order: cavalry → footmen → engineers → archers)
4. Footmen charge (targeted order: footmen → archers → cavalry → engineers)

Attacker commits turns = combat rounds; a side breaks below 30% strength.
Raids skip siege and get no wall bonus (open-field fights); bombard is engines-only.

### Stamina
- Troops lose stamina from fighting.
- Low stamina = weaker attack and defence.
- Restored by resting (costs turns + food) or passively at 1 point/turn.
- Strategic element: raid an opponent to drain stamina, bombard their walls, then launch the siege.

### Experience
- Battle XP depends on target's ranking vs yours: ±20% = +5 (fair fight); 20–75% stronger = +8 (bold); 20–50% weaker = +1; >50% weaker = −5 (bullying). Defenders always +5.
- Targets ≥75% stronger: your troops back off and call you an idiot (attack refused; revenge exempt).
- Troops keep getting stronger with experience — up to +100% at max (0–100).
- Losing regulars loses experience proportionally (veterancy dies with the veterans). Mercenary deaths cost nothing.

### Population Warfare
- Killing regulars kills actual population — the worst thing you can do to an enemy (and hard: mercenaries die first).
- If troops fall below 30% of civilians at the daily reset, unprotected peasants **scatter** (leave the empire) down to the 30% line. Empires below 500 total population are exempt.
- Grace window: train troops back above the line before the reset to stop the bleeding. Losing 100–200 population sets an empire's ranking back hard.

## Attack Modes

Every attack costs **10 action turns**. Players earn 2 action turns per game
turn (10 min) and start with 200.

Targets are found on the **browsable ranking ladder** (search/filters — no
world map). New empires start with 5,000 gold, 1,000 of each resource, and
100 population including 20 footmen (`architecture.md`).

**Protection:** no attacks at all during the first 5 days of an era; new
players joining mid-era get a 72-hour shield.

| Mode      | Goal                        | Notes                                                                 |
|-----------|-----------------------------|-----------------------------------------------------------------------|
| Raid      | Steal anything outside storage (never gold) | Field army vs field army — no walls, no siege phase   |
| Siege ("castle attack") | Steal gold + spilled/unstored goods | Full assault: siege weapons vs walls; the main offensive |
| Revenge   | Kill troops                 | 18hr window after being attacked; ignores surrender, low stamina, broken walls; chains (revenge re-arms the victim's window) |
| Bombard   | Wreck walls, then the town   | Pure artillery duel: trebuchets vs Counter-Engine. Pounds walls first; once breached, stray fire cracks random buildings — storages, production, the Collegium. No target choice, no troops, no loot |

- Attacking larger targets yields bonus loot; attacking much smaller targets yields less.
- Raid, siege, and bombard cannot target surrendered or beaten-down (stamina < 25) players; revenge can.
- Surrender: voluntary status — you can't attack, tax income halved, immune to all but revenge.

## Buildings

### Defences
- Walls, fortifications — protect against attacks. Walls add no recruitment; while damaged they reduce daily recruitment by up to 50%.

### Peasant Buildings
- Resource production improvements, resource storage, peasant housing.
- Civilian buildings drive daily recruitment from 1/day up to 100/day (full tree in `buildings.md`).

### Military & Specialty
- Unlock advanced troop types and higher equipment tiers.
- Siege weapon production, research, marketplace, gold banking, spy/scout operations.

## Clans

- Players form clans (5 founders, up to 20 members as the Clan Hall grows).
- Leadership (leader, vice, 3 officers) builds clan buildings from a shared storage pool all members feed: Clan Storage → Clan Hall (member cap + shrinks the tax production penalty, down to 50% at max) → Clan Wonder (discounts mercenary/troop/siege costs for every member).
- Clan wars double battle damage both ways; friendly clans share online status and last-attacked times. Neutral is the default. (Full design: `clans.md`.)

## Command View & Advisors

Overview screen with historical stats (battles won/lost, resource totals). Four AI advisors:

- **Defensive** — State of defences and improvement suggestions.
- **Military** — Troop readiness and recommendations.
- **Economic** — Production efficiency and worker balance.
- **Population** — Empire growth and recruitment optimization.

## Winning (see `victory.md`)

The game runs in **eras** (server seasons); the next era is named after the winner. Two victory paths:

- **Grand Overlord** — hold the #1 ranking for 72 hours cumulative *and* 12 hours straight (the streak resets if you're knocked off). Requires ≥ 10,000 population (no mercenaries) for the clocks to run.
- **Clan Victory** — same rule for the #1 clan (sum of member scores); requires ≥ 150,000 total clan population.

Ranking measures the visible empire: population, troops, walls, buildings, treasury, and 7 of 10 research fields. Siege, spies, scouts, mercenaries, and their research are worth zero — power in the shadows brings no prestige.

## Premium — The Royal Charter (see `premium.md`)

A one-time Stripe purchase ($4.99, tunable) that hires **the Steward**:
build queues, research queues, and standing orders ("once the Drill Yard is
built, train 1,000 warriors"), executed automatically each tick. Fairness
pillar: **the Charter buys attention, never power** — every Steward action
is an ordinary instant command at ordinary cost; no stat or resource
advantage, ever.

## Target Platform

- **Client:** Web browser (TypeScript)
- **Server:** Node.js / TypeScript
- **Real-time:** Turn-based with 10-minute tick intervals, persistent world
