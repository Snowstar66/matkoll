import { describe, expect, expectTypeOf, it } from "vitest";
import { type CategoryName, categoryIcons } from "@/components/category-header";
import { CATEGORIES, type Category } from "@/features/catalog";

// Story 11.1: the icon map in category-header.tsx is keyed by the display
// categories, but a shared component never imports a feature module (AD-1).
// This test holds the two lists together, in type and order.

describe("category icons", () => {
  it("has one icon per category, in the store's order", () => {
    expect(Object.keys(categoryIcons)).toEqual([...CATEGORIES]);
    expectTypeOf<CategoryName>().toEqualTypeOf<Category>();
  });

  it("has no tile any more (ikoner.html B): only the icon", () => {
    for (const entry of Object.values(categoryIcons)) expect(Object.keys(entry)).toEqual(["icon"]);
  });

  it("gives every category an emoji of its own, and Skafferi and Såser & smaksättare different ones", () => {
    const icons = Object.values(categoryIcons).map(({ icon }) => icon);
    for (const icon of icons) expect(icon).toMatch(/^\p{Extended_Pictographic}\uFE0F?$/u);
    expect(new Set(icons).size).toBe(icons.length);
    expect(categoryIcons.Skafferi.icon).not.toBe(categoryIcons["Såser & smaksättare"].icon);
    expect(categoryIcons.Frys.icon).toBe("\u2744\uFE0F");
    expect(categoryIcons["Övrigt"].icon).toBe("\u{1F6CD}\uFE0F");
  });
});
