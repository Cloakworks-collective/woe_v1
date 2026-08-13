// What a post is allowed to contain — tested as the payloads someone would
// actually POST, since the editor is client-side and can simply be skipped.

import { describe, expect, it } from "vitest";
import { isEmptyPost, looksLikeHtml, sanitizePostHtml } from "./postHtml";

describe("post sanitising", () => {
  it("keeps the marks the editor can produce", () => {
    const rich =
      "<p><strong>bold</strong> <em>it</em> <u>u</u> <s>s</s></p>" +
      "<blockquote>quoted</blockquote><pre><code>code()</code></pre>" +
      "<ul><li>one</li></ul><ol><li>two</li></ol><h3>head</h3><hr />";
    const clean = sanitizePostHtml(rich);
    for (const tag of ["strong", "em", "u", "s", "blockquote", "pre", "code", "ul", "li", "ol", "h3", "hr"]) {
      expect(clean).toContain(`<${tag}`);
    }
  });

  it("strips script, and does not leave its contents executable", () => {
    const out = sanitizePostHtml("<p>hi</p><script>alert('x')</script>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).toContain("<p>hi</p>");
  });

  it("strips images — a post must not make every reader fetch a URL", () => {
    // This is the payload Quill's own paste handler let through, which is the
    // whole argument for sanitising on the server.
    expect(sanitizePostHtml('<p>a<img src="x" onerror="alert(1)">b</p>')).not.toContain("<img");
    expect(sanitizePostHtml('<img src="https://tracker.example/pixel.gif">')).not.toContain("img");
  });

  it("strips event handlers even on tags it keeps", () => {
    const out = sanitizePostHtml('<p onclick="alert(1)" onmouseover="alert(2)">text</p>');
    expect(out).toBe("<p>text</p>");
  });

  it("strips style, which is a phishing primitive rather than formatting", () => {
    const out = sanitizePostHtml('<p style="position:fixed;inset:0;z-index:9999">cover</p>');
    expect(out).not.toContain("style");
  });

  it("allows only http, https and mailto links", () => {
    expect(sanitizePostHtml('<a href="https://ok.example">x</a>')).toContain("https://ok.example");
    expect(sanitizePostHtml('<a href="mailto:a@b.c">x</a>')).toContain("mailto:");
    for (const bad of [
      '<a href="javascript:alert(1)">x</a>',
      '<a href="JaVaScRiPt:alert(1)">x</a>',
      '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>',
      '<a href="//evil.example">x</a>',
    ]) {
      expect(sanitizePostHtml(bad)).not.toMatch(/javascript|data:|\/\/evil/i);
    }
  });

  it("hardens every outbound link", () => {
    const out = sanitizePostHtml('<a href="https://ok.example">x</a>');
    expect(out).toContain('rel="noopener noreferrer nofollow ugc"');
    expect(out).toContain('target="_blank"');
  });

  it("refuses iframes and other embedded frames outright", () => {
    expect(sanitizePostHtml('<iframe src="https://evil.example"></iframe>')).toBe("");
    expect(sanitizePostHtml("<object data='x'></object>")).toBe("");
  });

  it("does not let a post borrow the app's own styling", () => {
    const out = sanitizePostHtml('<p class="alert alert-danger">fake warning</p>');
    expect(out).not.toContain("alert");
    // …but Quill's own indent classes survive, so nested lists still render.
    expect(sanitizePostHtml('<li class="ql-indent-1">x</li>')).toContain("ql-indent-1");
  });
});

describe("telling the two eras of body apart", () => {
  it("treats editor output as HTML and older bodies as Markdown", () => {
    expect(looksLikeHtml("<p>from the editor</p>")).toBe(true);
    expect(looksLikeHtml("**bold** and a list\n- one")).toBe(false);
    // Prose that merely mentions a tag is still Markdown — checking for a
    // stray "<" would have misrouted this into the HTML path.
    expect(looksLikeHtml("the guide says `<script>` is stripped")).toBe(false);
  });

  it("knows an empty document when it sees one", () => {
    expect(isEmptyPost("<p><br></p>")).toBe(true);
    expect(isEmptyPost("<p>&nbsp;</p>")).toBe(true);
    expect(isEmptyPost("   ")).toBe(true);
    expect(isEmptyPost("<p>a</p>")).toBe(false);
  });
});
