"use client";

import "quill/dist/quill.snow.css";
import { useEffect, useRef, useState } from "react";
import { FORUM_LIMITS } from "@/lib/constants/forum";

/**
 * The write box: a real <textarea> that Quill upgrades in place.
 *
 * PROGRESSIVE ENHANCEMENT, and not for its own sake. The whole forum is
 * server-rendered and works without JavaScript; if the editor were the only way
 * to write, a failed chunk load or a blocked script would turn the boards
 * read-only with no way to tell. So the textarea is the control that actually
 * submits, and Quill is a skin over it:
 *
 *   • no JS       → you type Markdown into the textarea, as before
 *   • Quill loads → the textarea is hidden and mirrors Quill's HTML on every
 *                   keystroke, so the form still posts the same field
 *
 * Quill is imported dynamically because it touches `document` at module scope,
 * which would break the server render outright.
 *
 * None of this is a security boundary — see lib/server/postHtml.ts, which is.
 */
export function Editor({
  name = "body",
  label,
  placeholder,
  minHeight = 180,
}: {
  name?: string;
  label: string;
  placeholder?: string;
  minHeight?: number;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    let quill: import("quill").default | undefined;
    let cancelled = false;

    (async () => {
      const { default: Quill } = await import("quill");
      if (cancelled || !holder.current || holder.current.dataset.ready) return;
      holder.current.dataset.ready = "1";

      quill = new Quill(holder.current, {
        theme: "snow",
        placeholder,
        modules: {
          toolbar: [
            [{ header: [3, 4, false] }],
            ["bold", "italic", "underline", "strike"],
            ["blockquote", "code-block"],
            [{ list: "ordered" }, { list: "bullet" }],
            ["link", "clean"],
          ],
          // Paste from anywhere is a common way to smuggle markup in. Quill's
          // matchers already normalise it, and the server strips whatever is
          // left — this just keeps the editor's own view honest.
          clipboard: { matchVisual: false },
        },
      });

      // A blank document is `<p><br></p>`; treat that as empty so `required`
      // on the textarea still means something.
      const sync = () => {
        if (!area.current || !quill) return;
        const html = quill.getSemanticHTML();
        area.current.value = quill.getText().trim().length === 0 ? "" : html;
      };
      quill.on("text-change", sync);
      sync();
      setLive(true);
    })();

    return () => {
      cancelled = true;
      quill?.off("text-change");
    };
  }, [placeholder]);

  return (
    <div className="flat-field">
      <span>{label}</span>
      {/* Rendered always, hidden once Quill is driving it — it is the field
          that submits either way. */}
      <textarea
        ref={area}
        name={name}
        rows={7}
        placeholder={placeholder}
        maxLength={FORUM_LIMITS.BODY_MAX}
        required
        aria-label={label}
        className={live ? "editor-fallback is-hidden" : "editor-fallback"}
      />
      <div className="editor-shell" hidden={!live}>
        <div ref={holder} style={{ minHeight }} />
      </div>
      <span className="flat-note">
        {live ? (
          <>Formatting is kept; pasted styling, images and raw HTML are stripped.</>
        ) : (
          <>
            Markdown works here — <code>**bold**</code>, <code>*italic*</code>, <code>`code`</code>,{" "}
            <code>&gt; quote</code>, <code>- lists</code>, <code>[link](url)</code>.
          </>
        )}
      </span>
    </div>
  );
}
