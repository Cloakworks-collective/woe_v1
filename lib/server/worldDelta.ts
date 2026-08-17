// Delta sync for the world — the wire carries CHANGE, not the book.
//
// The service holds the world; every Next instance holds a recent copy. A
// command touches one or two players; a tick touches all of them; most of the
// world most of the time is exactly what the reader already has. So the world
// is cut into SECTIONS — one per player, one per player's inbox, one per other
// top-level key — each tagged with the revision it last changed at. A reader
// says "I hold rev N" and receives only sections newer than N, plus tombstones
// for anything that vanished (an era reset, a deleted empire).
//
// Correctness leans on one property: sections are compared BY THEIR SERIALIZED
// STRING, and the serialization is already paid for — the service stringifies
// the world once per state change regardless. A false "changed" (key-order
// wobble) costs bytes, never truth; a missed change is impossible because the
// string IS the payload.
//
// Everything here is pure and shared: the service uses computeSections/
// diffSections, the client uses applyDelta, and the tests drive all three
// against each other.

import type { World } from "./store";

/** One serialized slice of the world, tagged with when it last changed. */
export interface Section {
  str: string;
  rev: number;
}

export interface WorldDelta {
  rev: number;
  /** section key → that slice, ALREADY PARSED. deltaBody splices each
   *  section's serialization into the wire verbatim, so JSON.parse of the
   *  body yields the values as objects — applyDelta must never re-parse. */
  changed: Record<string, unknown>;
  removed: string[];
}

/** The two map-shaped top-level keys that get per-entry sections — they are
 *  the bulk of the doc and the reason deltas work: `players` is ~60% of the
 *  world and a command touches one or two of them. */
const PER_ENTRY: Record<string, string> = { players: "p", inbox: "i" };
const PREFIX_TO_KEY: Record<string, string> = { p: "players", i: "inbox" };

/** Cut a world into serialized sections. Deterministic for a given world. */
export function computeSections(world: World): Map<string, string> {
  const out = new Map<string, string>();
  const w = world as unknown as Record<string, unknown>;
  for (const key of Object.keys(w)) {
    const prefix = PER_ENTRY[key];
    if (prefix) {
      const map = (w[key] ?? {}) as Record<string, unknown>;
      for (const id of Object.keys(map)) out.set(`${prefix}:${id}`, JSON.stringify(map[id]));
    } else {
      out.set(`k:${key}`, JSON.stringify(w[key]));
    }
  }
  return out;
}

/** Advance a section cache to a new world state. Mutates `sections` and
 *  `tombstones` in place; returns nothing. Sections whose serialization moved
 *  get the new rev; sections that vanished become tombstones at it. */
export function diffSections(
  sections: Map<string, Section>,
  tombstones: Map<string, number>,
  world: World,
  rev: number,
): void {
  const next = computeSections(world);
  for (const [key, str] of next) {
    const prev = sections.get(key);
    if (!prev || prev.str !== str) sections.set(key, { str, rev });
    tombstones.delete(key); // resurrection clears the grave
  }
  for (const key of [...sections.keys()]) {
    if (!next.has(key)) {
      sections.delete(key);
      tombstones.set(key, rev);
    }
  }
}

/** The delta a reader at `since` needs, assembled as a STRING so section
 *  payloads are spliced verbatim rather than parsed and re-encoded. */
export function deltaBody(
  sections: Map<string, Section>,
  tombstones: Map<string, number>,
  rev: number,
  since: number,
): string {
  const changed: string[] = [];
  for (const [key, s] of sections) {
    if (s.rev > since) changed.push(`${JSON.stringify(key)}:${s.str}`);
  }
  const removed = [...tombstones.entries()].filter(([, r]) => r > since).map(([k]) => k);
  return `{"rev":${rev},"changed":{${changed.join(",")}},"removed":${JSON.stringify(removed)}}`;
}

/** How much of the world a reader at `since` would receive, in serialized
 *  bytes — lets the service fall back to a FULL response when the delta would
 *  not actually be smaller (a very stale reader after a tick). */
export function deltaSize(sections: Map<string, Section>, since: number): number {
  let n = 0;
  for (const s of sections.values()) if (s.rev > since) n += s.str.length;
  return n;
}

/** Graft a delta onto the world the reader holds. Returns a NEW world object —
 *  the old one may still be in a page's hands mid-render, so it is never
 *  mutated. Top-level and per-entry maps are shallow-cloned; unchanged
 *  players keep their object identity. */
export function applyDelta(world: World, delta: WorldDelta): World {
  const w = { ...(world as unknown as Record<string, unknown>) };
  for (const mapKey of Object.keys(PER_ENTRY)) {
    w[mapKey] = { ...((w[mapKey] ?? {}) as Record<string, unknown>) };
  }
  for (const [key, value] of Object.entries(delta.changed)) {
    const at = key.indexOf(":");
    const prefix = key.slice(0, at);
    const rest = key.slice(at + 1);
    if (prefix === "k") w[rest] = value;
    else (w[PREFIX_TO_KEY[prefix]] as Record<string, unknown>)[rest] = value;
  }
  for (const key of delta.removed) {
    const at = key.indexOf(":");
    const prefix = key.slice(0, at);
    const rest = key.slice(at + 1);
    if (prefix === "k") delete w[rest];
    else delete (w[PREFIX_TO_KEY[prefix]] as Record<string, unknown>)[rest];
  }
  return w as unknown as World;
}
