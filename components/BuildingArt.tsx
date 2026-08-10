import { existsSync } from "node:fs";
import { join } from "node:path";
import { artStage, type BuildingId } from "@/lib/constants";
import { Art } from "./Art";

/**
 * Damage bands, given as integrity (1 = whole).
 *
 * Bombardment floors most structures at 0.5, so 50% damage is as ruined as they
 * get; the Walls keep their soundness on their own 0–1 field and CAN be ground
 * to rubble. The bands are stated in damage taken, though — "up to 30%" and
 * "30% and worse" — so a single mapping serves both, and the Walls simply spend
 * longer in the bottom band.
 */
function damageSuffix(integrity: number): "" | "-hurt" | "-wreck" {
  if (integrity >= 0.999) return "";
  return integrity > 0.7 ? "-hurt" : "-wreck";
}

/**
 * Which damaged sprites have actually been drawn yet.
 *
 * The damaged art is being rolled out a building at a time, so a structure with
 * no `-hurt`/`-wreck` sprite has to fall back to its pristine one rather than
 * 404. Memoised: at most one stat per distinct path for the life of the server
 * process, not one per render. Server-only — BuildingArt is never imported by a
 * client component.
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

/** A structure's portrait at the stage its level has earned — a Grange at L1 is
 *  a barn and a paddock; by L8 it's a mill and granary tower. Pass `integrity`
 *  (see structureIntegrity) and it shows the battered version of that stage. */
export function BuildingArt({
  id,
  level,
  size,
  title,
  integrity = 1,
}: {
  id: BuildingId;
  level: number;
  size?: number;
  title?: string;
  /** 0–1 soundness. Use structureIntegrity(player, id) — it knows the Walls
   *  keep theirs on a different field. */
  integrity?: number;
}) {
  const stage = artStage(id, level);
  const suffix = damageSuffix(integrity);
  const damaged = `buildings/${id}/${stage}${suffix}`;
  const path = suffix && hasArt(damaged) ? damaged : `buildings/${id}/${stage}`;
  const hurt = suffix !== "";
  return (
    <Art
      path={path}
      size={size}
      title={hurt && title ? `${title} — ${Math.round(integrity * 100)}% integrity` : title}
    />
  );
}
