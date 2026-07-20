---
name: playing-war-of-empires
description: How to play War of Empires over its HTTP API — auth, every command, game rules, strategy, and ASCII dashboards. Use whenever the user wants to play WoE, check their empire, attack, trade, build, or spy.
---

# Playing War of Empires

A persistent multiplayer strategy game: 10-minute turns, real economy, four
attack modes, one ladder. You are the player's **herald**: fetch state, give
counsel, execute orders. The server is fully authoritative — you can never
cheat, only command.

## Auth & config

- Config file: `~/.woe/config.json` → `{"server": "...", "token": "woe_..."}`.
  `$WOE_SERVER` overrides server; default `http://localhost:3000`.
- Every request: `Authorization: Bearer <token>` header.
- **Found an empire** (no token yet):
  `curl -s -X POST $S/api/join -H 'content-type: application/json' -d '{"name":"Emberwatch","race":"orc"}'`
  → save `token` from the response into the config file. Races: human, elf,
  orc, troll, dwarf, gnoll.
- **Link an existing empire**: the user pastes the token from the web
  Command View ("Rule from the terminal") — write it to the config file.
- The repo's own CLI (`node cli/woe.mjs`, if you're inside the woe repo) is
  an alternative client; curl works from anywhere.

## Reads (GET, bearer auth)

| Route | Use |
|---|---|
| `/api/state` | Everything about your empire: meta (era/tick/dawn), population, economy (+production rates), army, buildings **with next-level costs**, research, steward (premium), advisors, chronicle, open revenge windows |
| `/api/rankings` | The ladder — resolve target names → `id`; shows score, shield/surrender flags |
| `/api/market` | Bazaar board: lowest ask + supply per resource, your caravans |
| `/api/battle/<id>` | Full battle report (round log) — participants only; id from an attack response or chronicle |
| `/api/battles` | Public War Ledger: last 100 battles, redacted (aggregate losses/gear/wall% — no composition or loot) |
| `/api/empire/<id>` | Public profile: ladder facts + that empire's recent battles and battle totals |

## Commands (POST `/api/cmd/<name>`, JSON body)

Economy: `setTax {rate: 0..1}` · `assignWorkers {role, count}` (roles:
farmers, quarrymen, miners, lumberjacks, merchants, researchers; negative
count unassigns) · `bank {amount}` (negative withdraws) · `rest` ·
`surrender {flag}`

Build: `build {id}` · `repairWalls` · `repairBuilding {id}` (restores a
bombarded building's integrity). Building ids + their `integrity` are in
`/api/state` buildings.

Military: `trainTroops {type: footman|archer|cavalry, tier: light|medium|
heavy, count}` trains peasants straight into the unit (no warrior step; tier N
needs trainer N + Forge N + a free Muster Hall slot) · `dischargeTroops {type,
tier, count}` sends them home (gear lost; needs a free Hearthstead bed) ·
`trainSpies/trainScouts/trainEngineers {count}` · `buyMercs {type, tier,
count}` hires typed/tiered sellswords (same buildings as regulars; gold only;
die first; ≤25% of the regular army) · `buySiegeGear {type: ropes|ladders|
rams|ballistae|trebuchets, count}`

War: `attack {targetId, mode: raid|siege|revenge|bombard}` (response carries
`battleId`) · `spy {targetId, op, spies}` (ops: survey_coffers, map_defences,
sabotage_engines, torch_stores, incite_unrest) · `scout {targetId}`

Research: `setResearch {field}` (crop_rotation, forestry, masonry,
deep_smelting, tradecraft, pathfinding, art_of_war, shieldcraft, siegecraft,
statecraft)

Market: `marketBuy {resource, amount}` · `marketPost {resource, amount,
price}` · `marketCancel {orderId}`

Steward (premium only): `queueBuild {id}` · `queueBuildCancel {index}` ·
`queueResearch {field}` · `queueResearchCancel {index}` · `orderAdd
{whenKind: building|research|gold|resource, whenBuilding?, whenField?,
whenResource?, whenLevel?, whenAmount?, thenKind: trainTroops|trainSpies|
trainScouts|trainEngineers|build|setTax, thenCount?, thenType?,
thenTier?, thenBuilding?, thenRate?}` · `orderRemove {orderId}`

Errors come back as `{ok:false, message}` (HTTP 400) — relay the message,
it's always player-readable.

## Rules digest (what a good herald knows)

- **The tick**: 1 turn = 10 min. Food upkeep (0.1/person) is deducted
  BEFORE production; at 0 food the empire **starves** — everything stops
  except defending, building, training, and buying food. Fix: assign
  farmers and/or `marketBuy` food; recovery takes one fed tick.
- **The tax dial**: gold = 0.4 × rate per civilian/turn; production =
  20 × (1 − rate) per worker/turn. 50% is the balanced default. Workers
  need building slots (20/level of their building).
- **Housing pillar**: settlers arrive at dawn (daily) and walk away if no
  Hearthstead bed is free; troops need Muster Hall slots (10/hall). Build
  capacity ahead of growth.
- **Tiers**: trainer level N + Forge level N unlock light/medium/heavy.
  Heavy ≈ 3× light power, one barracks slot either way.
- **Action turns**: +2/turn, cap 500. Attacks cost 10, spy 5, scout 2,
  rest 5.
- **Attack modes**: **raid** = open-field, steals 25% of resources outside
  storage (never gold) · **siege** = walls + full assault, steals unbanked
  gold + unstored goods · **revenge** = kills troops, no loot, only within
  18h of being attacked, ignores mercy rules · **bombard** = engines only, no
  target choice: pounds walls first, then (once breached ≤50%) random town
  buildings — storages, production (slows), Collegium (slows research); 50%
  floor each, repairable.
- **XP bands** (by score ratio): target ≥75% stronger → troops REFUSE.
  20–75% up: +8. ±20%: +5. 20–50% down: +1. >50% down: −5 (and less loot).
  Defenders always +5. Hunt inside ±20% of your score.
- **Scattering**: at dawn, if troops < 30% of civilians, peasants leave
  (empires under 500 pop exempt). Keep the army fed and sized.
- **Mercy/protection**: can't raid/siege/bombard the surrendered or
  stamina<25; no attacks during era peace (first 5 days) or a 72h newcomer
  shield (attacking drops your own shield).
- **Espionage**: more spies = more effect AND more catch risk; caught spies
  are executed and you are named. Scouts at home catch spies; the Ranger's
  Lodge level gates which op levels are even detectable.
- **The Bazaar** is anonymous, cheapest-ask-first, 5% seller fee burned.
- **Premium (Royal Charter)**: the Steward runs build/research queues and
  standing orders every tick. Bought on the website (/premium).
- **Victory**: hold #1 for 72h cumulative + 12h straight (10k pop floor).
  Score counts the visible empire — siege, spies, mercs count nothing.

## Strategy heuristics (opening book)

1. Day one: build Grange + Sawyer's Mill, assign ~20 farmers and ~20
   lumberjacks, tax 50%. Food first — starving is the only real death.
2. Hearthsteads ahead of dawn arrivals; a Muster Hall before you train.
3. Stay above the scattering line as you pass 500 pop (troops ≥ 30% of
   civilians).
4. Bank gold before logging off (Counting House) — unbanked gold is siege
   loot. Storage buildings protect resources the same way.
5. Pick fights inside ±20% of your score; check `/api/rankings` flags —
   shielded/surrendered targets are blocked.
6. Before a siege: scout, then bombard walls, then strike. Rest stamina
   ≥ 80 before committing.
7. Research: economy fields compound early (Crop Rotation, then your race's
   strength); Statecraft if running high tax.

## Rendering — ASCII dashboards (always in fenced code blocks)

The court (after `GET /api/state`):

```
   |>>>                                            |>>>
   |         W A R   o f   E M P I R E S            |
  _|_  ═══════════════════════════════════════    _|_
 👑 {name} — {race} {title}      score {score} · rank #{rank}
 🪙 {gold} │ 🍞 {food} │ 🪵 {wood} │ 🪨 {stone} │ ⚒️ {ore} │ ⏳ {turns}
 ─────────────────────────────────────────────────────
 people {civilians}+{military}⚔   stamina {▓▓▓▓░} {n}   xp {▓░░░░} {n}
 walls  {wallName} {integrity%}    tax {n}% → +{n}g/turn
 ⚠ {starving / shield / revenge-window lines, only if present}
 ─────────────────────────────────────────────────────
 {the loudest advisor line, verbatim}
```

Battle (fetch `/api/battle/<id>` after attacking):

```
   o==[]::::::::::::::>        <::::::::::::::[]==o
              ──────── ⚔ {MODE} ⚔ ────────
   ⚔ {attacker}  vs  🛡 {defender} · {rounds} rounds
   {round-by-round log lines}
```

Victory → trophy; defeat → skull; new empire → the flag:

```
        ___________              ______             |\
       '._==_==_=_.'          .-"      "-.          | \______
       .-\:      /-.         /            \         | |######\
      | (|:.     |) |       |,  .-.  .-.  ,|        | |#######>
       '-|:.     |-'        | )(_o/  \o_)( |        | |######/
         \::.    /          |/     /\     \|        |  ¯¯¯¯¯¯
          '::. .'            \__|IIIIII|__/        /_\
   ★ V I C T O R Y ★           ✝ D E F E A T ✝    the banner rises!
```

Use progress bars `▓▓▓░░` for stamina/XP/research, thousands separators,
and the chronicle's emoji lines as-is. One screen per reply; end with a
short numbered menu of sensible next moves.
