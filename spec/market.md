# War of Empires — The Grand Bazaar (Market)

One **centralized market shared by the whole server**. Merchants haul caravans
of resources there and sell them for gold at whatever price they set. There is
no NPC vendor — all supply is player caravans — and the market is **fully
anonymous**: no one ever sees who is selling or buying. You trade with *the
Bazaar*, never with a named player.

---

## What merchants do

A **merchant** (unlimited; you only need a Market Square, whose level scales each
caravan's capacity **and delivery speed** — see `buildings.md`) runs caravans:

- Each merchant can carry **1,000 × Market Square level** worth of goods —
  1k at level 1 up to **10k at level 10**.
- One caravan = one listing = one resource type (food, wood, stone, or ore).
- A dispatched caravan must **travel to the Bazaar** before its goods go on
  sale (see *Delivery time* below).
- While their caravan is out (traveling **or** listed), the merchant is
  **busy** — more merchants means more simultaneous caravans.
- Canceling returns the goods and frees the merchant — even mid-journey.
- Merchants pay tax like every civilian; caravans themselves are free to send.

## Delivery time (Market Square level)

Goods are **not** listed the instant you dispatch — the caravan rides to the
Bazaar first, and a bigger Market Square keeps faster roads and runners.
Delivery time falls **linearly** with the Market Square level:

```
caravanDeliveryTurns(level) = max(10, 110 − 10 × level)
// level 1 → 100 turns, level 5 → 60, level 10 → 10 (floor)
```

Until a caravan **arrives** (`arrivesAtTick = createdTick + caravanDeliveryTurns`),
its goods do **not** count toward market price or supply and **cannot be
bought**. The market UI shows each of your caravans' journey and its ETA.
Raising the Market Square is therefore a double win: bigger loads *and* fresher
goods reaching the market sooner.

## How trading works

**Selling:**
1. Load a caravan: pick a resource, an amount (≤ capacity), and an **ask price
   per unit in gold** — a **whole number** in the **2–50** band
   (`MARKET_PRICE_MIN`..`MARKET_PRICE_MAX`; no fractions, floor is 2).
2. The caravan **travels** to the Bazaar (delivery time above). On arrival it
   joins the anonymous order book. Nobody sees your name, only the aggregate
   supply.
3. As your goods sell, gold arrives immediately; the merchant frees up when
   the caravan sells out or is recalled.

**Buying:**
- Buyers never see or choose individual listings. Each resource shows one
  number: the **market price** (the current cheapest **arrived** ask).
- You buy N units *from the market*; the order fills from the cheapest asks
  upward, crossing into higher-priced caravans as cheaper ones empty.
  En-route caravans are skipped — only arrived goods can fill you.
- Goods deliver to the buyer instantly. Partial fills of a caravan are normal.

**Price discovery:** the market price moves as supply dictates — sellers
undercut each other to be the ask that fills next; heavy buying eats the
cheap end and the price climbs. War zones starve and prices spike; peacetime
gluts crash them. The UI shows current market price and recent price history
per resource, never counterparties.

```
caravanCapacity     = 1,000 × marketSquareLevel        // per merchant
caravanDeliveryTurns = max(10, 110 − 10 × marketLevel)  // travel time to Bazaar
marketPrice         = lowest ARRIVED ask listed        // per resource
```

## Market fee (gold sink — tunable)

A **5% fee on every sale**, paid by the seller, burned (not given to anyone).
Persistent economies mint gold endlessly through taxes; the Bazaar is the
drain that keeps prices meaningful. Tunable; set to 0 to disable.

## Anti-abuse

Anonymity + cheapest-first filling is itself the main defense against
funneling: you cannot sell *to* a specific player. A deliberately underpriced
caravan goes to whoever buys next — dumping 10k ore at 1 gold is a donation
to the whole server, not to your friend. Coordinated snipes (friend lists
cheap, you buy instantly) remain possible but are racy and unreliable by
design.

- [ ] TBD: remaining guardrails if snipe-funneling proves common — minimum
      price floor or randomized fill delay. Observe real behavior first.

## Open / TBD

- [x] Can caravans be raided in transit? **No — rejected.** Caravans are an
      abstraction, not world objects; the Bazaar stays a safe, anonymous
      venue. (Not deferred — decided against.)
- [ ] Does bought volume interact with storage caps (excess lost or refused)?
- [ ] Listing duration limits / stale listing cleanup.
- [ ] Gold-for-resource *buy orders* (bids) — v2 feature; sell-only at launch.
