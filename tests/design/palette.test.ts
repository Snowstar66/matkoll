import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palettes } from "@/lib/palette";
import { colorTokens, globalsCssPath } from "./tokens";

// Färgtema: every preset keeps the text pairs at 4.5:1 in light and dark mode, the default
// (grön) repeats :root exactly, and "Egen" (the hue slider) holds the contrast at every hue.

const css = readFileSync(globalsCssPath, "utf8");
const section = css.slice(css.indexOf("Farg-tema"));
const darkAt = section.indexOf("@media (prefers-color-scheme: dark)");
const lightCss = section.slice(0, darkAt);
const darkCss = section.slice(darkAt);

const { light, dark } = colorTokens();
const themed = ["accent", "on-accent", "mint", "mint-ink", "illus-bg", "fill", "seg-track"];

function declarations(source: string, id: string): Record<string, string> {
  const match = new RegExp(`\\[data-palette="${id}"\\]\\s*\\{([^}]*)\\}`).exec(source);
  if (!match) throw new Error(`No [data-palette="${id}"] block`);
  const values: Record<string, string> = {};
  for (const item of match[1].matchAll(/--([a-z-]+):\s*([^;]+);/g)) values[item[1]] = item[2].trim();
  return values;
}

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function luminance(rgb: number[]): number {
  const [r, g, b] = rgb.map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hexToRgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
}

/** OKLCH to gamma-encoded sRGB 0–1, clipped to the gamut the way a browser clamps. */
export function oklchToRgb(L: number, C: number, H: number): number[] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return linear.map((c) => {
    const clipped = Math.min(1, Math.max(0, c));
    return clipped <= 0.0031308 ? 12.92 * clipped : 1.055 * clipped ** (1 / 2.4) - 0.055;
  });
}

function contrast(a: number[], b: number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A token's value as sRGB: a hex colour, or `oklch(L C var(--hue, 150))` at the given hue. */
function rgbOf(value: string, hue: number): number[] {
  if (value.startsWith("#")) return hexToRgb(value);
  const match = /^oklch\(([\d.]+) ([\d.]+) var\(--hue, 150\)\)$/.exec(value);
  if (!match) throw new Error(`Unexpected colour: ${value}`);
  return oklchToRgb(Number(match[1]), Number(match[2]), hue);
}

type Mode = { name: string; base: Record<string, string>; blocks: string };
const modes: Mode[] = [
  { name: "light", base: light, blocks: lightCss },
  { name: "dark", base: dark, blocks: darkCss },
];

/** [text, background, where] with the palette's tokens or the page's own (bg, surface, surface-2). */
const pairs: [string, string][] = [
  ["accent", "bg"],
  ["accent", "surface"],
  ["accent", "surface-2"],
  ["on-accent", "accent"],
  ["mint-ink", "mint"],
];

function check(mode: Mode, id: string, hue: number) {
  const block = declarations(mode.blocks, id);
  const value = (name: string) => (name in block ? rgbOf(block[name], hue) : hexToRgb(mode.base[name]));
  for (const [text, background] of pairs) {
    expect(contrast(value(text), value(background)), `${id} ${mode.name} ${text} on ${background} at hue ${hue}`).toBeGreaterThanOrEqual(4.5);
  }
}

describe("colour themes", () => {
  it("has a block for every preset in light and dark, setting the same tokens", () => {
    for (const { id } of palettes) {
      for (const mode of modes) expect(Object.keys(declarations(mode.blocks, id)).sort()).toEqual([...themed].sort());
    }
  });

  it("grön repeats the default :root values, so the default look is unchanged", () => {
    for (const mode of modes) {
      const green = declarations(mode.blocks, "gron");
      for (const name of themed) expect(green[name], `${mode.name} --${name}`).toBe(mode.base[name]);
    }
  });

  it.each(palettes.filter((palette) => palette.id !== "custom").map((palette) => palette.id))("%s keeps the text pairs at 4.5:1 in light and dark", (id) => {
    for (const mode of modes) check(mode, id, 0);
  });

  it("Egen keeps the text pairs at 4.5:1 at every hue, 0 to 360 in steps of 15, in light and dark", () => {
    for (let hue = 0; hue <= 360; hue += 15) {
      for (const mode of modes) check(mode, "custom", hue);
    }
  });

  it("only the themed tokens are overridden", () => {
    for (const mode of modes) {
      for (const { id } of palettes) {
        for (const name of Object.keys(declarations(mode.blocks, id))) expect(themed).toContain(name);
      }
    }
  });
});
