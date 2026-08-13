// What a forum post is allowed to contain.
//
// The editor is Quill, which runs in the browser — so it is decoration, not a
// control. The server action accepts a string, and nothing stops anyone POSTing
// straight to it with whatever HTML they like; Quill's own sanitising happens
// on the wrong side of the wire to matter. This module is the actual boundary,
// and it runs on SAVE and again on RENDER:
//
//   • on save, so nothing dangerous is ever persisted, and a future bug in the
//     rendering path cannot resurrect an old payload;
//   • on render, so anything written before this file existed — or by a
//     migration, or by hand in the database — is still safe on the way out.
//
// Belt and braces on purpose. Stored HTML is a decision you cannot take back
// once people have written things, and "we sanitise on the way in" quietly
// becomes false the first time anyone writes a second insert path.

import sanitizeHtml from "sanitize-html";

/**
 * A deliberately small allowlist — the marks Quill's toolbar can produce, and
 * nothing else. Notably absent:
 *
 *   <img>     a board that fetches arbitrary URLs on render leaks every
 *             reader's IP to whoever posted the link.
 *   <iframe>  self-evident.
 *   style     `style` on a post can cover the page with a transparent overlay,
 *             which is a phishing primitive, not a formatting one.
 *   class/id  a post must not be able to borrow the app's own styling, or
 *             collide with an element the page depends on.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "strong", "em", "u", "s", "blockquote", "pre", "code",
    "ol", "ul", "li", "a", "h3", "h4", "hr", "span",
  ],
  allowedAttributes: {
    a: ["href", "target", "rel"],
    // Quill marks indent levels with `ql-indent-N`; allow just those, so a
    // nested list survives without opening the door to arbitrary classes.
    li: ["class"],
    span: ["class"],
    p: ["class"],
  },
  allowedClasses: {
    li: ["ql-indent-1", "ql-indent-2", "ql-indent-3"],
    p: ["ql-indent-1", "ql-indent-2", "ql-indent-3"],
    span: [], // stripped of every class, but kept so inline runs survive
  },
  // http/https only. `javascript:` and `data:` are the classic ways a
  // "sanitised" post still executes.
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  // Every outbound link is untrusted user content and opens in its own tab
  // without handing it a window.opener handle back to us.
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...attribs,
        target: "_blank",
        rel: "noopener noreferrer nofollow ugc",
      },
    }),
  },
  // An empty <p> is how Quill represents a blank line; keep it.
  nonTextTags: ["style", "script", "textarea", "option", "noscript"],
};

export function sanitizePostHtml(dirty: string): string {
  return sanitizeHtml(dirty, OPTIONS);
}

/**
 * Does this body look like the editor wrote it?
 *
 * Bodies predating the editor — and anything posted with JavaScript off, where
 * the plain textarea is what submits — are Markdown, and must keep rendering as
 * Markdown. Checking for a tag we actually allow is stricter than checking for
 * a stray `<`, so a Markdown post that happens to mention `<script>` in prose
 * is not mistaken for HTML.
 */
export function looksLikeHtml(body: string): boolean {
  return /<(p|br|strong|em|u|s|blockquote|pre|ol|ul|li|a|h3|h4|hr)\b[^>]*>/i.test(body);
}

/** True when a post carries no words at all — Quill's "empty" is `<p><br></p>`. */
export function isEmptyPost(body: string): boolean {
  return sanitizeHtml(body, { allowedTags: [], allowedAttributes: {} }).replace(/\s|&nbsp;/g, "") === "";
}
