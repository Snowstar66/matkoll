import { describe, expect, it } from "vitest";
import { cleanMenuText, maxMenuTextChars } from "./menu-text";

describe("cleanMenuText", () => {
  it("strips tags, scripts, styles and comments, keeping the lines", () => {
    const html = "<style>.a{}</style><div><h2>Varmr&auml;tter</h2><ul><li>Pulpo&nbsp;&mdash; 189 kr</li><li>Burgare &amp; pommes 165 kr</li></ul></div><script>alert(1)</script><!-- x -->";
    expect(cleanMenuText(html)).toBe("Varmrätter\nPulpo - 189 kr\nBurgare & pommes 165 kr");
  });

  it("decodes numeric entities and collapses blank runs", () => {
    expect(cleanMenuText("Caf&#233;   \t latte\n\n\n\n 45 &#x20AC;")).toBe("Café latte\n45 €");
  });

  it("gives an empty text when only markup is left", () => {
    expect(cleanMenuText("<div> <script>x</script> </div>")).toBe("");
  });

  it("cuts a long text to the cap, at a line end when it can", () => {
    const line = "Biff med bearnaise 245 kr";
    const long = Array.from({ length: 1_000 }, () => line).join("\n");
    const cut = cleanMenuText(long);
    expect(cut.length).toBeLessThanOrEqual(maxMenuTextChars);
    expect(cut.endsWith(line)).toBe(true);
  });
});
