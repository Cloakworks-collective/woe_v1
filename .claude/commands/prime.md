---
description: Load full WoE game-design context (all spec docs + progress + todo)
---

Prime yourself on the War of Empires project. Read, in order:

1. `progress.md` — where the project stands
2. `todo.md` — what's next
3. All design docs in `spec/`:
   - `spec/overview.md` — game concept, races, core loop, attack modes, winning
   - `spec/architecture.md` — server/client architecture, data model, protocol, open questions
   - `spec/buildings.md` — civilian/military buildings, population model, costs, siege ladder
   - `spec/economy.md` — taxes, production, mercenary upkeep
   - `spec/research.md` — the Collegium's 10 fields × 5 levels
   - `spec/market.md` — the anonymous Grand Bazaar
   - `spec/combat.md` — battle resolution, attack modes, scattering, experience
   - `spec/espionage.md` — spy ops, scout counter-espionage
   - `spec/clans.md` — leadership, clan buildings, wars, truce
   - `spec/victory.md` — eras, Grand Overlord, clan victory, ranking
   - `spec/premium.md` — the Royal Charter (Stripe) and the Steward (queues, standing orders)

Then give a 5-line summary of project state and stop. Do not start any work
until asked.

Rules while working on this project:
- The spec docs are the source of truth; when a decision changes, update the
  affected spec docs in the same turn (they cross-reference each other).
- Keep `progress.md` and `todo.md` current and succinct as work completes.
- All game numbers are tunable placeholders unless marked otherwise.
