import { describe, expect, it } from "vitest";
import { appIconColors, themeColors } from "@/app/theme-colors";
import { colorTokens } from "./tokens";

// NFR4: every text pair in DESIGN.md reaches 4.5:1 in light and dark mode.

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const { light, dark } = colorTokens();

const colorNames = [
  "bg", "surface", "ink", "ink-2", "ink-3", "hairline", "border", "accent", "on-accent",
  "mint", "mint-ink", "sky", "sky-ink", "sand", "sand-ink",
];

/** [text, background, where it is used] */
const textPairs: [string, string, string][] = [
  ["ink", "bg", "titles on the page"],
  ["ink-2", "bg", "body text and empty states on the page"],
  ["ink", "surface", "titles in cards"],
  ["ink-2", "surface", "body text in cards"],
  ["ink-3", "surface", "metadata, inactive tabs"],
  ["on-accent", "accent", "primary button, chosen pill"],
  ["mint-ink", "mint", "Kan lagas nu, active side-menu item"],
  ["sky-ink", "sky", "Saknar N varor, notice, secondary button"],
  ["sand-ink", "sand", "AI-förslag"],
  ["sky-ink", "bg", "field error on /logga-in"],
  // Pairs the shell and building blocks add on top of DESIGN.md's list:
  ["accent", "surface", "active tab label, heart, text button in a sheet"],
  ["accent", "bg", "text button on the page"],
  ["surface", "ink", "toast text"],
  ["mint", "ink", "Ångra in the toast"],
];

describe("design tokens", () => {
  it.each([
    ["light", light],
    ["dark", dark],
  ])("globals.css defines every DESIGN.md colour in %s mode", (_mode, tokens) => {
    expect(Object.keys(tokens).sort()).toEqual([...colorNames].sort());
  });

  it("says which block is missing instead of reading the wrong one", () => {
    expect(() => colorTokens("body { color: red; }")).toThrow("no :root block");
    expect(() => colorTokens(":root { --bg: #FFFFFF; }")).toThrow("no dark @media block");
    expect(() => colorTokens(":root { }\n@media (prefers-color-scheme: dark) { body { } }")).toThrow(
      "no :root inside the dark @media block",
    );
  });

  it("has no red: every colour is grey-green, blue, sand or white", () => {
    for (const hex of [...Object.values(light), ...Object.values(dark)]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      // Red dominating both other channels clearly is what reads as red.
      expect(r - Math.max(g, b), hex).toBeLessThan(40);
    }
  });

  it("theme-color in the root layout is --bg in each mode", () => {
    const rgb = (hex: string) =>
      `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ")})`;
    expect(themeColors.light).toBe(rgb(light.bg));
    expect(themeColors.dark).toBe(rgb(dark.bg));
  });

  it("the app icon's colours are light mode's tokens (DESIGN.md, app-icon)", () => {
    const rgb = (hex: string) =>
      `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ")})`;
    expect(appIconColors).toEqual({
      bg: rgb(light.bg),
      accent: rgb(light.accent),
      sand: rgb(light.sand),
      sandInk: rgb(light["sand-ink"]),
    });
  });
});

/** WCAG 1.4.11: borders that show where a control is need 3:1. [border, background, where] */
const controlBorderPairs: [string, string, string][] = [
  ["ink-3", "surface", "unticked check circle, text field border in a sheet"],
  ["ink-3", "bg", "text field border on the page"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("contrast in %s mode", (_mode, tokens) => {
  it.each(textPairs)("text: %s on %s (%s) is at least 4.5:1", (text, background) => {
    expect(contrast(tokens[text], tokens[background])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(controlBorderPairs)("control border: %s on %s (%s) is at least 3:1", (border, background) => {
    expect(contrast(tokens[border], tokens[background])).toBeGreaterThanOrEqual(3);
  });
});
