// Walls, escalade, and what a wall is actually worth (spec/combat.md).
//
// A standing wall is a standing wall: the defence edge is FLAT, and wall LEVEL
// buys durability instead. A Citadel is not harder to fight over than a
// palisade — it is harder to knock down, and that is a far more interesting
// thing for a level to mean.
//
// Escalade no longer bypasses the wall outright. Grapple parties, ladder
// parties and siege towers each deliver troops onto a LESSER wall, and the
// host fights at the blended average. Bring enough tackle and the wall stops
// mattering; bring none and you are climbing sheer stone.

import { evalCurve } from "../../constants/curves";
import {
  ARCHER_VS_WALL_CURVE,
  RACES,
  WALL_EDGE,
  WALL_HP_CURVE,
} from "../../constants";
import { level, type Player, type SiegeGearType } from "../types";

/** How much punishment this wall absorbs before it is rubble. Level is the
 *  whole story: quadratic, so a Citadel soaks 100× a Timber Palisade. */
export function wallHealth(p: Player): number {
  const lvl = level(p, "walls");
  if (lvl <= 0) return 0;
  return evalCurve(WALL_HP_CURVE, lvl) * RACES[p.race].walls;
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
  /** The wall edge every defender actually enjoys, blended across the host. */
  blendedEdge: number;
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
): EscaladeResult {
  const wallLvl = level(defender, "walls");
  const base = wallLvl > 0 ? WALL_EDGE.BASE : 0;
  if (wallLvl <= 0 || troops <= 0) {
    return { blendedEdge: 0, grappled: 0, laddered: 0, towered: 0, unaided: troops };
  }

  let left = troops;
  const towered = Math.min(left, surviving.siege_towers * WALL_EDGE.TROOPS_PER_TOWER);
  left -= towered;
  const laddered = Math.min(left, surviving.ladders * WALL_EDGE.TROOPS_PER_LADDER);
  left -= laddered;
  const grappled = Math.min(left, surviving.ropes * WALL_EDGE.TROOPS_PER_GRAPPLE);
  left -= grappled;
  const unaided = left;

  const weighted =
    towered * WALL_EDGE.VS_TOWER +
    laddered * WALL_EDGE.VS_LADDER +
    grappled * WALL_EDGE.VS_GRAPPLE +
    unaided * base;

  return {
    blendedEdge: weighted / troops,
    grappled,
    laddered,
    towered,
    unaided,
  };
}

/**
 * Attacking archers shooting at men behind a parapet. Delivery, not a bonus:
 * against an intact wall half your arrows find nothing but stone, and as the
 * masonry comes down the defenders run out of places to hide.
 *
 * This is the counterweight to the defenders' +20% archer bonus on the wall,
 * and it is why breaching matters even to an army with no intention of
 * storming the breach.
 */
export function archerWallDelivery(wallIntegrity: number, hasWall: boolean): number {
  if (!hasWall) return 1;
  return Math.max(0, Math.min(1, evalCurve(ARCHER_VS_WALL_CURVE, wallIntegrity)));
}
