// Hex values live only in globals.css (AD-17). These are --bg in light and dark mode
// as rgb() for the browser's theme-color; tests/design/contrast.test.ts checks that they match.
export const themeColors = {
  light: "rgb(245 247 244)",
  dark: "rgb(18 23 20)",
} as const;
