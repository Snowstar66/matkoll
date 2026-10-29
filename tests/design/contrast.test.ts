import { describe, expect, it } from "vitest";
import { appIconColors, themeColors } from "@/app/theme-colors";
import { colorTokens, rootToken } from "./tokens";

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
  "mint", "mint-ink", "sky", "sky-ink", "sand", "sand-ink", "store-ica", "store-ica-ink", "store-other", "store-other-ink", "deal", "deal-ink", "hot", "hot-ink", "tile-clay", "tile-lilac",
];

/** [text, background, where it is used] */
const textPairs: [string, string, string][] = [
  ["ink", "bg", "titles on the page"],
  ["ink-2", "bg", "body text and empty states on the page, category header name and count"],
  ["ink", "surface", "titles in cards"],
  ["ink-2", "surface", "body text in cards"],
  ["ink-3", "surface", "metadata, inactive tabs"],
  ["on-accent", "accent", "primary button, chosen pill"],
  ["mint-ink", "mint", "Kan lagas nu, active side-menu item"],
  ["sky-ink", "sky", "Saknar N varor, notice, secondary button, product chip"],
  ["sand-ink", "sand", "AI-förslag"],
  ["store-ica-ink", "store-ica", "store badge, ICA"],
  ["store-other-ink", "store-other", "store badge, other chains"],
  ["deal-ink", "deal", "saving badge on an offer row"],
  ["deal-ink", "surface", "saving percent as text on an offer row (Story 16.6)"],
  ["hot", "surface", "Toppklipp label text on an offer row (Story 16.6)"],
  ["hot-ink", "hot", "Toppklipp badge on an offer row"],
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

  it("has no red except the ICA badge and the warm offer tags (Story 9.15)", () => {
    const warm = new Set(["store-ica", "deal-ink", "hot", "deal"].flatMap((name) => [light[name], dark[name]]));
    for (const hex of [...Object.values(light), ...Object.values(dark)]) {
      if (warm.has(hex)) continue;
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

/**
 * Category tiles (Epic 11) are decoration: the category's name always stands
 * beside them, so no contrast ratio applies. They must still be told apart
 * from the page, in both modes.
 */
const categoryTiles = ["mint", "sky", "sand", "tile-clay", "tile-lilac", "border"];

/** WCAG 1.4.11: borders that show where a control is need 3:1. [border, background, where] */
const controlBorderPairs: [string, string, string][] = [
  ["ink-3", "surface", "unticked check circle, text field border in a sheet"],
  ["ink-3", "bg", "text field border on the page"],
  ["store-ica", "surface", "chain dot in an offer row's store label (Story 16.6)"],
  ["store-other", "surface", "chain dot in an offer row's store label (Story 16.6)"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("contrast in %s mode", (_mode, tokens) => {
  it.each(textPairs)("text: %s on %s (%s) is at least 4.5:1", (text, background) => {
    expect(contrast(tokens[text], tokens[background])).toBeGreaterThanOrEqual(4.5);
  });

  it("Toppklipp text stays readable on its 12 % tint over surface (Story 16.6)", () => {
    const tint = composite(tokens.hot, tokens.surface, 0.12);
    expect(contrast(tokens.hot, tint)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(controlBorderPairs)("control border: %s on %s (%s) is at least 3:1", (border, background) => {
    expect(contrast(tokens[border], tokens[background])).toBeGreaterThanOrEqual(3);
  });

  it.each(categoryTiles)("category tile: %s stands apart from bg", (tile) => {
    expect(contrast(tokens[tile], tokens.bg)).toBeGreaterThanOrEqual(1.05);
  });
});

/**
 * Epic 11: the badge and the heart on a recipe image sit on --overlay,
 * surface at 92 % over any photo. The pairs are checked with the overlay
 * laid over black and over white, the two extremes of a photo. Badge text
 * needs 4.5:1; the heart is a graphic and needs 3:1 (WCAG 1.4.11).
 */
const overlayShare = Number(/var\(--surface\) (\d+)%/.exec(rootToken("overlay") ?? "")?.[1]) / 100;

/** `top` at `share` opacity over `under`, as hex. */
function composite(top: string, under: string, share: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `#${[1, 3, 5]
    .map((i) => Math.round(channel(top, i) * share + channel(under, i) * (1 - share)))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** [colour on the overlay, minimum ratio, where] */
const overlayPairs: [string, number, string][] = [
  ["mint-ink", 4.5, "status badge Kan lagas nu on a recipe image"],
  ["sky-ink", 4.5, "status badge Saknar N varor on a recipe image"],
  ["accent", 3, "filled heart on a recipe image"],
  ["ink-3", 3, "outlined heart on a recipe image"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("on the image overlay in %s mode", (_mode, tokens) => {
  it("the overlay is surface at 92 %", () => {
    expect(overlayShare).toBe(0.92);
  });

  it.each(["#000000", "#FFFFFF"])("over %s, every badge and heart colour is readable", (photo) => {
    const plate = composite(tokens.surface, photo, overlayShare);
    for (const [color, minimum, where] of overlayPairs) {
      expect(contrast(tokens[color], plate), where).toBeGreaterThanOrEqual(minimum);
    }
  });
});
