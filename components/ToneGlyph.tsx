import { Art } from "./Art";

// Tones that have a pixel-art glyph in public/art/tones. Any other tone
// (e.g. "crown") renders nothing rather than a broken image.
const GLYPH_TONES = new Set(["war", "shadow", "danger", "growth", "trade", "clan", "info"]);

const TONE_LABEL: Record<string, string> = {
  war: "Battle",
  shadow: "Espionage",
  danger: "Peril",
  growth: "Growth",
  trade: "Trade",
  clan: "Clan",
  info: "Tiding",
};

/**
 * A small pixel-art emblem for a chronicle/news row.
 *
 * `icon` names a specific plate in /art/ui/icons and wins when given — a raid,
 * a castle assault, a bombardment and a revenge are four different events and
 * used to share one identical war glyph, as did arson, theft and a survey of
 * the coffers under one shadow glyph. Tone is right for COLOUR and wrong for a
 * picture: it says how to feel about an entry, not what happened in it.
 *
 * The tone glyph remains the fallback, so an event with no plate of its own
 * still reads as war or shadow rather than as nothing.
 */
export function ToneGlyph({
  tone,
  icon,
  size = 26,
}: {
  tone: string;
  icon?: string;
  size?: number;
}) {
  if (icon) {
    return (
      <span className="chron-glyph">
        <img
          src={`/art/ui/icons/${icon}.png`}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, imageRendering: "pixelated" }}
          title={TONE_LABEL[tone] ?? tone}
        />
      </span>
    );
  }
  if (!GLYPH_TONES.has(tone)) return null;
  return (
    <span className="chron-glyph">
      <Art path={`tones/${tone}`} size={size} title={TONE_LABEL[tone] ?? tone} />
    </span>
  );
}
