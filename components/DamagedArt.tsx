import { existsSync } from "node:fs";
import { join } from "node:path";
import { Art } from "./Art";

/**
 * Damaged art, for anything a trebuchet can crack — a player's buildings and a
 * clan's works alike.
 *
 * Damage bands, given as integrity (1 = whole).
 *
 * Bombardment floors most structures at 0.5, so 50% damage is as ruined as they
 * get; the Walls keep their soundness on their own 0–1 field and CAN be ground
 * to rubble. The bands are stated in damage taken, though — "up to 30%" and
 * "30% and worse" — so a single mapping serves both, and the Walls simply spend
 * longer in the bottom band.
 */
export function damageSuffix(integrity: number): "" | "-hurt" | "-wreck" {
  if (integrity >= 0.999) return "";
  return integrity > 0.7 ? "-hurt" : "-wreck";
}

/**
 * Which damaged sprites have actually been drawn yet.
 *
 * The damaged art is being rolled out a structure at a time, so one with no
 * `-hurt`/`-wreck` sprite has to fall back rather than 404. Memoised: at most
 * one stat per distinct path for the life of the server process, not one per
 * render. Server-only — nothing here may be imported by a client component.
 */
const drawn = new Map<string, boolean>();
function hasArt(rel: string): boolean {
  let ok = drawn.get(rel);
  if (ok === undefined) {
    ok = existsSync(join(process.cwd(), "public", "art", `${rel}.png`));
    drawn.set(rel, ok);
  }
  return ok;
}

/**
 * The art path a structure should wear at this soundness, and whether it is
 * showing damage at all.
 *
 * Falls back a band at a time rather than straight to pristine: a structure
 * that has a `-hurt` sprite but no `-wreck` one yet shows the battered art for
 * both bands, which reads far better than a wrecked granary looking untouched.
 */
export function damagedPath(base: string, integrity: number): { path: string; damaged: boolean } {
  const suffix = damageSuffix(integrity);
  if (!suffix) return { path: base, damaged: false };
  for (const s of suffix === "-wreck" ? ["-wreck", "-hurt"] : ["-hurt"]) {
    if (hasArt(`${base}${s}`)) return { path: `${base}${s}`, damaged: true };
  }
  return { path: base, damaged: false };
}

/** A structure's portrait at the given soundness — the battered sprite when one
 *  has been drawn, the whole one when it hasn't. */
export function DamagedArt({
  path: base,
  integrity = 1,
  size,
  title,
}: {
  /** Art path WITHOUT the damage suffix, e.g. "buildings/granary/2". */
  path: string;
  /** 0–1 soundness. */
  integrity?: number;
  size?: number;
  title?: string;
}) {
  const { path } = damagedPath(base, integrity);
  const cracked = integrity < 0.999;
  return (
    <Art
      path={path}
      size={size}
      title={cracked && title ? `${title} — ${Math.round(integrity * 100)}% integrity` : title}
    />
  );
}
