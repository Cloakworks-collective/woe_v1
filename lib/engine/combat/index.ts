// The combat engine (spec/combat.md). Split into modules because the rework
// put walls, buildings, troops and engines on one shared power/health scale,
// and that model needs room to be explained:
//
//   model.ts    the strength model — power, the additive bonus pool, delivery,
//               casualties, and the mercenary cascade
//   walls.ts    wall health, the flat defence edge, escalade blending
//   duel.ts     counters shooting at engines (and back) — where sieges are won
//   loot.ts     what is carried off, and who flees the town
//   battle.ts   raid / castle attack / revenge
//   bombard.ts  the artillery duel, and clan works
//   validate.ts who may strike whom
//
// Everything here is pure: RNG injected, no clock, no I/O.

export * from "./model";
export * from "./walls";
export * from "./duel";
export * from "./loot";
export * from "./battle";
export * from "./bombard";
export * from "./validate";
