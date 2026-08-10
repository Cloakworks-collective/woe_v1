import type { ReactNode } from "react";
import { glyphs } from "./Glyph";
import { Info } from "./Info";

/**
 * A parchment panel. Pass `info` (and optionally `guide`) to tuck explainer
 * prose behind a ⓘ tooltip in the title bar instead of spending body space —
 * the game shows numbers; the manual lives in the popover.
 */
export function Panel({
  title,
  info,
  guide,
  children,
}: {
  title: string;
  info?: string;
  guide?: string; // e.g. "/guide#battle"
  children: ReactNode;
}) {
  return (
    <section className="panel">
      <h3>
        {glyphs(title)}
        {info && (
          <span style={{ float: "right", fontWeight: 400 }}>
            <Info tip={info} guide={guide} />
          </span>
        )}
      </h3>
      <div className="body">{children}</div>
    </section>
  );
}
