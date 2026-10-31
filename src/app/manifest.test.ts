import { describe, expect, it } from "vitest";
import { colorTokens } from "../../tests/design/tokens";
import manifest from "./manifest";

// FR-44, AD-27: the web app manifest that puts Matkoll on the home screen.

describe("manifest", () => {
  it("opens Livskoll full screen at Recept, in Swedish", () => {
    expect(manifest()).toMatchObject({
      id: "/",
      name: "Livskoll",
      short_name: "Livskoll",
      description: "Recept, matsedel, inköpslista och det du har hemma.",
      lang: "sv",
      start_url: "/recept",
      scope: "/",
      display: "standalone",
    });
  });

  it("takes shared links from Android's share menu (Story 1.13)", () => {
    expect(manifest().share_target).toEqual({
      action: "/recept/importera",
      method: "GET",
      params: { url: "url", text: "text" },
    });
  });

  it("offers a shortcut that opens Lägg till egen vara at once (Story 17.9)", () => {
    expect(manifest().shortcuts).toEqual([{ name: "Lägg till vara", short_name: "Lägg till", url: "/lista/lagg-till" }]);
  });

  it("uses light mode's bg from globals.css as both colours", () => {
    const { light } = colorTokens();
    expect(manifest().background_color).toBe(light.bg);
    expect(manifest().theme_color).toBe(light.bg);
  });

  it("lists the generated icons: 192 and 512 px for any use, 512 px maskable", () => {
    expect(manifest().icons).toEqual([
      { src: "/icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ]);
  });
});
