import { describe, expect, it } from "vitest";
import {
  buildClanBuilding,
  canJoin,
  departClan,
  depositToClan,
  joinClan,
  newClan,
  recordWarKills,
  withdrawFromClan,
  withdrawableNow,
} from "./clanOps";
import { newEmpire } from "./newEmpire";
import type { Clan, Player } from "./types";

function member(id: string): Player {
  const p = newEmpire({ id, name: id, race: "human" });
  p.gold = 500000;
  p.resources.wood = 200000;
  p.resources.stone = 200000;
  p.resources.ore = 200000;
  return p;
}

function clanWith(leader: Player): Clan {
  const c = newClan("c1", "Iron Pact", leader);
  leader.clanId = c.id;
  c.buildings.storageLevel = 2; // 500k cap per resource
  return c;
}

describe("clan storage — the 3× rule", () => {
  it("withdrawals cap at 3× lifetime deposits", () => {
    const leader = member("lead");
    let clan = clanWith(leader);
    let r = depositToClan(leader, clan, "gold", 1000);
    expect(withdrawableNow(r.clan, "lead", "gold")).toBe(3000);
    // But the pool only holds 1,000 — the ledger allows 3k, the pool doesn't.
    expect(() => withdrawFromClan(r.player, r.clan, "gold", 2000)).toThrowError(/dry/);
    r = { ...r, ...withdrawFromClan(r.player, r.clan, "gold", 800) };
    expect(withdrawableNow(r.clan, "lead", "gold")).toBe(2200);
  });

  it("leeches who never deposit can never withdraw", () => {
    const leader = member("lead");
    const clan = clanWith(leader);
    clan.storage.gold = 100000;
    expect(withdrawableNow(clan, "lead", "gold")).toBe(0);
  });
});

describe("membership churn", () => {
  it("leaving forfeits deposits, starts the 48h cooldown, counts to 2/era", () => {
    const leader = member("lead");
    const joiner = member("j1");
    let clan = clanWith(leader);
    let jr = joinClan(joiner, clan, 100);
    jr = { ...jr, ...depositToClan(jr.player, jr.clan, "gold", 10000) };
    const dep = departClan(jr.player, jr.clan, 200);
    expect(dep.player.clanDepartures).toBe(1);
    expect(dep.player.clanJoinableAtTick).toBe(200 + 288); // 48h × 6 ticks
    expect(dep.clan.storage.gold).toBe(10000); // resources stay
    expect(dep.clan.memberLedger["j1"]).toBeUndefined(); // ledger wiped
    // Cooldown blocks immediate rejoin…
    expect(canJoin(dep.player, dep.clan, 300)).toMatch(/cooldown/i);
    // …and rejoining later starts the deposit counter at zero.
    const rejoined = joinClan(dep.player, dep.clan, 500);
    expect(withdrawableNow(rejoined.clan, "j1", "gold")).toBe(0);
  });

  it("two departures bars the gates for the era", () => {
    const p = member("hopper");
    p.clanDepartures = 2;
    const clan = clanWith(member("lead"));
    expect(canJoin(p, clan, 99999)).toMatch(/twice departed/i);
  });
});

describe("clan buildings", () => {
  it("only leadership builds, from the pool, bypassing the 3× cap", () => {
    const leader = member("lead");
    let clan = clanWith(leader);
    clan.storage = { gold: 400000, food: 0, wood: 200000, stone: 200000, ore: 200000 };
    expect(() => buildClanBuilding(clan, "nobody", "storage")).toThrowError(/leadership/);
    clan = buildClanBuilding(clan, "lead", "storage"); // L3: 300k gold + 150k each
    expect(clan.buildings.storageLevel).toBe(3);
    expect(clan.storage.gold).toBe(100000);
  });

  it("the Wonder demands Clan Storage first", () => {
    const leader = member("lead");
    const clan = clanWith(leader);
    clan.storage.gold = 10_000_000;
    clan.storage.wood = clan.storage.stone = clan.storage.ore = 10_000_000;
    expect(() => buildClanBuilding(clan, "lead", "wonder")).toThrowError(/requires Clan Storage 4/);
  });
});

describe("clan war", () => {
  it("net +200 regular kills wins: truce, frozen clocks, tribute", () => {
    const a = newClan("a", "Attackers", member("al"));
    const b = newClan("b", "Defenders", member("bl"));
    a.wars.push({ clanId: "b", regularKills: 0, regularLosses: 0 });
    let r = recordWarKills(a, b, 150, 30, 5000);
    expect(r.victory).toBe(false);
    r = recordWarKills(r.ours, r.theirs, 90, 10, 5100);
    expect(r.victory).toBe(true); // net 240 − 40 = 200
    expect(r.ours.warRecord.wins).toBe(1);
    expect(r.theirs.clockFrozenUntilTick).toBe(5100 + 288);
    expect(r.theirs.tribute?.toClanId).toBe("a");
    // The victor cannot re-declare during the truce.
    expect(r.ours.truceWithUntilTick["b"]).toBe(5100 + 288);
  });
});
