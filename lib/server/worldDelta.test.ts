import { describe, expect, it } from "vitest";
import { applyDelta, computeSections, deltaBody, deltaSize, diffSections, type Section, type WorldDelta } from "./worldDelta";
import { seedWorld } from "./world";
import type { World } from "./store";

/** The service's whole loop, in miniature: diff into the caches, build the
 *  wire string, parse it as the client would, graft it on. */
function roundTrip(
  sections: Map<string, Section>,
  tombstones: Map<string, number>,
  world: World,
  rev: number,
  reader: World,
  since: number,
): World {
  diffSections(sections, tombstones, world, rev);
  const delta = JSON.parse(deltaBody(sections, tombstones, rev, since)) as WorldDelta;
  return applyDelta(reader, delta);
}

describe("delta sync — the wire carries change, not the book", () => {
  it("a mutated player travels; six hundred untouched ones do not", () => {
    const world = seedWorld();
    const sections = new Map<string, Section>();
    const tombstones = new Map<string, number>();
    diffSections(sections, tombstones, world, 1);

    // The reader takes a full copy at rev 1.
    const reader = JSON.parse(JSON.stringify(world)) as World;

    // One empire gets richer; nobody else moves.
    const someId = Object.keys(world.players)[0];
    world.players[someId].gold += 12_345;
    diffSections(sections, tombstones, world, 2);

    const body = deltaBody(sections, tombstones, 2, 1);
    const delta = JSON.parse(body) as WorldDelta;
    // Exactly one player section moved — the whole point of the mechanism.
    expect(Object.keys(delta.changed)).toEqual([`p:${someId}`]);
    expect(deltaSize(sections, 1)).toBeLessThan(JSON.stringify(world).length / 4);

    const merged = applyDelta(reader, delta);
    expect(merged).toEqual(JSON.parse(JSON.stringify(world)));
    // Unchanged players keep their object identity — pages holding the old
    // world mid-render are never mutated underneath.
    const otherId = Object.keys(world.players)[1];
    expect((merged as World).players[otherId]).toBe(reader.players[otherId]);
    expect(reader.players[someId].gold).not.toBe(world.players[someId].gold);
  });

  it("a vanished empire is a tombstone, and stays one for late readers", () => {
    const world = seedWorld();
    const sections = new Map<string, Section>();
    const tombstones = new Map<string, number>();
    diffSections(sections, tombstones, world, 1);
    const reader = JSON.parse(JSON.stringify(world)) as World;

    const gone = Object.keys(world.players)[0];
    delete world.players[gone];
    const merged = roundTrip(sections, tombstones, world, 2, reader, 1);
    expect((merged as World).players[gone]).toBeUndefined();

    // A reader who missed BOTH revs still hears about the grave at rev 5.
    world.meta.tickNumber += 1;
    diffSections(sections, tombstones, world, 5);
    const late = JSON.parse(deltaBody(sections, tombstones, 5, 0)) as WorldDelta;
    expect(late.removed).toContain(`p:${gone}`);
  });

  it("meta, battles and the rest travel as whole keys", () => {
    const world = seedWorld();
    const sections = new Map<string, Section>();
    const tombstones = new Map<string, number>();
    diffSections(sections, tombstones, world, 1);
    const reader = JSON.parse(JSON.stringify(world)) as World;

    world.meta.tickNumber = 999;
    world.chronicle = [{ tick: 999, at: "now", tone: "crown", text: "A test is written." }] as World["chronicle"];
    const merged = roundTrip(sections, tombstones, world, 2, reader, 1) as World;
    expect(merged.meta.tickNumber).toBe(999);
    expect(merged.chronicle?.[0]?.text).toBe("A test is written.");
    expect(merged).toEqual(JSON.parse(JSON.stringify(world)));
  });

  it("a reader at the current rev receives nothing at all", () => {
    const world = seedWorld();
    const sections = new Map<string, Section>();
    const tombstones = new Map<string, number>();
    diffSections(sections, tombstones, world, 3);
    const delta = JSON.parse(deltaBody(sections, tombstones, 3, 3)) as WorldDelta;
    expect(Object.keys(delta.changed)).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });

  it("sectioning is exhaustive — nothing in the world escapes a section", () => {
    // If a new top-level key is ever added to World, it must ride the delta —
    // rebuilding from sections alone has to equal the original.
    const world = seedWorld();
    const sections = computeSections(world);
    const empty = {} as World;
    const full = applyDelta(empty, {
      rev: 1,
      // Parsed, as the wire delivers them — deltaBody splices raw JSON, so by
      // the time applyDelta sees a delta its values are objects already.
      changed: Object.fromEntries([...sections].map(([k, str]) => [k, JSON.parse(str)])),
      removed: [],
    });
    expect(full).toEqual(JSON.parse(JSON.stringify(world)));
  });
});
