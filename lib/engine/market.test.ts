import { describe, expect, it } from "vitest";
import { buyFromMarket, cancelOrder, marketPrice, postOrder } from "./marketOps";
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
    expect(() => postOrder(seller("s1"), [], "wood", 2500, 3, "o1", 10)).toThrowError(/at most/);
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

  it("cancel returns the goods and frees the merchant", () => {
    const s = seller("s1");
    const { seller: s2, order } = postOrder(s, [], "wood", 800, 3, "o1", 10);
    const { seller: s3, orders } = cancelOrder(s2, [order], "o1");
    expect(s3.resources.wood).toBe(5000);
    expect(orders).toHaveLength(0);
  });
});
