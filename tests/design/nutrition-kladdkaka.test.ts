import { describe, expect, it } from "vitest";
import { normalizeIngredientText } from "@/features/catalog";
import { matchAgainst } from "@/features/catalog/domain/match";
import { fromAiRecipe, type AiRecipeLike } from "@/features/recipes/domain/from-ai-recipe";
import { isTrustworthy, recipeNutrition, type IngredientNutrition, type NutritionLine } from "@/features/nutrition";
import { buildTable, resolveName } from "./nutrition-table";

// Regression: koket.se "Godaste och härligaste kladdkakan på klassiskt vis" (recipeYield "10-12 bitar") showed no
// kcal. The lines are the JSON-LD recipeIngredient of the saved page, read as the import prompt asks (servings:
// the lowest of a range). They go through the real chain: fromAiRecipe, matchAgainst, the table's name
// fallbacks, recipeNutrition and the trust gate of the card.

type AiLine = AiRecipeLike["ingredients"][number];
const ai = (originalText: string, amount: number | null, unit: string | null, name: string): AiLine => ({
  originalText,
  amount,
  unit,
  isVague: amount === null,
  stepIndexes: [],
  group: null,
  hint: { name, section: "Övrigt", location: "Skafferi", defaultUnit: "g" },
});

const lines = (sugar: string, brown: string, vanilla: string): AiLine[] => [
  ai("225 g smör", 225, "g", "smör"),
  ai("3,5 dl strösocker", 3.5, "dl", sugar),
  ai("2,25 dl brunt farinsocker", 2.25, "dl", brown),
  ai("1 msk vaniljsocker", 1, "msk", vanilla),
  ai("4 ägg (stora)", 4, null, "ägg"),
  ai("3,5 dl vetemjöl", 3.5, "dl", "vetemjöl"),
  ai("1 dl kakao", 1, "dl", "kakao"),
  ai("1 krm salt", 1, "krm", "salt"),
];

const ids = new Map<string, string>();
const idOf = (name: string) => {
  if (!ids.has(name)) ids.set(name, `00000000-0000-4000-8000-${String(ids.size).padStart(12, "0")}`);
  return ids.get(name)!;
};

function run(servings: number, sugar: string, brown: string, vanilla: string) {
  const table = buildTable();
  const recipe: AiRecipeLike = { title: "Kladdkaka", servings, totalMinutes: 45, ingredients: lines(sugar, brown, vanilla), steps: ["Grädda."] };
  const items = recipe.ingredients.map((line) => ({ text: line.originalText, hint: line.hint }));
  const snapshot = { ingredients: new Map(items.map((item) => [normalizeIngredientText(item.hint!.name), idOf(item.hint!.name)])), synonyms: new Map<string, string>() };
  const draft = fromAiRecipe(recipe, matchAgainst(items, snapshot), { kind: "text" });
  const byId: Record<string, IngredientNutrition> = {};
  const nutritionLines = draft.lines.map((line, index): NutritionLine => {
    const name = recipe.ingredients[index].hint!.name;
    const row = resolveName(table, name);
    if (row) byId[idOf(name)] = row;
    return { amount: line.amount, unit: line.unit, isVague: line.isVague, ingredientId: idOf(name), originalText: line.originalText, ingredientName: name };
  });
  return { draft, result: recipeNutrition(nutritionLines, byId, draft.servings), byId };
}

describe("Godaste och härligaste kladdkakan", () => {
  for (const [sugar, brown, vanilla] of [
    ["strösocker", "farinsocker", "vaniljsocker"],
    ["strösocker", "brunt farinsocker", "vaniljsocker"],
    ["socker", "brun farinsocker", "vaniljsocker"],
  ]) {
    for (const servings of [10, 12]) {
      it(`is counted per bit at ${servings} bitar (${brown})`, () => {
        const { result } = run(servings, sugar, brown, vanilla);
        if (process.env.DUMP) console.log(JSON.stringify(result, null, 1));
        expect(result.uncounted).toEqual([]);
        expect(result.coverage.counted).toBe(result.coverage.total);
        expect(isTrustworthy(result.coverage)).toBe(true);
        // Butter, sugar, flour and eggs: about 4300 kcal, with cocoa and the rest about 4900.
        expect(result.perServing.kcal * servings).toBeGreaterThan(3800);
        expect(result.perServing.kcal * servings).toBeLessThan(5200);
        expect(result.perServing.kcal).toBeGreaterThan(350);
        expect(result.perServing.kcal).toBeLessThan(500);
      });
    }
  }
});
