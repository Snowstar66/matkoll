import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Reads the colour tokens out of src/app/globals.css, the single source (AD-17).

export const globalsCssPath = fileURLToPath(new URL("../../src/app/globals.css", import.meta.url));

/** The body of the first `{ … }` block starting at `from`, with nested blocks included. */
function blockBody(css: string, from: number, name: string): string {
  if (from < 0) throw new Error(`globals.css: no ${name} block found`);
  const open = css.indexOf("{", from);
  if (open < 0) throw new Error(`globals.css: ${name} has no "{"`);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`globals.css: unbalanced braces in ${name}`);
}

function hexTokens(body: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    tokens[match[1]] = match[2].toUpperCase();
  }
  return tokens;
}

export function colorTokens(css = readFileSync(globalsCssPath, "utf8")) {
  const light = hexTokens(blockBody(css, css.search(/^:root\s*\{/m), ":root"));
  const darkMedia = blockBody(css, css.search(/@media\s*\(prefers-color-scheme:\s*dark\)/), "dark @media");
  const dark = hexTokens(blockBody(darkMedia, darkMedia.search(/:root\s*\{/), ":root inside the dark @media"));
  return { light, dark };
}

/** The px lengths in `:root` (light; sizes do not change in dark mode), e.g. `{ "tile-size": 30 }`. */
export function lengthTokens(css = readFileSync(globalsCssPath, "utf8")): Record<string, number> {
  const body = blockBody(css, css.search(/^:root\s*\{/m), ":root");
  const tokens: Record<string, number> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+)\s*:\s*(\d+(?:\.\d+)?)px\s*;/g)) {
    tokens[match[1]] = Number(match[2]);
  }
  return tokens;
}

/** The value of a custom property in `:root`, as written, or undefined. */
export function rootToken(name: string, css = readFileSync(globalsCssPath, "utf8")): string | undefined {
  const body = blockBody(css, css.search(/^:root\s*\{/m), ":root");
  return new RegExp(`--${name}\\s*:\\s*([^;]+);`).exec(body)?.[1].trim();
}
