import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (path: string, type: string) => revalidatePath(path, type) }));

const { revalidateFor } = await import("./revalidate");

beforeEach(() => revalidatePath.mockReset());

describe("revalidateFor", () => {
  it("revalidates Hemma and the recipes, with every recipe view, after a pantry write", () => {
    revalidateFor("pantry_item");
    expect(revalidatePath.mock.calls).toEqual([
      ["/hemma", "page"],
      ["/recept", "layout"],
    ]);
  });

  it("revalidates the library and recipe views after a recipe write, and Inställningar after a site write", () => {
    revalidateFor("recipe");
    revalidateFor("recipe_site");
    expect(revalidatePath.mock.calls).toEqual([
      ["/recept", "layout"],
      ["/installningar", "page"],
    ]);
  });
});
