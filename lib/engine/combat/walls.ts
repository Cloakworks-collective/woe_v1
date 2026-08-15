// Walls, escalade, and what a wall is actually worth (spec/combat.md).
//
// The defence edge per defender is FLAT — a standing wall is a standing wall.
// What wall LEVEL buys is durability (it is harder to knock down) and REACH:
// how much of an attacking host the wall can meet at once.
//
// Two things thin that edge, and they multiply:
//
//   TACKLE   grapple parties, ladder parties and siege towers each deliver
//            troops onto a LESSER wall, and the host fights at the blended
//            average. Bring enough tackle and the wall stops mattering; bring
//            none and you are climbing sheer stone.
//   NUMBERS  a wall is only so long. Attackers beyond what it can hold off
//            spill round and fight as if it were not there.
//
// The second was added in 2026-08 because without it wall level decided nothing
// about who won — only how long the masonry lasted. A 500-strong garrison fell
// to 500 attackers behind no wall and behind a Citadel alike.

import { evalCurve } from "../../constants/curves";
import {
  BUILDING_HP_CURVE,
  COUNTED_HP_PER_UNIT,
  RACES,
  WALL_EDGE,
  WALL_HP_CURVE,
} from "../../constants";
import { isCounted, type BuildingId } from "../../constants/buildings";
import { level, type Player, type SiegeGearType } from "../types";

/** How much punishment this wall absorbs before it is rubble. Level is the
 *  whole story: quadratic, so a Citadel soaks 100× a Timber Palisade. */
export function wallHealth(p: Player): number {
  const lvl = level(p, "walls");
  if (lvl <= 0) return 0;
  return evalCurve(WALL_HP_CURVE, lvl) * RACES[p.race].walls;
}

/**
 * How much punishment a BUILDING absorbs before it hits its floor.
 *
 * Two shapes, because the game has two kinds of building:
 *
 *   LEVELLED   one structure that grows — quadratic in level, exactly a tenth
 *              of a wall at the same level.
 *   COUNTED    many structures side by side — LINEAR in how many you own,
 *              because twenty cottages are twenty cottages. Squaring a count
 *              would read a 240-hall barracks as fifty-seven Citadels.
 */
export function buildingHealth(p: Player, id: BuildingId): number {
  const n = level(p, id);
  if (n <= 0) return 0;
  if (isCounted(id)) return (COUNTED_HP_PER_UNIT[id] ?? 0) * n;
  return evalCurve(BUILDING_HP_CURVE, n);
}

/** Convert raw damage into the 0–1 integrity the rest of the game speaks in.
 *  This is the ONLY place the absolute-health model meets the fractional one,
 *  which is why population growth, storage capacity, ranking and repair costs
 *  all keep working untouched. */
export function damageToIntegrity(p: Player, damage: number): number {
  const hp = wallHealth(p);
  return hp <= 0 ? 0 : damage / hp;
}

export interface EscaladeResult {
  /** The wall edge every defender actually enjoys, blended across the host —
   *  tackle first, then thinned by how much of the host the wall can meet. */
  blendedEdge: number;
  /** What share of the attacking host the wall could hold off at all, 0–1.
   *  1 means the wall was long enough for everyone who came. */
  coverage: number;
  grappled: number;
  laddered: number;
  towered: number;
  unaided: number;
}

/**
 * Blend the wall's edge across the attacking host.
 *
 * Troops are assigned to the BEST tackle first — a siege tower puts men on the
 * parapet in formation, a ladder is a scramble, a grapple is worse, and anyone
 * left over is climbing bare stone into the full edge. The defender's counters
 * have already destroyed some of the tackle before we get here (see duel.ts),
 * so `surviving` is what actually reached the wall.
 */
export function blendWallEdge(
  defender: Player,
  troops: number,
  surviving: Record<SiegeGearType, number>,
  /** How whole each kind of tackle is, 0–1. Capacity scales with it: a siege
   *  tower shot to half its health carries half as many men over. Without this
   *  the escalade COUNTERS did nothing at all until they destroyed an engine
   *  outright — a tower at 21% integrity carried its full hundred — so Fire
   *  Pots, Fork Poles and Bill-hooks were all-or-nothing weapons priced as
   *  attrition ones. Defaults to whole for callers that do not track it. */
  integrity?: Partial<Record<SiegeGearType, number>>,
): EscaladeResult {
  const wallLvl = level(defender, "walls");
  const base = wallLvl > 0 ? WALL_EDGE.BASE : 0;
  if (wallLvl <= 0 || troops <= 0) {
    return { blendedEdge: 0, coverage: 0, grappled: 0, laddered: 0, towered: 0, unaided: troops };
  }

  const whole = (t: SiegeGearType) => Math.max(0, Math.min(1, integrity?.[t] ?? 1));
  let left = troops;
  const towered = Math.min(left, surviving.siege_towers * WALL_EDGE.TROOPS_PER_TOWER * whole("siege_towers"));
  left -= towered;
  const laddered = Math.min(left, surviving.ladders * WALL_EDGE.TROOPS_PER_LADDER * whole("ladders"));
  left -= laddered;
  const grappled = Math.min(left, surviving.ropes * WALL_EDGE.TROOPS_PER_GRAPPLE * whole("ropes"));
  left -= grappled;
  const unaided = left;

  const weighted =
    towered * WALL_EDGE.VS_TOWER +
    laddered * WALL_EDGE.VS_LADDER +
    grappled * WALL_EDGE.VS_GRAPPLE +
    unaided * base;

  // EVERY defender behind intact masonry gets the full edge, however many come.
  // There used to be a length rule here — `wallLvl × 300` attackers met at the
  // parapet, the rest diluting the edge — which meant a big enough host walked
  // up to a Citadel as though it were open ground. Wall level now buys
  // durability and nothing else about the field fight.
  return {
    blendedEdge: weighted / troops,
    coverage: 1,
    grappled,
    laddered,
    towered,
    unaided,
  };
}

/**
 * THE WALL EDGE IS THE ONLY EDGE.
 *
 * Attacking archers used to be gated to a tenth of their fire against an intact
 * wall (ARCHER_VS_WALL_CURVE), on top of the defenders' health bonus and a
 * parapet role bonus that turned out never to fire at all. Stacked, that made
 * the archer exchange roughly fifteen to one — and the gate was doing almost
 * all of it, while its own comment claimed a figure five times gentler than the
 * formula delivered.
 *
 * A wall now does one thing: it makes the people behind it harder to kill. Kept
 * as a function so the call sites read the same and the rule has somewhere to
 * live if it ever comes back.
 */
export function archerWallDelivery(_wallIntegrity: number, _hasWall: boolean): number {
  return 1;
}
