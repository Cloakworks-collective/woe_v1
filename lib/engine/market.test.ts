import { describe, expect, it } from "vitest";
import { BLACK_MARKET, MARKET_PRICE_MAX, MARKET_PRICE_MIN } from "../constants";
import {
  blackMarketBuy,
  blackMarketSell,
  buyFromMarket,
  cancelOrder,
  caravanCapacity,
  caravanDeliveryTurns,
  marketPrice,
  postOrder,
} from "./marketOps";
import { newEmpire } from "./newEmpire";
import type { MarketOrder, Player } from "./types";

function seller(id: string, wood = 5000): Player {
  const p = newEmpire({ id, name: id, race: "human" });
  p.buildings.market_square = 2; // capacity 2,000; 40 merchant slots
  p.workers.merchants = 2;
  p.resources.wood = wood;
  return p;
}

describe("the Grand Bazaar", () => {
  it("posting loads the caravan (goods leave the stores)", () => {
    const { seller: s, order } = postOrder(seller("s1"), [], "wood", 1000, 3, "o1", 10);
    expect(s.resources.wood).toBe(4000);
    expect(order.remaining).toBe(1000);
  });

  it("caravan capacity is 1,000 × Market Square level", () => {
    expect(caravanCapacity(seller("s1"))).toBe(2000);
    expect(() => postOrder(seller("s1"), [], "wood", 2500, 3, "o1", 10)).toThrowError(/at most/);
  });

  it("a bombarded Market Square loads smaller caravans", () => {
    // Bombard floors integrity at 0.5, so a wrecked market halves its loads.
    const s = seller("s1");
    s.buildingIntegrity = { market_square: 0.5 };
    expect(caravanCapacity(s)).toBe(1000);
    // …and the posting limit moves with it, so a load that fit while whole is
    // refused once the stalls are rubble.
    expect(() => postOrder(s, [], "wood", 1500, 3, "o1", 10)).toThrowError(/at most/);
  });

  it("one merchant per listed caravan", () => {
    const s = seller("s1");
    const r1 = postOrder(s, [], "wood", 500, 3, "o1", 10);
    const r2 = postOrder(r1.seller, [r1.order], "wood", 500, 3, "o2", 10);
    expect(() => postOrder(r2.seller, [r1.order, r2.order], "wood", 500, 3, "o3", 10)).toThrowError(
      /merchant/i,
    );
  });

  it("fills cheapest-first, crossing into pricier caravans", () => {
    const orders: MarketOrder[] = [
      { id: "a", sellerId: "s1", resource: "wood", remaining: 300, pricePerUnit: 5, createdTick: 1 },
      { id: "b", sellerId: "s2", resource: "wood", remaining: 300, pricePerUnit: 2, createdTick: 2 },
      { id: "c", sellerId: "s3", resource: "wood", remaining: 300, pricePerUnit: 3, createdTick: 3 },
    ];
    expect(marketPrice(orders, "wood")).toBe(2);
    const buyer = newEmpire({ id: "b1", name: "Buyer", race: "human" });
    buyer.gold = 10000;
    const { buyer: b2, orders: left, fills, totalCost } = buyFromMarket(buyer, orders, "wood", 500);
    expect(fills.map((f) => f.orderId)).toEqual(["b", "c"]); // 300 @2, 200 @3
    expect(totalCost).toBe(300 * 2 + 200 * 3);
    expect(b2.resources.wood).toBe(1000 + 500);
    expect(left.find((o) => o.id === "c")!.remaining).toBe(100);
    expect(marketPrice(left, "wood")).toBe(3); // the cheap end was eaten
  });

  it("the 5% fee is burned, not paid to anyone", () => {
    const orders: MarketOrder[] = [
      { id: "a", sellerId: "s1", resource: "ore", remaining: 100, pricePerUnit: 10, createdTick: 1 },
    ];
    const buyer = newEmpire({ id: "b1", name: "Buyer", race: "human" });
    const { fills } = buyFromMarket(buyer, orders, "ore", 100);
    expect(fills[0].grossGold).toBe(1000);
    expect(fills[0].netGold).toBe(950); // seller receives 95%
  });

  it("a short purse takes what it can afford from the cheap end", () => {
    const orders: MarketOrder[] = [
      { id: "a", sellerId: "s1", resource: "food", remaining: 1000, pricePerUnit: 4, createdTick: 1 },
    ];
    const buyer = newEmpire({ id: "b1", name: "Buyer", race: "human" });
    buyer.gold = 100;
    const { buyer: b2, fills } = buyFromMarket(buyer, orders, "food", 1000);
    expect(fills[0].amount).toBe(25);
    expect(b2.gold).toBe(0);
  });

  it("delivery time falls with Market Square level: L1 → 100 turns, L10 → 10", () => {
    expect(caravanDeliveryTurns(1)).toBe(100);
    expect(caravanDeliveryTurns(5)).toBe(60);
    expect(caravanDeliveryTurns(10)).toBe(10);
    expect(caravanDeliveryTurns(11)).toBe(10); // floored
  });

  it("a posted caravan is en route — its goods don't reach the Bazaar instantly", () => {
    const s = seller("s1"); // Market Square level 2 → 90-turn road
    const { order } = postOrder(s, [], "wood", 1000, 3, "o1", 10);
    expect(order.arrivesAtTick).toBe(10 + caravanDeliveryTurns(2)); // 100

    const buyer = newEmpire({ id: "b1", name: "Buyer", race: "human" });
    buyer.gold = 10000;
    // While en route (tick 50 < 100) it isn't priced or buyable…
    expect(marketPrice([order], "wood", 50)).toBeNull();
    expect(() => buyFromMarket(buyer, [order], "wood", 500, 50)).toThrowError(/cannot fill/);
    // …but once it arrives (tick 100) it's live.
    expect(marketPrice([order], "wood", 100)).toBe(3);
    const { fills } = buyFromMarket(buyer, [order], "wood", 500, 100);
    expect(fills[0].amount).toBe(500);
  });

  it("recall frees the merchant but loses half the load on the road", () => {
    const s = seller("s1");
    const { seller: s2, order } = postOrder(s, [], "wood", 800, 3, "o1", 10);
    const { seller: s3, orders, returned, lost } = cancelOrder(s2, [order], "o1");
    // 800 left with the caravan; only 400 come home. Without the penalty the
    // Bazaar would double as a raid-proof warehouse you could empty on demand.
    expect(returned).toBe(400);
    expect(lost).toBe(400);
    expect(s3.resources.wood).toBe(5000 - 800 + 400);
    expect(orders).toHaveLength(0);
  });

  it("asks are confined to the band inside the Black Market's spread", () => {
    const s = seller("s1");
    expect(() => postOrder(s, [], "wood", 100, 1, "o1", 10)).toThrowError(/between/);
    expect(() => postOrder(s, [], "wood", 100, 20, "o2", 10)).toThrowError(/between/);
    expect(postOrder(s, [], "wood", 100, MARKET_PRICE_MIN, "o3", 10).order.pricePerUnit).toBe(2);
    expect(postOrder(s, [], "wood", 100, MARKET_PRICE_MAX, "o4", 10).order.pricePerUnit).toBe(19);
  });

  it("the fence settles instantly, and always worse than the Bazaar", () => {
    const p = newEmpire({ id: "x", name: "x", race: "human" });
    p.gold = 10_000;
    p.resources.ore = 500;

    const sold = blackMarketSell(p, "ore", 100);
    expect(sold.gold).toBe(100 * BLACK_MARKET.SELL_PRICE);
    expect(sold.player.resources.ore).toBe(400);
    expect(sold.player.gold).toBe(10_100);

    const bought = blackMarketBuy(sold.player, "food", 50);
    expect(bought.cost).toBe(50 * BLACK_MARKET.BUY_PRICE);
    expect(bought.player.resources.food).toBe(1000 + 50);

    // The spread is the safety argument: a round trip through the fence always
    // loses money, so there is no arbitrage loop to farm.
    expect(BLACK_MARKET.SELL_PRICE).toBeLessThan(MARKET_PRICE_MIN);
    expect(BLACK_MARKET.BUY_PRICE).toBeGreaterThan(MARKET_PRICE_MAX);
  });

  it("the fence refuses what you cannot cover", () => {
    const p = newEmpire({ id: "x", name: "x", race: "human" });
    p.gold = 10;
    expect(() => blackMarketBuy(p, "food", 1000)).toThrowError(/gold/i);
    expect(() => blackMarketSell(p, "ore", 999_999)).toThrowError(/Not enough/i);
  });
});
