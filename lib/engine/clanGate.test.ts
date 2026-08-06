import { describe, expect, it } from "vitest";
import {
  acceptInvite,
  acceptJoinRequest,
  canAdmit,
  canRequestJoin,
  declineInvite,
  denyJoinRequest,
  hasRequested,
  invitePlayer,
  invitedTo,
  isRefused,
  newClan,
  requestToJoin,
  setMemberRole,
  withdrawJoinRequest,
} from "./clanOps";
import { newEmpire } from "./newEmpire";
import type { Clan, Player } from "./types";

const TICK = 100;

function player(id: string): Player {
  return newEmpire({ id, name: id, race: "human" });
}

function clanOf(leader: Player): Clan {
  const c = newClan("c1", "Iron Pact", leader);
  leader.clanId = c.id;
  return c;
}

describe("the gate — petitions", () => {
  it("a petition waits; it does not admit", () => {
    const leader = player("lead");
    const hopeful = player("hopeful");
    const clan = requestToJoin(hopeful, clanOf(leader), TICK);

    expect(hasRequested(clan, "hopeful")).toBe(true);
    expect(clan.members).not.toContain("hopeful");
    expect(hopeful.clanId).toBeUndefined();
  });

  it("the same player cannot petition twice over", () => {
    const leader = player("lead");
    const hopeful = player("hopeful");
    const clan = requestToJoin(hopeful, clanOf(leader), TICK);
    expect(canRequestJoin(hopeful, clan, TICK)).toMatch(/already awaits/);
    expect(() => requestToJoin(hopeful, clan, TICK)).toThrowError(/already awaits/);
  });

  it("the Leader admits, and the petitioner marches", () => {
    const leader = player("lead");
    const hopeful = player("hopeful");
    const clan = requestToJoin(hopeful, clanOf(leader), TICK);

    const r = acceptJoinRequest(hopeful, clan, "lead", TICK);
    expect(r.clan.members).toContain("hopeful");
    expect(r.player.clanId).toBe("c1");
    expect(hasRequested(r.clan, "hopeful")).toBe(false);
  });

  it("the Vice-Leader may admit; an Officer may not", () => {
    const leader = player("lead");
    const hopeful = player("hopeful");

    let clan = clanOf(leader);
    clan.members.push("vice", "officer");
    clan = setMemberRole(clan, "lead", "vice", "vice");
    clan = setMemberRole(clan, "lead", "officer", "officer");
    clan = requestToJoin(hopeful, clan, TICK);

    expect(canAdmit(clan, "vice")).toBe(true);
    expect(canAdmit(clan, "officer")).toBe(false);
    expect(canAdmit(clan, "hopeful")).toBe(false);

    expect(() => acceptJoinRequest(hopeful, clan, "officer", TICK)).toThrowError(/Leader or Vice/);
    expect(acceptJoinRequest(hopeful, clan, "vice", TICK).clan.members).toContain("hopeful");
  });
});

describe("the gate — a refusal is final", () => {
  it("a refused petitioner can never petition that banner again", () => {
    const leader = player("lead");
    const hopeful = player("hopeful");
    let clan = requestToJoin(hopeful, clanOf(leader), TICK);

    clan = denyJoinRequest(clan, "lead", "hopeful");
    expect(isRefused(clan, "hopeful")).toBe(true);
    expect(hasRequested(clan, "hopeful")).toBe(false);

    expect(canRequestJoin(hopeful, clan, TICK)).toMatch(/turned you away/);
    expect(() => requestToJoin(hopeful, clan, TICK)).toThrowError(/turned you away/);
  });

  it("but leadership may still invite them, which lifts the refusal", () => {
    const leader = player("lead");
    const hopeful = player("hopeful");
    let clan = denyJoinRequest(requestToJoin(hopeful, clanOf(leader), TICK), "lead", "hopeful");

    clan = invitePlayer(clan, "lead", hopeful, TICK);
    expect(isRefused(clan, "hopeful")).toBe(false);
    expect(invitedTo(clan, "hopeful")).toBe(true);

    const r = acceptInvite(hopeful, clan, TICK);
    expect(r.clan.members).toContain("hopeful");
    expect(r.player.clanId).toBe("c1");
  });

  it("withdrawing your own petition is not a refusal", () => {
    const leader = player("lead");
    const hopeful = player("hopeful");
    let clan = requestToJoin(hopeful, clanOf(leader), TICK);

    clan = withdrawJoinRequest(clan, "hopeful");
    expect(isRefused(clan, "hopeful")).toBe(false);
    expect(canRequestJoin(hopeful, clan, TICK)).toBeNull();
  });

  it("only the Leader or Vice may refuse", () => {
    const leader = player("lead");
    const hopeful = player("hopeful");
    const clan = requestToJoin(hopeful, clanOf(leader), TICK);
    expect(() => denyJoinRequest(clan, "other", "hopeful")).toThrowError(/Leader or Vice/);
  });
});

describe("the gate — invitations", () => {
  it("an invitation admits without any petition", () => {
    const leader = player("lead");
    const wanted = player("wanted");
    const clan = invitePlayer(clanOf(leader), "lead", wanted, TICK);

    expect(invitedTo(clan, "wanted")).toBe(true);
    expect(clan.members).not.toContain("wanted"); // still their choice
    expect(acceptInvite(wanted, clan, TICK).clan.members).toContain("wanted");
  });

  it("refuses to invite someone who already flies a banner", () => {
    const leader = player("lead");
    const taken = player("taken");
    taken.clanId = "elsewhere";
    expect(() => invitePlayer(clanOf(leader), "lead", taken, TICK)).toThrowError(/already march/);
  });

  it("an invitation can be declined, and cannot be double-issued", () => {
    const leader = player("lead");
    const wanted = player("wanted");
    let clan = invitePlayer(clanOf(leader), "lead", wanted, TICK);
    expect(() => invitePlayer(clan, "lead", wanted, TICK)).toThrowError(/already hold/);

    clan = declineInvite(clan, "wanted");
    expect(invitedTo(clan, "wanted")).toBe(false);
    expect(() => acceptInvite(wanted, clan, TICK)).toThrowError(/no invitation/);
  });

  it("an Officer may not invite", () => {
    const leader = player("lead");
    const wanted = player("wanted");
    let clan = clanOf(leader);
    clan.members.push("officer");
    clan = setMemberRole(clan, "lead", "officer", "officer");
    expect(() => invitePlayer(clan, "officer", wanted, TICK)).toThrowError(/Leader or Vice/);
  });
});
