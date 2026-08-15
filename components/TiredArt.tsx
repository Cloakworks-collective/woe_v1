import { existsSync } from "node:fs";
import { join } from "node:path";
import { STAMINA } from "@/lib/constants";
import { Art, resolveArtPath } from "./Art";

/**
 * Troops that LOOK as tired as they fight.
 *
 * Stamina is a single army-wide stat (`p.army.stamina`, 0–100) and it is the
 * gate on how much power the whole host can bring:
 *
 *     staminaDelivery = 0.5 + 0.005 × stamina
 *
 * …so a spent army swings at half strength no matter how well researched. That
 * is a big number to leave living in a meter. The bands below put it on the
 * soldiers themselves, and they are drawn where the arithmetic already bends:
 *
 *   70–100  fresh       ×0.85–1.00 delivery
 *   25–70   worn        ×0.63–0.85 — scuffed kit, dulled colours
 *    0–25   spent       below ×0.63, and below STAMINA.MERCY_FLOOR, where a
 *                       defender lays down arms rather than be cut apart
 *
 * The bottom band deliberately coincides with the mercy floor: the sprite that
 * shows torn armour is the sprite that shows an army about to surrender.
 */
export function tiredSuffix(stamina: number): "" | "-worn" | "-spent" {
  if (stamina >= STAMINA.ART_WORN_BELOW) return "";
  return stamina >= STAMINA.ART_SPENT_BELOW ? "-worn" : "-spent";
}

/** Human-readable band, for tooltips. */
export function tiredLabel(stamina: number): string {
  const s = tiredSuffix(stamina);
  return s === "" ? "rested" : s === "-worn" ? "tired" : "spent";
}

/**
 * Which tired sprites have actually been drawn.
 *
 * The art is being rolled out a race at a time, so a race with no `-worn`
 * sprite must fall back rather than 404. Memoised per resolved path for the
 * life of the server process. Server-only — never import from a client
 * component. (Same shape as DamagedArt's `hasArt`; kept separate because the
 * two roll out independently and sharing a cache would only couple them.)
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
 * The sprite a unit should wear at this stamina, resolved for the race.
 *
 * Falls back a band at a time rather than straight to fresh: a race with a
 * `-worn` sprite but no `-spent` one yet shows the worn art for both, which
 * reads far better than an exhausted army looking parade-ready. And the check
 * is against the RESOLVED path, because `units/footman` is not a file — every
 * race has its own, and only some of them are drawn yet.
 */
export function tiredPath(base: string, stamina: number, race?: string): string {
  const want = tiredSuffix(stamina);
  if (!want) return base;
  const resolved = resolveArtPath(base, race);
  for (const s of want === "-spent" ? ["-spent", "-worn"] : ["-worn"]) {
    if (hasArt(`${resolved}${s}`)) return `${resolved}${s}`;
  }
  return base;
}

/** A unit's portrait at the army's current stamina. */
export function TiredArt({
  path: base,
  stamina,
  race,
  size,
  title,
}: {
  /** Art path WITHOUT the tiredness suffix, e.g. "units/footman". */
  path: string;
  /** The army's stamina, 0–100. */
  stamina: number;
  race?: string;
  size?: number;
  title?: string;
}) {
  const path = tiredPath(base, stamina, race);
  const worn = path !== base;
  return (
    <Art
      path={path}
      size={size}
      // `path` is already race-resolved when a tired sprite was found, so the
      // race must NOT be applied twice — resolveArtPath only rewrites a
      // one-segment path, but passing it again would be a lie about intent.
      race={worn ? undefined : race}
      title={worn && title ? `${title} — ${tiredLabel(stamina)} (stamina ${stamina}/${STAMINA.MAX})` : title}
    />
  );
}
