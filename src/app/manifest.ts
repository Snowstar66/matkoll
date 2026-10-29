import type { MetadataRoute } from "next";
import { appDescription, appName, manifestIcons } from "./app-info";
import { rgbToHex, themeColors } from "./theme-colors";

// The web app manifest at /manifest.webmanifest (FR-44, AD-27), so Matkoll can be
// put on the home screen and opens full screen. No service worker, no offline.
// The proxy lets it through without a session, and it holds no user data.
export default function manifest(): MetadataRoute.Manifest {
  // One colour only: light mode's bg, like theme-color's light value.
  const background = rgbToHex(themeColors.light);
  return {
    // A stable identity, so a changed start_url does not make it another app.
    id: "/",
    name: appName,
    short_name: appName,
    description: appDescription,
    lang: "sv",
    start_url: "/recept",
    scope: "/",
    // Story 1.13: Android's share menu offers Matkoll; some apps put the address in text.
    share_target: { action: "/recept/importera", method: "GET", params: { url: "url", text: "text" } },
    display: "standalone",
    background_color: background,
    theme_color: background,
    icons: manifestIcons.map(({ id, side, purpose }) => ({
      src: `/icon/${id}`,
      sizes: `${side}x${side}`,
      type: "image/png",
      purpose,
    })),
  };
}
