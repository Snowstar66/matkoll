import { describe, expect, it } from "vitest";
import { findMenuLinks, htmlToText } from "./page-text";

describe("htmlToText", () => {
  it("keeps visible text, drops scripts, styles and comments, decodes entities, one line per block", () => {
    const html = "<html><head><style>p{}</style><script>alert(1)</script></head><body><!-- x --><h1>Meny</h1><ul><li>Pizza&nbsp;Margherita &amp; mer</li><li>R&#246;kt lax</li></ul><p>Pris   125 kr</p></body></html>";
    expect(htmlToText(html, 1000)).toBe("Meny\nPizza Margherita & mer\nRökt lax\nPris 125 kr");
  });
  it("cuts at the limit", () => {
    expect(htmlToText("<p>abcdefghij</p>", 4)).toBe("abcd");
  });
});

describe("findMenuLinks", () => {
  const html = `<a href="/om-oss">Om oss</a><a href="/meny">Meny</a><a href="https://other.se/meny">Meny</a><a href="/lunch-meny.pdf">Lunch</a><a href="/lunch">Dagens lunch</a><a href="mailto:a@b.se">Meny</a><a href="javascript:x()">Meny</a>`;
  it("returns same-host https menu pages, best first, no files or other hosts", () => {
    expect(findMenuLinks(html, "https://trattoria.se/", 2)).toEqual(["https://trattoria.se/meny", "https://trattoria.se/lunch"]);
  });
  it("returns nothing for a bad base", () => {
    expect(findMenuLinks(html, "nonsense")).toEqual([]);
  });
});
