import type { ReactNode } from "react";
import Link from "next/link";

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
  guide,
  guideLabel = "Read the manual",
  children,
}: {
  tip: string;
  title?: string; // optional bold lead line inside the popover
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
        {tip}
        {guide && (
          <Link className="tip-guide" href={guide}>
            📜 {guideLabel} →
          </Link>
        )}
      </span>
    </span>
  );
}
