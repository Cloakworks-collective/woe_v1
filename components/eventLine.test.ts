// Where a tiding links, and — more importantly — where it DOESN'T.
//
// The first version of `eventHref` fell back to a bare "/reports" when an event
// carried no report id. That looked harmless and was not: every tiding filed
// before covert records existed has no id, so the fallback fired precisely when
// the intelligence desk was empty. The link promised a report and delivered an
// empty list, which reads as broken software.
//
// A link is a promise that something is on the other side. These cases hold
// that line for every event type that offers one.

import { describe, expect, it } from "vitest";
import { eventHref } from "./eventLine";
import type { GameEvent } from "@/lib/engine";

describe("eventHref", () => {
  it("links a covert tiding to its own report, anchored", () => {
    const e: GameEvent = {
      type: "scoutReport",
      targetName: "Sylvangrove",
      detail: "Their coffers counted.",
      reportId: "abc-123",
    };
    expect(eventHref(e)).toBe("/report/abc-123");
  });

  it("offers NO link when the covert tiding carries no report id", () => {
    expect(eventHref({ type: "scoutReport", targetName: "Sylvangrove", detail: "x" })).toBeUndefined();
    expect(
      eventHref({ type: "spyReport", op: "Torch the Stores", targetName: "S", caught: false, detail: "x" }),
    ).toBeUndefined();
  });

  it("links a battle tiding to its report, and offers none without an id", () => {
    expect(
      eventHref({ type: "battleResult", battleId: "b1", victor: "attacker", mode: "raid" }),
    ).toBe("/battle/b1");
    expect(
      eventHref({ type: "attacked", byId: "x", byName: "X", mode: "raid", battleId: "" }),
    ).toBeUndefined();
  });

  it("tidings that are complete in themselves link nowhere", () => {
    expect(eventHref({ type: "fed" })).toBeUndefined();
    expect(eventHref({ type: "scattering", lost: 3 })).toBeUndefined();
    expect(eventHref({ type: "info", detail: "anything" })).toBeUndefined();
  });
});
