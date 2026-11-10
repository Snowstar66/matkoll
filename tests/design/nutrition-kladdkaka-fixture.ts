import { normalizeIngredientText } from "@/features/catalog";
import { matchAgainst } from "@/features/catalog/domain/match";
import { fromAiRecipe, type AiRecipeLike } from "@/features/recipes/domain/from-ai-recipe";
import { recipeNutrition, type IngredientNutrition, type NutritionLine } from "@/features/nutrition";
import { buildTable, resolveName } from "./nutrition-table";

// The koket.se kladdkaka lines, run through the real chain (shared by the nutrition tests).

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

export function run(servings: number, sugar: string, brown: string, vanilla: string) {
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

