import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string, type: string) => revalidatePath(path, type) }));

const { revalidateFor } = await import("./revalidate");

beforeEach(() => revalidatePath.mockReset());

describe("revalidateFor", () => {
  it("revalidates Hemma, the recipes, with every recipe view, and the meal plan after a pantry write", () => {
    revalidateFor("pantry_item");
    expect(revalidatePath.mock.calls).toEqual([
      ["/hemma", "page"],
      ["/recept", "layout"],
      ["/matsedel", "layout"],
    ]);
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

  it("revalidates the library and recipe views after a recipe write, and Inställningar after a site write", () => {
    revalidateFor("recipe");
    revalidateFor("recipe_site");
    expect(revalidatePath.mock.calls).toEqual([
      ["/recept", "layout"],
      ["/matsedel", "layout"],
      ["/installningar", "page"],
    ]);
  });
});
