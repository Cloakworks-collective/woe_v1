import { describe, expect, it } from "vitest";
import { buildClanBuilding, clanBuildFunding, newClan, setMemberRole } from "./clanOps";
import { newEmpire } from "./newEmpire";
import type { Clan, Player } from "./types";

// Clan Storage L1 costs 100k gold + 50k of each of wood/stone/ore.
const L1 = { gold: 100_000, each: 50_000 };

function member(id: string): Player {
  const p = newEmpire({ id, name: id, race: "human" });
  p.gold = 0;
  p.resources.wood = p.resources.stone = p.resources.ore = 0;
  return p;
}

function clanOf(leader: Player): Clan {
  const c = newClan("c1", "Iron Pact", leader);
  leader.clanId = c.id;
  c.storage = { gold: 0, food: 0, wood: 0, stone: 0, ore: 0 };
  return c;
}

function fund(p: Player, gold: number, each: number): void {
  p.gold = gold;
  p.resources.wood = p.resources.stone = p.resources.ore = each;
}

describe("clan works are paid from the pool first, then the builder's purse", () => {
  it("spends only the pool when the pool covers it", () => {
    const leader = member("lead");
    fund(leader, 999_999, 999_999);
    const clan = clanOf(leader);
    clan.storage = { gold: 500_000, food: 0, wood: 500_000, stone: 500_000, ore: 500_000 };

    const r = buildClanBuilding(clan, leader, "storage");
    expect(r.clan.buildings.storageLevel).toBe(1);
    expect(r.clan.storage.gold).toBe(500_000 - L1.gold);
    expect(r.player.gold).toBe(999_999); // the builder's own purse is untouched
    expect(r.player.resources.wood).toBe(999_999);
  });

  it("drains the pool to zero and takes the shortfall from the builder", () => {
    const leader = member("lead");
    fund(leader, 1_000_000, 1_000_000);
    const clan = clanOf(leader);
    // The pool holds only 40% of the gold and 60% of each resource.
    clan.storage = { gold: 40_000, food: 0, wood: 30_000, stone: 30_000, ore: 30_000 };

    const r = buildClanBuilding(clan, leader, "storage");
    expect(r.clan.buildings.storageLevel).toBe(1);

    // Pool first: emptied of every resource the work needed.
    expect(r.clan.storage.gold).toBe(0);
    expect(r.clan.storage.wood).toBe(0);

    // Builder covers exactly the remainder, no more.
    expect(r.player.gold).toBe(1_000_000 - (L1.gold - 40_000));
    expect(r.player.resources.wood).toBe(1_000_000 - (L1.each - 30_000));
  });

  it("pays entirely from the builder when the pool is empty", () => {
    const leader = member("lead");
    fund(leader, 1_000_000, 1_000_000);
    const r = buildClanBuilding(clanOf(leader), leader, "storage");
    expect(r.player.gold).toBe(1_000_000 - L1.gold);
    expect(r.player.resources.stone).toBe(1_000_000 - L1.each);
  });

  it("refuses when pool and purse together fall short, spending nothing", () => {
    const leader = member("lead");
    fund(leader, 1_000_000, 10); // plenty of gold, almost no wood
    const clan = clanOf(leader);
    clan.storage = { gold: 0, food: 0, wood: 10, stone: 999_999, ore: 999_999 };

    expect(() => buildClanBuilding(clan, leader, "storage")).toThrowError(/wood together fall short/);
    // Nothing was deducted — the gold that WOULD have been affordable is intact.
    expect(leader.gold).toBe(1_000_000);
    expect(clan.storage.stone).toBe(999_999);
  });

  it("officers may build too, paying from their own purse", () => {
    const leader = member("lead");
    const officer = member("officer");
    fund(officer, 1_000_000, 1_000_000);
    let clan = clanOf(leader);
    clan.members.push("officer");
    clan = setMemberRole(clan, "lead", "officer", "officer");

    const r = buildClanBuilding(clan, officer, "storage");
    expect(r.clan.buildings.storageLevel).toBe(1);
    expect(r.player.gold).toBe(1_000_000 - L1.gold);
  });

  it("quotes the same split the engine will charge", () => {
    const leader = member("lead");
    fund(leader, 1_000_000, 1_000_000);
    const clan = clanOf(leader);
    clan.storage = { gold: 40_000, food: 0, wood: 30_000, stone: 30_000, ore: 30_000 };

    const q = clanBuildFunding(clan, leader, L1);
    expect(q.affordable).toBe(true);
    expect(q.pool.gold).toBe(40_000);
    expect(q.own.gold).toBe(L1.gold - 40_000);
    expect(q.own.wood).toBe(L1.each - 30_000);

    const r = buildClanBuilding(clan, leader, "storage");
    expect(leader.gold - r.player.gold).toBe(q.own.gold);
  });
});
