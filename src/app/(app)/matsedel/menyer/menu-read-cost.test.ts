import { describe, expect, it } from "vitest";
import { menuReadCostSek, menuReadCostText } from "./menu-read-cost";

// What "Menyns sidor" says a reading costs: it grows with the pages, and Läs noggrannare (Sonnet) costs about ten
// to twenty times as much as the standard reading (Haiku).

describe("menuReadCostText", () => {
  it("counts the pages: more pages cost more, and careful costs more than standard", () => {
    const one = menuReadCostSek(1, "standard");
    const six = menuReadCostSek(6, "standard");
    expect(six).toBeGreaterThan(one * 2);
    expect(menuReadCostSek(3, "careful")).toBeGreaterThan(menuReadCostSek(3, "standard") * 10);
  });

  it("says the price for the pages in Swedish, with Läs noggrannare", () => {
    expect(menuReadCostText(1)).toBe("Kostar ca 0,02 kr för 1 sida. Läs noggrannare ca 0,66 kr.");
    expect(menuReadCostText(3)).toMatch(/^Kostar ca 0,0\d kr för 3 sidor\. Läs noggrannare ca 1(,\d)? kr\.$/);
    expect(menuReadCostText(6)).toMatch(/^Kostar ca 0,\d\d kr för 6 sidor\. Läs noggrannare ca [12],\d kr\.$/);
  });
});
