// Alliances (spec/clans.md).
//
// The rule that matters is that an alliance NEVER blocks a blow. It is a
// promise, and what makes a promise worth signing is that breaking it is public
// and irreversible — so these tests are mostly about the breaking.

import { describe, expect, it } from "vitest";
import {
  acceptAlliance,
  allianceOfferFrom,
  areAllied,
  breakAllianceByTreachery,
  declareWar,
  declineAlliance,
  endAlliance,
  newClan,
  normalizeClan,
  offerAlliance,
  setMemberRole,
} from "./clanOps";
import { newEmpire } from "./newEmpire";
import type { Clan, Player } from "./types";

const empire = (id: string): Player => newEmpire({ id, name: id, race: "human" });

function twoClans(): { a: Clan; b: Clan; aLead: Player; bLead: Player; aGrunt: Player } {
  const aLead = empire("a-lead");
  const bLead = empire("b-lead");
  const aGrunt = empire("a-grunt");
  const a = newClan("A", "Iron Pact", aLead);
  const b = newClan("B", "Gold Company", bLead);
  a.members.push(aGrunt.id);
  return { a, b, aLead, bLead, aGrunt };
}

describe("alliances — offering and sealing", () => {
  it("an offer lands on the other banner, not on your own", () => {
    const { a, b, aLead } = twoClans();
    const r = offerAlliance(a, b, aLead.id, 100);
    expect(allianceOfferFrom(r.target, a.id)).toBe(true);
    expect(allianceOfferFrom(r.clan, b.id)).toBe(false);
    expect(areAllied(r.clan, r.target)).toBe(false); // not yet
  });

  it("accepting writes BOTH lists — a pact is never half-signed", () => {
    const { a, b, aLead, bLead } = twoClans();
    const offered = offerAlliance(a, b, aLead.id, 100);
    const sealed = acceptAlliance(offered.target, offered.clan, bLead.id);
    expect(areAllied(sealed.clan, sealed.target)).toBe(true);
    expect(sealed.clan.friendly).toContain(offered.clan.id);
    expect(sealed.target.friendly).toContain(offered.target.id);
    expect(sealed.clan.allianceOffers).toHaveLength(0);
  });

  it("crossing offers seal immediately rather than trading letters forever", () => {
    const { a, b, aLead, bLead } = twoClans();
    const first = offerAlliance(a, b, aLead.id, 100);
    // B now offers A, who already has B's... no: A offered B. So B offering A
    // finds A's offer standing and closes it.
    const r = offerAlliance(first.target, first.clan, bLead.id, 101);
    expect(areAllied(r.clan, r.target)).toBe(true);
  });

  it("only the Leader or the Vice may offer, accept or end one", () => {
    const { a, b, aLead, aGrunt } = twoClans();
    expect(() => offerAlliance(a, b, aGrunt.id, 100)).toThrow(/Leader or the Vice/i);
    const offered = offerAlliance(a, b, aLead.id, 100);
    expect(() => acceptAlliance(offered.target, offered.clan, aGrunt.id)).toThrow(/Leader or the Vice/i);
    // An officer is not leadership either — an alliance commits the whole banner.
    const withOfficer = setMemberRole(a, aLead.id, aGrunt.id, "officer");
    expect(() => offerAlliance(withOfficer, b, aGrunt.id, 100)).toThrow(/Leader or the Vice/i);
  });

  it("refuses an alliance with yourself, or a second one with the same clan", () => {
    const { a, b, aLead, bLead } = twoClans();
    expect(() => offerAlliance(a, a, aLead.id, 100)).toThrow(/yourself/i);
    const sealed = acceptAlliance(
      offerAlliance(a, b, aLead.id, 100).target,
      offerAlliance(a, b, aLead.id, 100).clan,
      bLead.id,
    );
    expect(() => offerAlliance(sealed.target, sealed.clan, aLead.id, 102)).toThrow(/already allied/i);
  });

  it("refuses a pact while blood is still between you", () => {
    const { a, b, aLead } = twoClans();
    const warred = declareWar(a, b, 50);
    expect(() => offerAlliance(warred.clan, warred.target, aLead.id, 100)).toThrow(/at war/i);
  });

  it("declining clears the offer and keeps no grudge", () => {
    const { a, b, aLead, bLead } = twoClans();
    const offered = offerAlliance(a, b, aLead.id, 100);
    const declined = declineAlliance(offered.target, a.id, bLead.id);
    expect(allianceOfferFrom(declined, a.id)).toBe(false);
    // They may ask again.
    expect(() => offerAlliance(offered.clan, declined, aLead.id, 200)).not.toThrow();
  });
});

describe("alliances — ending them", () => {
  function allied() {
    const t = twoClans();
    const offered = offerAlliance(t.a, t.b, t.aLead.id, 100);
    const sealed = acceptAlliance(offered.target, offered.clan, t.bLead.id);
    // `sealed.clan` is B (the accepter), `sealed.target` is A.
    return { ...t, a: sealed.target, b: sealed.clan };
  }

  it("either leadership may end it, at any time", () => {
    const { a, b, aLead } = allied();
    expect(areAllied(a, b)).toBe(true);
    const r = endAlliance(a, b, aLead.id);
    expect(areAllied(r.clan, r.target)).toBe(false);
    expect(r.clan.friendly).not.toContain(b.id);
    expect(r.target.friendly).not.toContain(a.id);
  });

  it("declaring war tears it up too", () => {
    const { a, b } = allied();
    const warred = declareWar(a, b, 300);
    expect(areAllied(warred.clan, warred.target)).toBe(false);
  });

  it("treachery answers to nobody's rank — the blow has already landed", () => {
    const { a, b } = allied();
    const torn = breakAllianceByTreachery(a, b);
    expect(areAllied(torn.a, torn.b)).toBe(false);
  });

  it("refuses to end an alliance that was never signed", () => {
    const { a, b, aLead } = twoClans();
    expect(() => endAlliance(a, b, aLead.id)).toThrow(/not allied/i);
  });
});

describe("alliances — reading a half-written pact", () => {
  it("one-sided membership is NOT an alliance", () => {
    const { a, b } = twoClans();
    a.friendly.push(b.id); // a crashed write, or an old save
    expect(areAllied(a, b)).toBe(false);
  });

  it("normalize fills the fields on saves written before alliances existed", () => {
    const { a } = twoClans();
    delete (a as { friendly?: string[] }).friendly;
    delete a.allianceOffers;
    normalizeClan(a);
    expect(a.friendly).toEqual([]);
    expect(a.allianceOffers).toEqual([]);
  });
});
