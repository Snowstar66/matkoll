import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { motifScale } from "@/app/app-info";
import { houseColors } from "@/app/theme-colors";
import { HouseIcon } from "./house-icon";

// Story 18.20: the app icon is a cream house with a green check mark.

describe("HouseIcon", () => {
  it("draws a cream house and a check mark on the accent green, and no jar", () => {
    const svg = renderToStaticMarkup(<HouseIcon />);
    expect(svg).toContain(`fill="${houseColors.cream}"`);
    expect(svg).toContain("M196 300l44 44 84-96");
    expect(svg).not.toContain("M150 196");
  });

  it("rounds the corners only when asked", () => {
    expect(renderToStaticMarkup(<HouseIcon rounded />)).toContain('rx="112"');
    expect(renderToStaticMarkup(<HouseIcon rounded={false} />)).toContain('rx="0"');
  });

  it("keeps the maskable icon's glyph inside the central 80 % (a circle of radius 0.4 of the side)", () => {
    // The house's farthest corner from the centre, scaled towards the centre.
    const corner = Math.hypot(106 - 256, 416 - 256) * motifScale.maskable;
    expect(corner).toBeLessThanOrEqual(0.4 * 512);
  });
});
