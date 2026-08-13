import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Forum post bodies, rendered as Markdown.
 *
 * `react-markdown` builds a React element tree — it never touches
 * `dangerouslySetInnerHTML` — so a post containing `<script>` renders as the
 * literal text `<script>` rather than executing. That property is the entire
 * reason for choosing it over `marked`/`showdown`, which hand you an HTML
 * string you then have to remember to sanitise every single time.
 *
 * It holds ONLY while raw HTML stays disabled. Do not add `rehype-raw` here:
 * that plugin exists precisely to undo this guarantee, and on a board where any
 * account can post it would hand every reader's session to any author.
 *
 * GFM is on for tables, strikethrough and autolinks — a game forum argues in
 * tables of numbers more than most.
 */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // Images are deliberately absent from the component map below, which
        // renders them inert: a board that fetches arbitrary URLs on render
        // leaks every reader's IP to whoever posted the link, and is a tidy
        // way to serve something unpleasant to a whole channel at once.
        components={{
          a: ({ href, children: kids }) => {
            // Only ordinary web links and our own paths. `javascript:` and
            // `data:` URLs are the classic way a "safe" renderer still gets you.
            const raw = String(href ?? "");
            const safe = /^(https?:\/\/|\/(?!\/))/i.test(raw);
            if (!safe) return <>{kids}</>;
            const external = /^https?:/i.test(raw);
            return (
              <a
                href={raw}
                {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" } : {})}
              >
                {kids}
              </a>
            );
          },
          img: ({ alt }) => <em>[image: {alt || "omitted"}]</em>,
          // Headings inside a post must not outrank the page's own structure.
          h1: ({ children: kids }) => <h4>{kids}</h4>,
          h2: ({ children: kids }) => <h4>{kids}</h4>,
          h3: ({ children: kids }) => <h4>{kids}</h4>,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
