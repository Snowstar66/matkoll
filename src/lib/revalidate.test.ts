import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string, type: string) => revalidatePath(path, type) }));

const { revalidateFor } = await import("./revalidate");

beforeEach(() => revalidatePath.mockReset());

describe("revalidateFor", () => {
  it("revalidates Hemma, the recipes, with every recipe view, the meal plan and the list after a pantry write", () => {
    revalidateFor("pantry_item");
    expect(revalidatePath.mock.calls).toEqual([
      ["/hemma", "page"],
      ["/recept", "layout"],
      ["/matsedel", "layout"],
      ["/lista", "page"],
    ]);
  });

  it("revalidates everything counted against the pantry after a place is selected, added, renamed or deleted", () => {
    revalidateFor("pantry_site");
    expect(revalidatePath.mock.calls).toEqual([
      ["/hemma", "page"],
      ["/recept", "layout"],
      ["/matsedel", "layout"],
      ["/lista", "page"],
    ]);
  });

  it("revalidates Inköpslista's page when a place is selected, which the sheet Räkna listan mot waits for (Story 8.5)", () => {
    // ListSiteLine closes its sheet on selectPantrySite's answer, trusting that
    // the same response carries the list counted against the new place.
    revalidateFor("pantry_site");
    expect(revalidatePath).toHaveBeenCalledWith("/lista", "page");
  });

  it("revalidates the meal plan, the shopping list and the recipes after a meal plan write", () => {
    revalidateFor("meal_plan_recipe");
    revalidateFor("meal_plan");
    const routes = [
      ["/matsedel", "layout"],
      ["/lista", "page"],
      ["/recept", "layout"],
    ];
    expect(revalidatePath.mock.calls).toEqual([...routes, ...routes]);
  });

  it("revalidates the library, recipe views, meal plan and list after a recipe write, and Inställningar after a site write", () => {
    revalidateFor("recipe");
    revalidateFor("recipe_site");
    expect(revalidatePath.mock.calls).toEqual([
      ["/recept", "layout"],
      ["/matsedel", "layout"],
      ["/lista", "page"],
      ["/installningar", "page"],
    ]);
  });

  it("revalidates the shopping list after a write to anything it is counted from", () => {
    // The catalog's ingredient table has no entry: its names and sections only
    // change through recipe and pantry writes, which revalidate the list.
    for (const table of ["recipe", "pantry_item", "meal_plan", "meal_plan_recipe"] as const) {
      revalidatePath.mockReset();
      revalidateFor(table);
      expect(revalidatePath.mock.calls, table).toContainEqual(["/lista", "page"]);
    }
  });

  it("revalidates only the shopping list after a product choice write", () => {
    revalidateFor("product_choice");
    expect(revalidatePath.mock.calls).toEqual([["/lista", "page"]]);
  });

  it("revalidates Inställningar and the shopping list after a store write", () => {
    revalidateFor("store");
    expect(revalidatePath.mock.calls).toEqual([
      ["/installningar", "page"],
      ["/lista", "page"],
    ]);
  });

  it.each(["shopping_check", "shopping_custom_item"] as const)("revalidates only the shopping list after a write to %s", (table) => {
    revalidateFor(table);
    expect(revalidatePath.mock.calls).toEqual([["/lista", "page"]]);
  });
});
