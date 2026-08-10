import { Fragment, type ReactNode } from "react";

/**
 * Swap the emoji that stand in for game concepts for the matching pixel emblem.
 *
 * Most of these glyphs live inside plain strings — panel titles, stat-tile
 * icons, advisor call-to-action labels — rather than as JSX of their own, so
 * they can't be replaced at the call site without turning every one of those
 * props into a node. `glyphs()` rewrites them at the point of render instead,
 * which keeps the copy readable in source and still gets an OS emoji off the
 * screen next to art drawn at 32px.
 *
 * A glyph with no emblem is left exactly as it was, so this degrades to a
 * no-op rather than to a missing image.
 */
const ICON = (n: string) => `/art/ui/icons/${n}.png`;
const RES = (n: string) => `/art/resources/${n}.png`;

const EMBLEM: Record<string, string> = {
  // The council, the realm and the war — the emblems the menus use.
  "⚔": ICON("army"),
  "🗡": ICON("army"),
  "👑": ICON("crown"),
  "🛡": ICON("clan"),
  "📜": ICON("scroll"),
  "📖": ICON("chronicle"),
  "📚": ICON("research"),
  "🏆": ICON("trophy"),
  "⚖": ICON("market"),
  "🏰": ICON("castle"),
  "🏯": ICON("castle"),
  "🏗": ICON("build"),
  "🔨": ICON("build"),
  "⚒": ICON("build"),
  "👥": ICON("workers"),
  "🧑‍🌾": ICON("workers"),
  "🏹": ICON("siege"),
  "🧙": ICON("advisor"),
  "🌍": ICON("world"),
  "🌎": ICON("world"),
  "🕯": ICON("forum"),
  "🪙": ICON("coin"),
  "💰": ICON("coin"),
  "☠": ICON("skull"),
  "🔥": ICON("fire"),
  "⚜": ICON("banner"),
  "✉": ICON("letter"),
  // The second sheet — states, warnings and the odds and ends.
  "🔒": ICON("lock"),
  "🔑": ICON("lock"),
  "⚠": ICON("warning"),
  "⛔": ICON("warning"),
  "✦": ICON("star"),
  "✧": ICON("star"),
  "★": ICON("star"),
  "🏖": ICON("vacation"),
  "🪶": ICON("quill"),
  "🔧": ICON("wrench"),
  "🎯": ICON("target"),
  "🐫": ICON("caravan"),
  "💓": ICON("heart"),
  "❤": ICON("heart"),
  "🌱": ICON("seedling"),
  "🏘": ICON("houses"),
  "🏠": ICON("houses"),
  "🛏": ICON("bed"),
  "🧱": ICON("brick"),
  "🏳": ICON("flag"),
  "🏛": ICON("temple"),
  "🏦": ICON("temple"),
  "🐎": ICON("horse"),
  "💥": ICON("blast"),
  "💡": ICON("idea"),
  "🔭": ICON("spyglass"),
  "🎖": ICON("medal"),
  // Resources already have the game's own pixel icons — reuse them rather
  // than drawing a second loaf of bread in a slightly different hand.
  "🍞": RES("food"),
  "🌾": RES("food"),
  "🪵": RES("wood"),
  "🪨": RES("stone"),
  "⛏": RES("ore"),
  "⏳": RES("turns"),
  "⌛": RES("turns"),
};

// Emoji presentation selector — 🛡️ and 🛡 are the same concept, and the copy
// uses both spellings interchangeably. Longest key first so a multi-codepoint
// sequence isn't matched by its own first character.
const VS16 = "️";
const KEYS = Object.keys(EMBLEM).sort((a, b) => b.length - a.length);
const SPLIT = new RegExp(`(${KEYS.join("|")})${VS16}?`, "gu");

export function glyphs(node: ReactNode): ReactNode {
  // JSX with an interpolation — `<Btn>🔧 Repair ({cost}g)</Btn>` — arrives as
  // an array of strings and nodes, so walk one level rather than only taking
  // the single-string case. Anything that isn't a string is passed through
  // untouched, which leaves nested elements and their keys alone.
  if (Array.isArray(node)) return node.map((child, i) => <Fragment key={i}>{glyphs(child)}</Fragment>);
  if (typeof node !== "string" || !node) return node;
  const parts = node.split(SPLIT);
  if (parts.length === 1) return node;
  return parts.map((part, i) =>
    EMBLEM[part] ? <img key={i} src={EMBLEM[part]} alt="" className="glyph" /> : part,
  );
}

/** The same swap for a glyph you already have on its own. */
export function Glyph({ char, className }: { char: string; className?: string }) {
  const src = EMBLEM[char.replace(VS16, "")];
  if (!src) return <>{char}</>;
  return <img src={src} alt="" className={className ?? "glyph"} />;
}
