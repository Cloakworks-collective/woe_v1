import { describe, expect, it } from "vitest";
import { buyFromMarket, cancelOrder, netOfFee, postOrder, recallReturn } from "./marketOps";
import { MARKET_FEE } from "../constants";
import { blackMarketBuy, blackMarketSell } from "./marketOps";
import { newEmpire } from "./newEmpire";
import { processTurnTick } from "./tick";
import { RACES } from "../constants";
import type { Race } from "../constants/races";
import type { MarketOrder, Player, Resource } from "./types";

// Every stock a player holds is a WHOLE NUMBER. The rates behind them are not
// (tax is civilians × 0.4 × rate × statecraft; upkeep is 0.1 × people), so this
// is a property that has to be defended rather than assumed — 144 ticks a day
// will find any fraction that slips through.

const RESOURCES: Resource[] = ["food", "wood", "stone", "ore"];

function stocksAreWhole(p: Player, where: string) {
  expect(Number.isInteger(p.gold), `${where}: gold = ${p.gold}`).toBe(true);
  expect(Number.isInteger(p.bankedGold), `${where}: bankedGold = ${p.bankedGold}`).toBe(true);
  for (const r of RESOURCES) {
    expect(Number.isInteger(p.resources[r]), `${where}: ${r} = ${p.resources[r]}`).toBe(true);
  }
}

/** A going concern: people working, troops eating, taxes at an awkward rate. */
function empire(race: Race, taxRate: number): Player {
  const p = newEmpire({ id: `p-${race}-${taxRate}`, name: race, race });
  p.taxRate = taxRate;
  p.buildings.grange = 3;
  p.buildings.sawyers_mill = 2;
  p.buildings.masons_quarry = 2;
  p.buildings.deepvein_mine = 2;
  p.buildings.collegium = 2;
  p.buildings.market_square = 2;
  p.workers = {
    farmers: 37,
    lumberjacks: 23,
    quarrymen: 19,
    miners: 17,
    merchants: 3,
    researchers: 13,
  };
  p.idlePeasants = 41;
  p.army.footmen.light = 71;
  p.army.archers.light = 29;
  p.research.activeField = "crop_rotation";
  return p;
}

describe("stocks are always whole numbers", () => {
  // 6 races × 6 tax rates × 500 ticks = 18,000 ticks. It runs in under a second
  // alone but shares cores with the rest of the suite, and it was tripping
  // vitest's 5s default under parallel load — a flaky test is worse than a slow
  // one, and the breadth is the whole point of the property.
  it("survives 500 ticks across every race and awkward tax rates", { timeout: 30_000 }, () => {
    const rates = [0.07, 0.13, 0.33, 0.5, 0.77, 0.91];
    for (const race of Object.keys(RACES) as Race[]) {
      for (const taxRate of rates) {
        let p = empire(race, taxRate);
        for (let tick = 1; tick <= 500; tick++) {
          p = processTurnTick(p, { currentTick: tick, hallPenaltyFactor: 1 }).player;
          stocksAreWhole(p, `${race} @ tax ${taxRate}, tick ${tick}`);
        }
      }
    }
  });

  it("the market fee never credits a fraction of a gold", () => {
    // 3 gold × 1 unit × 0.95 = 2.8499999999999996 before this was floored.
    // Swept across EVERY fee rate The Merchants' Charter can produce, since the
    // rate now rides on the order rather than being a single constant.
    const rates = [0, 0.04, 0.08, 0.12, 0.16, 0.2, undefined];
    for (const feeRate of rates)
    for (let amount = 1; amount <= 40; amount++) {
      for (let price = 2; price <= 19; price++) {
        const net = netOfFee({ feeRate }, amount * price);
        expect(Number.isInteger(net), `${amount} × ${price} → ${net}`).toBe(true);
        expect(net).toBeLessThanOrEqual(amount * price); // the fee is never negative
      }
    }
  });

  it("a completed sale leaves both purses whole", () => {
    const orders: MarketOrder[] = [
      { id: "a", sellerId: "s1", resource: "ore", remaining: 7, pricePerUnit: 13, createdTick: 1 },
    ];
    const buyer = newEmpire({ id: "b1", name: "Buyer", race: "human" });
    buyer.gold = 1000;
    const { buyer: b2, fills } = buyFromMarket(buyer, orders, "ore", 7);
    stocksAreWhole(b2, "buyer after purchase");
    const s = newEmpire({ id: "s1", name: "Seller", race: "human" });
    s.gold += fills[0].netGold;
    stocksAreWhole(s, "seller after payout");
    // 7 × 13 = 91 gross; the base 20% fee leaves 72.8, floored to 72 — never 72.8.
    expect(fills[0].netGold).toBe(Math.floor(7 * 13 * (1 - MARKET_FEE)));
  });

  it("black market trades settle whole in both directions", () => {
    const p = newEmpire({ id: "x", name: "x", race: "human" });
    p.gold = 100_000;
    p.resources.stone = 5_000;
    const sold = blackMarketSell(p, "stone", 1_337);
    stocksAreWhole(sold.player, "after selling to the fence");
    const bought = blackMarketBuy(sold.player, "food", 613);
    stocksAreWhole(bought.player, "after buying from the fence");
  });

  it("a recalled caravan returns a whole number of goods", () => {
    const noCharter = newEmpire({ id: "r", name: "r", race: "human" });
    for (const remaining of [1, 3, 7, 999, 1001]) {
      const back = recallReturn(noCharter, remaining);
      expect(Number.isInteger(back)).toBe(true);
      expect(back).toBe(Math.floor(remaining / 2)); // odd loads lose the odd unit
    }
    // …and at every Charter level, where the fraction is no longer a clean half.
    const charter = newEmpire({ id: "c", name: "c", race: "human" });
    for (let lvl = 0; lvl <= 5; lvl++) {
      charter.research.levels.merchants_charter = lvl;
      for (const remaining of [1, 3, 7, 999, 1001]) {
        const back = recallReturn(charter, remaining);
        expect(Number.isInteger(back), `lvl ${lvl}, ${remaining}`).toBe(true);
        expect(back).toBeLessThanOrEqual(remaining);
      }
    }
    const s = newEmpire({ id: "s", name: "s", race: "human" });
    s.buildings.market_square = 2;
    s.workers.merchants = 1;
    s.resources.wood = 5000;
    const posted = postOrder(s, [], "wood", 999, 3, "o1", 10);
    const { seller, returned, lost } = cancelOrder(posted.seller, [posted.order], "o1");
    expect(returned).toBe(499);
    expect(lost).toBe(500);
    stocksAreWhole(seller, "after recall");
  });
});
