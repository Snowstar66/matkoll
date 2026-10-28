// Hex values live only in globals.css (AD-17). These repeat tokens as rgb() for the
// places that cannot read CSS variables: the browser's theme-color, the web app
// manifest and the generated app icons. tests/design/contrast.test.ts checks that
// they match globals.css.

/** --bg in light and dark mode, for <meta name="theme-color">. */
export const themeColors = {
  light: "rgb(245 247 244)",
  dark: "rgb(18 23 20)",
} as const;

/**
 * The app icon's colours (DESIGN.md, `app-icon`): a carrot in accent and sand on
 * light mode's --bg. The icon is the same in dark mode. `sandInk` draws the
 * carrot itself, since sand alone is too light to see against bg.
 */
export const appIconColors = {
  bg: themeColors.light,
  accent: "rgb(62 124 98)",
  sand: "rgb(241 236 226)",
  sandInk: "rgb(110 91 62)",
} as const;

/** "rgb(245 247 244)" as "#F5F7F4", for the manifest, where a hex colour is safest. */
export function rgbToHex(rgb: string): string {
  const match = /^rgb\((\d{1,3}) (\d{1,3}) (\d{1,3})\)$/.exec(rgb);
  if (!match) throw new Error(`Not an rgb() colour: ${rgb}`);
  const channels = match.slice(1).map(Number);
  if (channels.some((channel) => channel > 255)) throw new Error(`Not an rgb() colour: ${rgb}`);
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
