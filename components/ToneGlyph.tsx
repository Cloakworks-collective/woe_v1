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

/** A small pixel-art emblem for a chronicle/news row's tone. */
export function ToneGlyph({ tone, size = 26 }: { tone: string; size?: number }) {
  if (!GLYPH_TONES.has(tone)) return null;
  return (
    <span className="chron-glyph">
      <Art path={`tones/${tone}`} size={size} title={TONE_LABEL[tone] ?? tone} />
    </span>
  );
}
