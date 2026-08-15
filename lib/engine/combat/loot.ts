// What an attacker carries home, and what the attack costs the people who
// live there (spec/combat.md).
//
// Raids take GOODS. Castle attacks take GOLD. Neither takes both — which is
// what turns "crack their storehouses open with a bombard, raid the spill,
// then storm the castle for the treasury" into a campaign rather than a button.

import {
  CIVILIAN_LOSS,
  LOOT,
  STORAGE_BUILDING,
} from "../../constants";
import { rollBand, type Rng } from "../rng";
import {
  bankedRes,
  buildingIntegrity,
  civilians,
  level,
  shelterCapacity,
  type AttackMode,
  type Player,
  type Resource,
} from "../types";

/** Goods an attacker can reach: everything loose, plus whatever has spilled
 *  past a damaged storehouse's reduced capacity. Cracking storages open is
 *  precisely how a bombard sets up the raid that follows. */
export function unstored(p: Player, r: Resource): number {
  const building = STORAGE_BUILDING[r];
  const cap = shelterCapacity(p, building) * buildingIntegrity(p, building);
  return p.resources[r] + Math.max(0, bankedRes(p)[r] - cap);
}

/** Gold outside the Counting House — a wrecked vault spills like any store. */
export function unbankedGold(p: Player): number {
  const cap = shelterCapacity(p, "counting_house") * buildingIntegrity(p, "counting_house");
  return p.gold + Math.max(0, p.bankedGold - cap);
}

/** Deduct plundered or burnt goods: loose stock first, then the spilled vault. */
export function plunderResource(p: Player, r: Resource, amount: number): void {
  const fromLoose = Math.min(p.resources[r], amount);
  p.resources[r] -= fromLoose;
  const rest = amount - fromLoose;
  if (rest > 0) {
    const banked = { ...bankedRes(p) };
    banked[r] = Math.max(0, banked[r] - rest);
    p.bankedResources = banked;
  }
}

export function plunderGold(p: Player, amount: number): void {
  const fromLoose = Math.min(p.gold, amount);
  p.gold -= fromLoose;
  const rest = amount - fromLoose;
  if (rest > 0) p.bankedGold = Math.max(0, p.bankedGold - rest);
}

/**
 * What share of the exposed stock is carried off.
 *
 *                      FOUGHT AND LOST      LAID DOWN ARMS
 *   at war                    100%                50%
 *   at peace              up to 50%        up to 25%
 *
 * In peace: roll the band, scale by relative size (punching up pays a quarter
 * more, farming someone half your weight a quarter less), apply the relief,
 * then clamp to PEACE_CEILING. In war: none of that, just everything outside
 * the vault. Then, either way, halve it if they surrendered.
 *
 * The anti-bullying work that the old XP "bully band" used to do lives in the
 * size scaling and in outcome-based experience: farming a minnow simply doesn't
 * pay, because there is neither loot nor anyone worth killing.
 */
export function lootShare(
  rng: Rng,
  mode: AttackMode,
  yielded: boolean,
  attackerPower: number,
  defenderPower: number,
  atWar = false,
): number {
  // Laying down arms halves the bill, wherever the rest of the sum lands. It is
  // applied LAST, to war and peace alike — which is the fix for a real hole:
  // the war branch below used to return before anything looked at `yielded`, so
  // surrendering to a clan at war cost exactly as much as being cut apart, and
  // there was no reason on earth to do it.
  const surrender = yielded ? LOOT.YIELD_FACTOR : 1;

  // CLAN WAR: no roll, no scaling, no relief, no ceiling. Everything outside the
  // vault is simply gone. Bands and size-scaling are peacetime's way of making a
  // loss survivable — war removes that, and the vault is the only defence left.
  if (atWar) return LOOT.WAR_SHARE * surrender;

  const rolled = rollBand(rng, mode === "raid" ? LOOT.RAID_WIN : LOOT.CASTLE_WIN);
  const ratio = defenderPower / Math.max(1, attackerPower);
  const scale =
    ratio >= LOOT.BIG_TARGET_RATIO
      ? LOOT.BIG_TARGET_BONUS
      : ratio <= LOOT.SMALL_TARGET_RATIO
        ? LOOT.SMALL_TARGET_PENALTY
        : 1;
  // Ceiling before surrender, so a peacetime yield tops out at half the peacetime
  // cap rather than half of an unbounded roll.
  return Math.min(LOOT.PEACE_CEILING, rolled * scale * LOOT.PEACE_MULTIPLIER) * surrender;
}

/**
 * What a given mode carries home — and war does NOT change this.
 *
 * Raids take goods, castle attacks take gold, bombard and revenge take nothing,
 * in peace and in war alike. What war changes is the SHARE (see LOOT.WAR_SHARE)
 * and the ferocity of the fighting, never the character of the blow.
 *
 * That separation is the point. Bombard stays a setup move — you crack the
 * storehouses open and send a raid in behind it — and revenge stays a punishment
 * rather than a payday, so it can never become the efficient way to farm someone.
 * If war made every mode loot, the campaign would collapse into one button.
 */
export function lootKind(mode: AttackMode): "goods" | "gold" | "none" {
  if (mode === "raid") return "goods";
  if (mode === "siege") return "gold"; // "siege" IS the castle attack (see AttackMode)
  return "none"; // bombard and revenge go home empty-handed, war or no war
}

/**
 * Civilians driven off by the attack itself — people flee a sacked town.
 *
 * This is NEW, and it is separate from peasant scattering at the daily reset.
 * The two compound: the attack drives some away outright, and the troops it
 * killed may drop the garrison under the scattering floor, which drives more
 * away at dawn. Bombard causes it too, which is the whole reason bombard has a
 * population cost at all — terror does not require a swordsman.
 */
export function displaceCivilians(rng: Rng, p: Player, mode: AttackMode, yielded: boolean): number {
  const band =
    mode === "raid" ? CIVILIAN_LOSS.RAID
    : mode === "siege" ? CIVILIAN_LOSS.CASTLE
    : mode === "revenge" ? CIVILIAN_LOSS.REVENGE
    : CIVILIAN_LOSS.BOMBARD;
  const share = rollBand(rng, band) * (yielded ? CIVILIAN_LOSS.YIELD_FACTOR : 1);
  const pool = civilians(p);
  const lost = Math.floor(pool * share);
  if (lost <= 0) return 0;

  // The idle go first — they have least holding them here — then the workers
  // are pulled off their posts. Spies and scouts stay; they are not the sort
  // to run.
  let left = lost;
  const fromIdle = Math.min(p.idlePeasants, left);
  p.idlePeasants -= fromIdle;
  left -= fromIdle;
  if (left > 0) {
    for (const role of Object.keys(p.workers) as (keyof typeof p.workers)[]) {
      if (left <= 0) break;
      const take = Math.min(p.workers[role], left);
      p.workers[role] -= take;
      left -= take;
    }
  }
  return lost - left;
}
