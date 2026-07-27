import { describe, expect, it } from "vitest";
import { eraReset, seedWorld } from "./world";
import { pushInbox } from "./store";

describe("the Chronicle (per-player inbox) is a focused war/crown log", () => {
  it("records only attacks, spy ops, and crown-clock tidings — nothing else", () => {
    const w = seedWorld();
    w.inbox = {};
    // Kept:
    pushInbox(w, "p", { type: "attacked", byId: "x", byName: "X", mode: "raid", battleId: "b" });
    pushInbox(w, "p", { type: "battleResult", battleId: "b", victor: "attacker", mode: "siege" });
    pushInbox(w, "p", { type: "spyReport", op: "torch_stores", targetName: "X", caught: false, detail: "…" });
    pushInbox(w, "p", { type: "spiesCaught", attackerName: "X", executed: 3, op: "torch_stores" });
    pushInbox(w, "p", { type: "sabotaged", detail: "…" });
    pushInbox(w, "p", { type: "crownClock", scope: "overlord", gained: true, who: "P" });
    // Dropped:
    pushInbox(w, "p", { type: "researchComplete", field: "masonry", level: 2 });
    pushInbox(w, "p", { type: "buildComplete", building: "granary", level: 3 });
    pushInbox(w, "p", { type: "marketSale", resource: "wood", amount: 100, goldNet: 500 });
    pushInbox(w, "p", { type: "dailyRecruitment", arrived: 10, turnedAway: 0 });
    pushInbox(w, "p", { type: "clanEvent", detail: "war declared" });

    const kinds = (w.inbox["p"] ?? []).map((i) => i.event.type).sort();
    expect(kinds).toEqual(
      ["attacked", "battleResult", "crownClock", "sabotaged", "spiesCaught", "spyReport"].sort(),
    );
  });
});

describe("the grand chronicle (Annals)", () => {
  it("seeds an opening entry for the new age", () => {
    const w = seedWorld();
    expect(w.chronicle?.length).toBeGreaterThan(0);
    expect(w.chronicle?.[0].text).toMatch(/new age dawns/i);
  });

  it("seals the age into the archive on eraReset and opens a fresh one", () => {
    const w = seedWorld();
    w.meta.winner = { kind: "overlord", id: "x", name: "Karak Dûn", atTick: w.meta.tickNumber };
    (w.chronicle ??= []).unshift({
      tick: w.meta.tickNumber,
      at: new Date().toISOString(),
      tone: "war",
      text: "A test deed of the age.",
    });
    const entryCount = w.chronicle.length;

    const fresh = eraReset(w);

    // The old age is sealed with its entries + a final ladder.
    expect(fresh.chronicleArchive?.length).toBe(1);
    const sealed = fresh.chronicleArchive![0];
    expect(sealed.eraName).toBe(w.meta.eraName);
    expect(sealed.winnerName).toBe("Karak Dûn");
    expect(sealed.winnerKind).toBe("overlord");
    expect(sealed.entries.length).toBe(entryCount);
    expect(sealed.finalLadder.length).toBeGreaterThan(0);

    // The next era is named for the winner and starts its own annals.
    expect(fresh.meta.eraNumber).toBe(w.meta.eraNumber + 1);
    expect(fresh.meta.eraName).toBe("The Era of Karak Dûn");
    expect(fresh.chronicle?.some((e) => /Era of Karak Dûn begins/i.test(e.text))).toBe(true);
  });

  it("carries prior archives across successive resets", () => {
    let w = seedWorld();
    w.meta.winner = { kind: "overlord", id: "x", name: "One", atTick: 0 };
    w = eraReset(w);
    w.meta.winner = { kind: "clan", id: "c", name: "Two", atTick: 0 };
    w = eraReset(w);
    expect(w.chronicleArchive?.length).toBe(2);
    expect(w.chronicleArchive?.[0].winnerName).toBe("One");
    expect(w.chronicleArchive?.[1].winnerName).toBe("Two");
  });
});
