import { describe, expect, it } from "vitest";
import { maxOwnRecipes, rankOwnRecipes, type OwnRecipe } from "./own-recipes";

const offers = [
  { label: "Kycklingfilé", name: "Kycklingfilé", ingredientId: "chicken", savingPercent: 30 },
  { label: "Gul lök", name: "Gul lök", ingredientId: null, savingPercent: null },
  { label: "Grädde", name: "Grädde", ingredientId: "cream", savingPercent: 10 },
];

function recipe(id: string, lines: [string, string | null, boolean?][], extra: Partial<OwnRecipe> = {}): OwnRecipe {
  return {
    id,
    title: id,
    isFavorite: false,
    imageUrl: null,
    totalMinutes: null,
    servings: 4,
    lines: lines.map(([name, ingredientId, atHome = false]) => ({ name, ingredientId, atHome })),
    ...extra,
  };
}

describe("rankOwnRecipes", () => {
  it("leaves out recipes that use no offer", () => {
    expect(rankOwnRecipes(offers, [recipe("a", [["Ris", "rice"]])])).toEqual([]);
  });

  it("matches by ingredient id and by normalised name", () => {
    const [match] = rankOwnRecipes(offers, [recipe("a", [["kyckling", "chicken"], ["gul  lök", null]])]);
    expect(match.onOffer).toEqual(["Kycklingfilé", "Gul lök"]);
  });

  it("puts more offers first", () => {
    const ranked = rankOwnRecipes(offers, [
      recipe("one", [["Kyckling", "chicken"]]),
      recipe("two", [["Kyckling", "chicken"], ["Grädde", "cream"]]),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["two", "one"]);
  });

  it("puts a favourite before an equal recipe, and fewer things to buy before more", () => {
    const ranked = rankOwnRecipes(offers, [
      recipe("plain", [["Kyckling", "chicken"]]),
      recipe("heart", [["Kyckling", "chicken"]], { isFavorite: true }),
    ]);
    expect(ranked.map((r) => r.id)).toEqual(["heart", "plain"]);
    const fewer = rankOwnRecipes(offers, [
      recipe("many", [["Kyckling", "chicken"], ["Broccoli", "b"], ["Ris", "r"]]),
      recipe("few", [["Kyckling", "chicken"], ["Ris", "r", true]]),
    ]);
    expect(fewer.map((r) => r.id)).toEqual(["few", "many"]);
    expect(fewer[0]).toMatchObject({ have: 1, total: 2, toBuy: [] });
  });

  it("lets a favourite with one offer pass a plain recipe with one offer and more to buy", () => {
    const ranked = rankOwnRecipes(offers, [
      recipe("plain", [["Kyckling", "chicken"], ["A", "a"], ["B", "b"]]),
      recipe("heart", [["Kyckling", "chicken"], ["A", "a"], ["B", "b"]], { isFavorite: true }),
    ]);
    expect(ranked[0].id).toBe("heart");
  });

  it("is stable on ties and limited to five", () => {
    const many = ["f", "e", "d", "c", "b", "a"].map((id) => recipe(id, [["Kyckling", "chicken"]]));
    const ranked = rankOwnRecipes(offers, many);
    expect(ranked).toHaveLength(maxOwnRecipes);
    expect(ranked.map((r) => r.id)).toEqual(["a", "b", "c", "d", "e"]);
  });
});
