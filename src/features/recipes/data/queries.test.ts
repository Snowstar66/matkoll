import { afterEach, describe, expect, it, vi } from "vitest";
import type { RecipesDb } from "./client";
import { listRecipes, searchRecipesIn } from "./queries";

// The library's row parser with a stand-in for Supabase: every table answers
// its rows to any chain of filters that ends in range().

function fakeDb(tables: Record<string, unknown[]>): RecipesDb {
  return {
    from: (table: string) => {
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "ilike", "in", "order"]) builder[method] = () => builder;
      builder.range = async () => ({ data: tables[table] ?? [], error: null });
      return builder;
    },
  } as unknown as RecipesDb;
}

const recipe = {
  id: "recipe-1",
  title: "Pannkakor",
  image_url: null,
  total_minutes: 30,
  original_servings: 4,
  is_favorite: false,
  created_at: "2026-10-26T10:00:00Z",
};
const good = { id: "line-1", ingredient_id: "agg", amount: 3, unit: "st", is_vague: false };
const bad = { id: "line-2", ingredient_id: "mjolk", amount: 6, unit: "kopp", is_vague: false };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a line whose unit does not parse", () => {
  it("is left out of the status in the library, logged, instead of failing the list", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = await listRecipes(fakeDb({ recipe: [{ ...recipe, lines: [good, bad] }] }));
    expect(rows[0].lines).toEqual([
      { id: "line-1", ingredientId: "agg", amount: 3, unit: "st", isVague: false },
      { id: "line-2", ingredientId: null, amount: 6, unit: null, isVague: false },
    ]);
    expect(log).toHaveBeenCalledWith("recipe_line_invalid", { reason: "unit", lineId: "line-2" });
  });

  it("is left out of the status in a search too", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const rows = await searchRecipesIn(
      fakeDb({ recipe: [recipe], recipe_ingredient: [{ recipe_id: "recipe-1", ...good }, { recipe_id: "recipe-1", ...bad }] }),
      { text: "pannkakor", ingredientIds: [] },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].lines.map(({ ingredientId }) => ingredientId)).toEqual(["agg", null]);
  });
});
