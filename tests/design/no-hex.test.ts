import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { globalsCssPath } from "./tokens";

// AD-17: colours come from tokens. globals.css is the only file in src/ with colour
// values; theme-colors.ts repeats --bg as rgb() for <meta name="theme-color">, and
// contrast.test.ts checks that it matches.

const root = fileURLToPath(new URL("../../", import.meta.url));
const src = join(root, "src");
const allowed = new Set([globalsCssPath, join(src, "app/theme-colors.ts")]);
const checkedFile = /\.(ts|tsx|js|jsx|mjs|cjs|css|svg|html|mdx)$/;
// #abc, #abcd, #aabbcc, #aabbccdd, not part of a word or an HTML entity (&#123;).
const hexColor = /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![0-9a-zA-Z_-])/g;
// rgb(), hsl(), oklch() and the other CSS colour functions.
const colorFunction = /(?<![\w-])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/g;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return checkedFile.test(entry.name) ? [path] : [];
  });
}

function colorsIn(text: string): string[] {
  return [...text.matchAll(hexColor), ...text.matchAll(colorFunction)].map((match) => match[0]);
}

describe("colour values", () => {
  it("the patterns find colours and skip look-alikes", () => {
    expect(colorsIn('color: "#3E7C62"; fill="#fff" #ABCD #11223344')).toEqual(["#3E7C62", "#fff", "#ABCD", "#11223344"]);
    expect(colorsIn("rgb(0 0 0) rgba(0,0,0,.4) hsl(1 2% 3%) oklch(0.5 0.1 120) color(display-p3 1 0 0)")).toEqual([
      "rgb(",
      "rgba(",
      "hsl(",
      "oklch(",
      "color(",
    ]);
    expect(colorsIn('href="#innehall" &#123; a#bcd #12345 #main-1 text-color(x) setColor(1) collab(')).toEqual([]);
  });

  it("appear in no file in src/ except globals.css and theme-colors.ts", () => {
    const offenders = files(src)
      .filter((path) => !allowed.has(path))
      .flatMap((path) => colorsIn(readFileSync(path, "utf8")).map((color) => `${relative(root, path)}: ${color}`));
    expect(offenders).toEqual([]);
  });
});
