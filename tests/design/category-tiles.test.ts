import { describe, expect, expectTypeOf, it } from "vitest";
import { type CategoryName, categoryTiles } from "@/components/category-header";
import { CATEGORIES, type Category } from "@/features/catalog";

// Story 11.1: the tile map in category-header.tsx is keyed by the display
// categories, but a shared component never imports a feature module (AD-1).
// This test holds the two lists together, in type and order.

describe("category tiles", () => {
  it("has one tile per category, in the store's order", () => {
    expect(Object.keys(categoryTiles)).toEqual([...CATEGORIES]);
    expectTypeOf<CategoryName>().toEqualTypeOf<Category>();
  });

  it("uses the tile tokens from DESIGN.md (category-tile)", () => {
    expect(Object.fromEntries(Object.entries(categoryTiles).map(([name, { tile }]) => [name, tile]))).toEqual({
      "Frukt & grönt": "bg-mint",
      Bröd: "bg-sand",
      "Mejeri & ägg": "bg-sky",
      "Kött, fisk & chark": "bg-tile-clay",
      Frys: "bg-sky",
      Skafferi: "bg-sand",
      "Såser & smaksättare": "bg-sand",
      Dryck: "bg-tile-lilac",
      Övrigt: "bg-border",
    });
  });

  it("gives every category an emoji of its own, and Skafferi and Såser & smaksättare different ones", () => {
    const icons = Object.values(categoryTiles).map(({ icon }) => icon);
    for (const icon of icons) expect(icon).toMatch(/^\p{Extended_Pictographic}\uFE0F?$/u);
    expect(new Set(icons).size).toBe(icons.length);
    expect(categoryTiles.Skafferi.icon).not.toBe(categoryTiles["Såser & smaksättare"].icon);
    expect(categoryTiles.Frys.icon).toBe("\u2744\uFE0F");
    expect(categoryTiles["Övrigt"].icon).toBe("\u{1F6CD}\uFE0F");
  });
});
