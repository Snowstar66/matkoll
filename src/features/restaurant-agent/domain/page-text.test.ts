import { describe, expect, it } from "vitest";
import { htmlToText } from "./page-text";

describe("htmlToText", () => {
  it("keeps visible text, drops scripts, styles and comments, decodes entities, one line per block", () => {
    const html = "<html><head><style>p{}</style><script>alert(1)</script></head><body><!-- x --><h1>Meny</h1><ul><li>Pizza&nbsp;Margherita &amp; mer</li><li>R&#246;kt lax</li></ul><p>Pris   125 kr</p></body></html>";
    expect(htmlToText(html, 1000)).toBe("Meny\nPizza Margherita & mer\nRökt lax\nPris 125 kr");
  });
  it("cuts at the limit", () => {
    expect(htmlToText("<p>abcdefghij</p>", 4)).toBe("abcd");
  });
});
