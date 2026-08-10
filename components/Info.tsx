import type { ReactNode } from "react";
import Link from "next/link";
import { glyphs } from "@/components/Glyph";

/**
 * A hover/focus tooltip. Two shapes:
 *   <Info tip="…">Wall</Info>      → dotted-underlined label with a popover
 *   <Info tip="…" />               → a small ⓘ mark with a popover
 * Pass `guide="/guide#battle"` to add a clickable "Read the manual →" deep-link
 * at the foot of the popover. Pure CSS (see .tip in globals.css); the popover is
 * keyboard-reachable via tabIndex and interactive on hover/focus.
 */
export function Info({
  tip,
  title,
  bullets,
  guide,
  guideLabel = "Read the manual",
  children,
}: {
  tip: string;
  title?: string; // optional bold lead line inside the popover
  /** Optional points listed under the lead. Use these for "what this actually
   *  does for me" — a paragraph of four clauses is a paragraph nobody reads. */
  bullets?: string[];
  guide?: string; // optional guide anchor, e.g. "/guide#battle"
  guideLabel?: string;
  children?: ReactNode;
}) {
  return (
    <span className="tip" tabIndex={0}>
      {children ? (
        <span className="tip-under">{children}</span>
      ) : (
        <span className="tip-mark" aria-hidden="true">
          i
        </span>
      )}
      <span className="tip-pop" role="tooltip">
        {title && (
          <>
            <b>{title}</b>
            <br />
          </>
        )}
        {glyphs(tip)}
        {bullets && bullets.length > 0 && (
          <ul className="tip-points">
            {bullets.map((b) => (
              <li key={b}>{glyphs(b)}</li>
            ))}
          </ul>
        )}
        {guide && (
          <Link className="tip-guide" href={guide}>
            📜 {guideLabel} →
          </Link>
        )}
      </span>
    </span>
  );
}
