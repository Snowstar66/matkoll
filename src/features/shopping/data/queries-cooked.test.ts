import { describe, expect, it } from "vitest";
import { loadShoppingList, type ShoppingSources } from "./queries";

// A dish marked cooked (Story 13.4) adds nothing to the list.

const recipeLine = (id: string, ingredientId: string) => ({
  id,
  ingredientId,
  amount: 2,
  unit: "dl" as const,
  isVague: false,
  originalText: "2 dl grädde",
});

function sources(cookedAt: string | null): ShoppingSources {
  return {
    currentPlan: async () => ({
      id: "plan",
      name: "Vecka 44",
      recipes: [{ id: "dish", recipeId: "recipe", recipeTitle: "Pannkakor", servings: 4, position: 0, cookedAt }],
    }),
    recipesByIds: async () => [{ id: "recipe", originalServings: 4, lines: [recipeLine("l1", "cream")] }],
    pantry: async () => new Map(),
    ingredientNames: async () => ({ cream: "Grädde" }),
    ingredientDefaults: async () => ({ cream: { section: "Mejeri" } }),
    checks: async () => [],
    customItems: async () => [],
    overrides: async () => [],
  };
}

describe("loadShoppingList and cooked dishes", () => {
  it("counts a dish that is not cooked", async () => {
    const list = await loadShoppingList(sources(null));
    expect(list.lines.map((line) => line.label)).toEqual(["Grädde"]);
    expect(list.plan?.dishCount).toBe(1);
  });

  it("leaves a cooked dish out", async () => {
    const list = await loadShoppingList(sources("2026-10-29T12:00:00Z"));
    expect(list.lines).toEqual([]);
    expect(list.plan).toMatchObject({ dishCount: 0, skippedCount: 0 });
  });
});
