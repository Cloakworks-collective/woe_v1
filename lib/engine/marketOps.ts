// The Grand Bazaar (spec/market.md): anonymous order book, cheapest-first
// fills, 5% seller fee burned. Pure functions over the order list.

import { CARAVAN_CAPACITY_PER_MARKET_LEVEL, MARKET_FEE, SLOTS_PER_BUILDING_LEVEL } from "../constants";
import { EngineError, level, type MarketOrder, type Player, type Resource } from "./types";

export function caravanCapacity(p: Player): number {
  return CARAVAN_CAPACITY_PER_MARKET_LEVEL * level(p, "market_square");
}

export function activeListings(orders: MarketOrder[], sellerId: string): number {
  return orders.filter((o) => o.sellerId === sellerId && o.remaining > 0).length;
}

/** One merchant per listed caravan — more merchants, more simultaneous listings. */
export function freeMerchants(p: Player, orders: MarketOrder[]): number {
  return Math.min(p.workers.merchants, SLOTS_PER_BUILDING_LEVEL * level(p, "market_square")) -
    activeListings(orders, p.id);
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
  if (!(pricePerUnit > 0)) throw new EngineError("price", "Set a price above zero");
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
  };
  return { seller, order };
}

export function cancelOrder(
  sellerIn: Player,
  orders: MarketOrder[],
  orderId: string,
): { seller: Player; orders: MarketOrder[] } {
  const seller = structuredClone(sellerIn);
  const order = orders.find((o) => o.id === orderId && o.sellerId === seller.id);
  if (!order) throw new EngineError("order", "No such caravan of yours");
  seller.resources[order.resource] += order.remaining;
  return { seller, orders: orders.filter((o) => o.id !== orderId) };
}

/** Current market price = lowest ask. Null when nothing is listed. */
export function marketPrice(orders: MarketOrder[], resource: Resource): number | null {
  let best: number | null = null;
  for (const o of orders) {
    if (o.resource === resource && o.remaining > 0) {
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
  netGold: number; // after the burned fee
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
): { buyer: Player; orders: MarketOrder[]; fills: Fill[]; totalCost: number } {
  const buyer = structuredClone(buyerIn);
  const orders = structuredClone(ordersIn);
  if (!Number.isInteger(amount) || amount <= 0) throw new EngineError("amount", "Invalid amount");

  const book = orders
    .filter((o) => o.resource === resource && o.remaining > 0 && o.sellerId !== buyer.id)
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
      netGold: gross * (1 - MARKET_FEE),
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
