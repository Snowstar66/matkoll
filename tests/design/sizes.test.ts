import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { globalsCssPath, lengthTokens, rootToken } from "./tokens";

// Epic 11 (Story 11.1, AD-17): the new sizes and the overlay are tokens in
// globals.css with DESIGN.md's values, mapped to Tailwind classes.

const css = readFileSync(globalsCssPath, "utf8");

describe("Epic 11 tokens", () => {
  it.each([
    ["tile-size", 30, "--spacing-tile"],
    ["row-min", 56, "--spacing-row"],
    ["card-image", 120, "--spacing-card-image"],
    ["dish-thumb", 56, "--spacing-dish-thumb"],
    ["meter-height", 8, "--spacing-meter"],
    ["meter-height-small", 5, "--spacing-meter-small"],
  ])("--%s is %ipx and mapped as %s", (token, px, mapped) => {
    expect(lengthTokens(css)[token]).toBe(px);
    expect(css).toContain(`${mapped}: var(--${token});`);
  });

  it("--overlay is surface at 92 %, mapped as a colour, and follows surface in dark mode", () => {
    expect(rootToken("overlay", css)).toBe("color-mix(in srgb, var(--surface) 92%, transparent)");
    expect(css).toContain("--color-overlay: var(--overlay);");
    expect(css.match(/--overlay\s*:/g)).toHaveLength(1);
  });

  it("the tiles are mapped as colours", () => {
    expect(css).toContain("--color-tile-clay: var(--tile-clay);");
    expect(css).toContain("--color-tile-lilac: var(--tile-lilac);");
  });

  it("reads only px lengths", () => {
    expect(lengthTokens(":root { --a: 30px; --b: #FFFFFF; --c: 1.5; --d: 2.5px; }")).toEqual({ a: 30, d: 2.5 });
  });
});
