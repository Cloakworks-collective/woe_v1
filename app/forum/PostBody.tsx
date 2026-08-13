import { looksLikeHtml, sanitizePostHtml } from "@/lib/server/postHtml";
import { Markdown } from "./Markdown";

/**
 * One post's words, however they were written.
 *
 * Two eras of body live in the same column and always will: HTML from the
 * editor, and Markdown from before it existed or from anyone posting with
 * JavaScript off. Sniffing the body is nicer than a schema migration and a
 * `format` column that every future insert would have to remember to set.
 *
 * The HTML path sanitises AGAIN here even though the save path already did.
 * That is not belt-and-braces theatre: it is what makes a row written by a
 * migration, a script, or a hand-edited database safe on the way out, and it
 * costs microseconds on a page that already went to Postgres.
 */
export function PostBody({ body }: { body: string }) {
  if (!looksLikeHtml(body)) return <Markdown>{body}</Markdown>;
  return (
    <div
      className="md"
      // Safe: sanitizePostHtml strips to a small allowlist with no scripts, no
      // event handlers, no styles, and http(s)/mailto links only.
      dangerouslySetInnerHTML={{ __html: sanitizePostHtml(body) }}
    />
  );
}
