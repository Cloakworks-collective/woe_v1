// The Grand Bazaar (spec/empire.md): anonymous order book, cheapest-first
// fills, 5% seller fee burned. Pure functions over the order list.
//
// EVERY GOLD AND GOODS FIGURE HERE IS A WHOLE NUMBER. Gold is a currency, and a
// currency that accumulates binary-float dust (0.95 × 3 = 2.8499999999999996)
// is a currency you cannot reason about. Rounding is always DOWN and always
// against the party being paid, so no rounding step can mint a unit.

import {
  BLACK_MARKET,
  CARAVAN_CAPACITY_PER_MARKET_LEVEL,
  caravanDeliveryTurnsAt,
  MARKET_FEE,
  MARKET_PRICE_MAX,
  MARKET_PRICE_MIN,
  MARKET_RECALL_LOSS,
} from "../constants";
import {
  buildingIntegrity,
  EngineError,
  level,
  type MarketOrder,
  type Player,
  type Resource,
} from "./types";

/** How much one caravan can haul. Scaled by the Market Square's integrity: a
 *  bombarded market keeps its road to the Bazaar but loses the stalls, pens and
 *  loading yard that fill a wagon, so a cracked market trades in smaller loads.
 *  Floored to a whole number — see the rounding note at the top of this file. */
export function caravanCapacity(p: Player): number {
  return Math.floor(
    CARAVAN_CAPACITY_PER_MARKET_LEVEL *
      level(p, "market_square") *
      buildingIntegrity(p, "market_square"),
  );
}

/** Turns a fresh caravan takes to reach the Bazaar, by Market Square level:
 *  CARAVAN_DELIVERY_CURVE, floored — level 1 → 100 turns, level 10 → 10 by
 *  default. A level-0 market can't trade. */
export function caravanDeliveryTurns(marketLevel: number): number {
  return caravanDeliveryTurnsAt(marketLevel);
}

/** Has a caravan reached the market yet? Legacy orders (no arrivesAtTick) count
 *  as already arrived, so pre-existing worlds keep working. */
export function caravanArrived(o: MarketOrder, currentTick: number): boolean {
  return (o.arrivesAtTick ?? 0) <= currentTick;
}

export function activeListings(orders: MarketOrder[], sellerId: string): number {
  return orders.filter((o) => o.sellerId === sellerId && o.remaining > 0).length;
}

/** One merchant per listed caravan — more merchants, more simultaneous listings.
 *  Merchants are uncapped (the Market Square level scales each caravan's capacity,
 *  not the merchant count); a merchant is "free" when not already on the road. */
export function freeMerchants(p: Player, orders: MarketOrder[]): number {
  return p.workers.merchants - activeListings(orders, p.id);
}

export function postOrder(
  sellerIn: Player,
  orders: MarketOrder[],
  resource: Resource,
  amount: number,
  pricePerUnit: number,
  id: string,
  currentTick: number,
): { seller: Player; order: MarketOrder } {
  const seller = structuredClone(sellerIn);
  if (!Number.isInteger(amount) || amount <= 0) throw new EngineError("amount", "Invalid amount");
  if (!Number.isInteger(pricePerUnit) || pricePerUnit < MARKET_PRICE_MIN || pricePerUnit > MARKET_PRICE_MAX) {
    throw new EngineError(
      "price",
      `Set a whole-number price between ${MARKET_PRICE_MIN} and ${MARKET_PRICE_MAX} gold per unit`,
    );
  }
  if (level(seller, "market_square") === 0) {
    throw new EngineError("market", "Build a Market Square first");
  }
  if (freeMerchants(seller, orders) < 1) {
    throw new EngineError("merchants", "Every merchant is already on the road");
  }
  if (amount > caravanCapacity(seller)) {
    throw new EngineError("capacity", `A caravan carries at most ${caravanCapacity(seller)}`);
  }
  if (seller.resources[resource] < amount) {
    throw new EngineError("resource", `Not enough ${resource}`);
  }
  seller.resources[resource] -= amount; // goods travel with the caravan
  const order: MarketOrder = {
    id,
    sellerId: seller.id,
    resource,
    remaining: amount,
    pricePerUnit,
    createdTick: currentTick,
    // The caravan rides for a while before its goods reach the Bazaar.
    arrivesAtTick: currentTick + caravanDeliveryTurns(level(seller, "market_square")),
  };
  return { seller, order };
}

/** What actually makes it home from a recalled caravan — the rest is lost on
 *  the road. Floored, so the loss is never rounded in the seller's favour. */
export function recallReturn(remaining: number): number {
  return Math.floor(remaining * (1 - MARKET_RECALL_LOSS));
}

/**
 * Turn a caravan around. **Half the remaining goods are lost** — recalling is a
 * real decision, not a free undo. Without the penalty the Bazaar doubles as a
 * raid-proof warehouse: post everything, watch for an incoming attack, pull it
 * all back untouched. The 50% makes stashing goods there cost more than it
 * saves, so what is on the road is genuinely committed.
 *
 * Works en route or arrived — the merchant is freed either way, and gold already
 * earned from units that sold is untouched.
 */
export function cancelOrder(
  sellerIn: Player,
  orders: MarketOrder[],
  orderId: string,
): { seller: Player; orders: MarketOrder[]; returned: number; lost: number } {
  const seller = structuredClone(sellerIn);
  const order = orders.find((o) => o.id === orderId && o.sellerId === seller.id);
  if (!order) throw new EngineError("order", "No such caravan of yours");
  const returned = recallReturn(order.remaining);
  seller.resources[order.resource] += returned;
  return {
    seller,
    orders: orders.filter((o) => o.id !== orderId),
    returned,
    lost: order.remaining - returned,
  };
}

/** Current market price = lowest ask among caravans that have ARRIVED. Null when
 *  nothing (arrived) is listed. Pass the current tick to exclude en-route
 *  caravans; omit it to price the whole book (Infinity = all arrived). */
export function marketPrice(
  orders: MarketOrder[],
  resource: Resource,
  currentTick = Infinity,
): number | null {
  let best: number | null = null;
  for (const o of orders) {
    if (o.resource === resource && o.remaining > 0 && caravanArrived(o, currentTick)) {
      if (best === null || o.pricePerUnit < best) best = o.pricePerUnit;
    }
  }
  return best;
}

export interface Fill {
  orderId: string;
  sellerId: string;
  amount: number;
  grossGold: number;
  netGold: number; // after the burned fee — a whole number, floored
}

/** Seller's take after the burned fee. Floored: the fraction of a gold that
 *  rounding would create is burned along with the fee rather than invented. */
export function netOfFee(grossGold: number): number {
  return Math.floor(grossGold * (1 - MARKET_FEE));
}

/**
 * Buy N units from the market: fills cheapest-first (oldest first at equal
 * price), crossing into pricier caravans as cheap ones empty. Buyers never
 * see whose caravans filled them.
 */
export function buyFromMarket(
  buyerIn: Player,
  ordersIn: MarketOrder[],
  resource: Resource,
  amount: number,
  currentTick = Infinity,
): { buyer: Player; orders: MarketOrder[]; fills: Fill[]; totalCost: number } {
  const buyer = structuredClone(buyerIn);
  const orders = structuredClone(ordersIn);
  if (!Number.isInteger(amount) || amount <= 0) throw new EngineError("amount", "Invalid amount");

  // Only ARRIVED caravans can fill an order — en-route goods aren't at the Bazaar yet.
  const book = orders
    .filter(
      (o) =>
        o.resource === resource &&
        o.remaining > 0 &&
        o.sellerId !== buyer.id &&
        caravanArrived(o, currentTick),
    )
    .sort((a, b) => a.pricePerUnit - b.pricePerUnit || a.createdTick - b.createdTick);

  const fills: Fill[] = [];
  let need = amount;
  let cost = 0;
  for (const o of book) {
    if (need === 0) break;
    // Take what's available, needed, and affordable from this caravan.
    const affordable = Math.floor((buyer.gold - cost) / o.pricePerUnit);
    const take = Math.min(o.remaining, need, affordable);
    if (take <= 0) break; // purse is empty — cheaper asks are already gone
    const gross = take * o.pricePerUnit;
    fills.push({
      orderId: o.id,
      sellerId: o.sellerId,
      amount: take,
      grossGold: gross,
      netGold: netOfFee(gross),
    });
    o.remaining -= take;
    cost += gross;
    need -= take;
  }
  if (fills.length === 0) {
    throw new EngineError("supply", "The Bazaar cannot fill that order (no supply, or no gold)");
  }

  buyer.gold -= cost;
  buyer.resources[resource] += amount - need;

  return { buyer, orders: orders.filter((o) => o.remaining > 0), fills, totalCost: cost };
}

// ── The Black Market (the fence) ─────────────────────────────────────────────
//
// A SYSTEM counterparty. No caravan, no travel, no order book, no other player
// — you deal with the fence and it settles on the spot. Deliberately the worst
// price in the game on both sides:
//
//     sell to the fence ──►  BLACK_MARKET.SELL_PRICE   (1)   floor
//     player Bazaar     ──►  MARKET_PRICE_MIN … MAX    (2–19)
//     buy from the fence ─►  BLACK_MARKET.BUY_PRICE    (20)  ceiling
//
// The spread is the whole safety argument. Every round trip through the fence
// loses money, so it cannot be farmed: it is liquidity of last resort, taken
// when you need gold *now* or bread *now* and cannot wait 100 turns for a
// caravan. Selling is a gold faucet and a resource sink; buying is the reverse.

/** Dump resources on the fence for immediate gold at SELL_PRICE per unit. */
export function blackMarketSell(
  input: Player,
  resource: Resource,
  amount: number,
): { player: Player; gold: number } {
  const p = structuredClone(input);
  if (!Number.isInteger(amount) || amount <= 0) throw new EngineError("amount", "Invalid amount");
  if (p.resources[resource] < amount) throw new EngineError("resource", `Not enough ${resource}`);
  const gold = amount * BLACK_MARKET.SELL_PRICE;
  p.resources[resource] -= amount;
  p.gold += gold;
  return { player: p, gold };
}

/** Buy resources from the fence for immediate delivery at BUY_PRICE per unit.
 *  Supply is unlimited — the fence is not another player's caravan. */
export function blackMarketBuy(
  input: Player,
  resource: Resource,
  amount: number,
): { player: Player; cost: number } {
  const p = structuredClone(input);
  if (!Number.isInteger(amount) || amount <= 0) throw new EngineError("amount", "Invalid amount");
  const cost = amount * BLACK_MARKET.BUY_PRICE;
  if (p.gold < cost) throw new EngineError("gold", "Not enough gold");
  p.gold -= cost;
  p.resources[resource] += amount;
  return { player: p, cost };
}

/** Most units the purse can afford from the fence — for the UI's max hint. */
export function blackMarketAffordable(p: Player): number {
  return Math.floor(p.gold / BLACK_MARKET.BUY_PRICE);
}
