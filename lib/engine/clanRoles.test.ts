import { describe, expect, it } from "vitest";
import {
  clanRank,
  clanRepairCost,
  clanRoleOf,
  newClan,
  repairClanBuilding,
  setMemberRole,
  transferLeadership,
} from "./clanOps";
import { newEmpire } from "./newEmpire";
import type { Clan, Player } from "./types";

function member(id: string): Player {
  return newEmpire({ id, name: id, race: "human" });
}

/** A clan led by `lead` with four other members and a stocked pool. */
function clanFive(): { clan: Clan } {
  const lead = member("lead");
  const clan = newClan("c1", "Iron Pact", lead);
  for (const id of ["a", "b", "c", "d"]) clan.members.push(id);
  clan.buildings.storageLevel = 5;
  clan.buildings.hallLevel = 3;
  clan.buildings.wonderLevel = 1;
  clan.storage = { gold: 5_000_000, food: 0, wood: 5_000_000, stone: 5_000_000, ore: 5_000_000 };
  return { clan };
}

describe("clan roles — appointments", () => {
  it("leader names a Vice and Officers, honouring the caps", () => {
    let { clan } = clanFive();
    clan = setMemberRole(clan, "lead", "a", "vice");
    expect(clan.viceLeaderId).toBe("a");
    expect(clanRoleOf(clan, "a")).toBe("vice");

    clan = setMemberRole(clan, "lead", "b", "officer");
    clan = setMemberRole(clan, "lead", "c", "officer");
    clan = setMemberRole(clan, "lead", "d", "officer");
    expect(clan.officerIds).toEqual(["b", "c", "d"]);

    // A fourth officer overflows the cap of three.
    clan.members.push("e");
    expect(() => setMemberRole(clan, "lead", "e", "officer")).toThrowError(/only 3 Officers/);
  });

  it("a second Vice is refused until the first is demoted", () => {
    let { clan } = clanFive();
    clan = setMemberRole(clan, "lead", "a", "vice");
    expect(() => setMemberRole(clan, "lead", "b", "vice")).toThrowError(/already a Vice/);
    clan = setMemberRole(clan, "lead", "a", "member"); // demote
    expect(clan.viceLeaderId).toBeUndefined();
    clan = setMemberRole(clan, "lead", "b", "vice");
    expect(clan.viceLeaderId).toBe("b");
  });

  it("promoting moves a member cleanly between seats (no duplicate roles)", () => {
    let { clan } = clanFive();
    clan = setMemberRole(clan, "lead", "a", "officer");
    clan = setMemberRole(clan, "lead", "a", "vice"); // officer → vice
    expect(clan.officerIds).not.toContain("a");
    expect(clan.viceLeaderId).toBe("a");
  });

  it("only the leader may appoint, and never reseats the leader here", () => {
    const { clan } = clanFive();
    expect(() => setMemberRole(clan, "a", "b", "officer")).toThrowError(/Only the Leader/);
    expect(() => setMemberRole(clan, "lead", "lead", "vice")).toThrowError(/Pass the mantle/);
    expect(() => setMemberRole(clan, "lead", "zzz", "officer")).toThrowError(/Not a member/);
  });
});

describe("clan roles — rank helper", () => {
  it("ranks leader > vice > officer > member", () => {
    let { clan } = clanFive();
    clan = setMemberRole(clan, "lead", "a", "vice");
    clan = setMemberRole(clan, "lead", "b", "officer");
    expect(clanRank(clan, "lead")).toBe(3);
    expect(clanRank(clan, "a")).toBe(2);
    expect(clanRank(clan, "b")).toBe(1);
    expect(clanRank(clan, "c")).toBe(0);
  });
});

describe("transfer leadership", () => {
  it("hands the mantle over and steps the old leader down to member", () => {
    let { clan } = clanFive();
    clan = setMemberRole(clan, "lead", "a", "vice");
    clan = transferLeadership(clan, "lead", "a");
    expect(clan.leaderId).toBe("a");
    expect(clan.viceLeaderId).toBeUndefined(); // new leader vacated the Vice seat
    expect(clanRoleOf(clan, "lead")).toBe("member");
  });

  it("only the leader, only to a real member, not to self", () => {
    const { clan } = clanFive();
    expect(() => transferLeadership(clan, "a", "b")).toThrowError(/Only the Leader/);
    expect(() => transferLeadership(clan, "lead", "lead")).toThrowError(/already hold/);
    expect(() => transferLeadership(clan, "lead", "zzz")).toThrowError(/Not a member/);
  });
});

describe("clan-work repair", () => {
  it("mends to full and charges half the level cost scaled by damage", () => {
    const { clan } = clanFive();
    clan.buildings.integrity.hall = 0.5; // fully cracked (max damage 0.5)
    const cost = clanRepairCost(clan, "hall");
    // Hall L3 build cost is 1.5m gold / 750k each; repair = ×0.5 damage ×0.5 factor.
    expect(cost.gold).toBe(Math.ceil(1_500_000 * 0.5 * 0.5));
    expect(cost.each).toBe(Math.ceil(750_000 * 0.5 * 0.5));

    const goldBefore = clan.storage.gold;
    const fixed = repairClanBuilding(clan, "lead", "hall");
    expect(fixed.buildings.integrity.hall).toBe(1);
    expect(fixed.storage.gold).toBe(goldBefore - cost.gold);
  });

  it("is free-quote zero when whole, and refuses when whole or unbuilt", () => {
    const { clan } = clanFive();
    expect(clanRepairCost(clan, "storage")).toEqual({ gold: 0, each: 0 });
    expect(() => repairClanBuilding(clan, "lead", "storage")).toThrowError(/whole/);
    clan.buildings.integrity.wonder = 0.8;
    clan.buildings.wonderLevel = 0; // nothing built
    expect(() => repairClanBuilding(clan, "lead", "wonder")).toThrowError(/Nothing built/);
  });

  it("needs leadership and a stocked pool", () => {
    const { clan } = clanFive();
    clan.buildings.integrity.hall = 0.6;
    expect(() => repairClanBuilding(clan, "a", "hall")).toThrowError(/leadership/);
    clan.storage.gold = 0;
    expect(() => repairClanBuilding(clan, "lead", "hall")).toThrowError(/lacks gold/);
  });
});
