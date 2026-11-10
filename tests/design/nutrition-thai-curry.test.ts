import { describe, expect, it } from "vitest";
import { normalizeIngredientText } from "@/features/catalog";
import { matchAgainst } from "@/features/catalog/domain/match";
import { fromAiRecipe, type AiRecipeLike } from "@/features/recipes/domain/from-ai-recipe";
import { isTrustworthy, recipeNutrition, type IngredientNutrition, type NutritionLine } from "@/features/nutrition";
import { buildTable, resolveName } from "./nutrition-table";

// Regression: koket.se "Röd thaicurry med heta räkor" (4 portioner) could not be counted. The lines are the JSON-LD
// recipeIngredient of the saved page, read the way the import prompt asks the model to read them (ranges: the
// larger number; "3 klyftor vitlök": klyfta; "5 cm": no catalog unit, so no amount; a section heading may come
// back as a line without amount). They go through the real chain: fromAiRecipe (importAmount, unitInNoun),
// matchAgainst, the table's name fallbacks and recipeNutrition with the trust gate of the cards.

type AiLine = AiRecipeLike["ingredients"][number];
const ai = (originalText: string, amount: number | null, unit: string | null, name: string, group: string | null = null): AiLine => ({
  originalText,
  amount,
  unit,
  isVague: amount === null,
  stepIndexes: [],
  group,
  hint: { name, section: "Övrigt", location: "Skafferi", defaultUnit: "g" },
});

const lines = (shrimp: string, lime: string): AiLine[] => [
  ai("3 klyftor vitlök", 3, "st", "vitlök"),
  ai("neutral matolja, till stekning", null, null, "neutral matolja"),
  ai("0,5-1 tsk chiliflakes (eller mer om du vill ha mer hetta)", 1, "tsk", "chiliflakes"),
  ai("500 g jätteräka, skalade (viltfångade, vanliga räkor funkar också)", 500, "g", shrimp),
  ai("0,5 limefrukt", 0.5, null, lime),
  ai("jasminris (till servering)", null, null, "jasminris"),
  ai("Curry", null, null, "curry"),
  ai("5 schalottenlökar", 5, null, "schalottenlök", "Curry"),
  ai("3 klyftor vitlök", 3, "st", "vitlök", "Curry"),
  ai("5 cm färsk ingefära", 5, "cm", "färsk ingefära", "Curry"),
  ai("neutral matolja, till stekning", null, null, "neutral matolja", "Curry"),
  ai("2 msk röd currypasta", 2, "msk", "röd currypasta", "Curry"),
  ai("2 citrongräs", 2, null, "citrongräs", "Curry"),
  ai("1 kruka färsk koriander", 1, "kruka", "koriander", "Curry"),
  ai("1 burk kokosmjölk (à 400 ml)", 1, "burk", "kokosmjölk", "Curry"),
  ai("1 dl vatten", 1, "dl", "vatten", "Curry"),
  ai("2 msk fisksås", 2, "msk", "fisksås", "Curry"),
  ai("0,5 msk strösocker", 0.5, "msk", "strösocker", "Curry"),
  ai("3 limeblad (eller zest från 1 lime)", 3, null, "limeblad", "Curry"),
  ai("0,5-1 limefrukt", 1, null, lime, "Curry"),
  ai("150 g pak choi", 150, "g", "pak choi", "Curry"),
];

// A uuid per catalog name.
const ids = new Map<string, string>();
const idOf = (name: string) => {
  if (!ids.has(name)) ids.set(name, `00000000-0000-4000-8000-${String(ids.size).padStart(12, "0")}`);
  return ids.get(name)!;
};

function run(shrimp: string, lime: string) {
  const table = buildTable();
  const recipe: AiRecipeLike = { title: "Röd thaicurry med heta räkor", servings: 4, totalMinutes: 30, ingredients: lines(shrimp, lime), steps: ["Koka."] };
  // Every name is in the catalog (as a new household would have it), so the match is by the hint's name.
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
  return { draft, result: recipeNutrition(nutritionLines, byId, draft.servings) };
}

describe("Röd thaicurry med heta räkor", () => {
  for (const [shrimp, lime] of [
    ["jätteräka", "limefrukt"],
    ["jätteräkor", "lime"],
    ["räkor", "lime"],
  ]) {
    it(`is counted with the shrimp called "${shrimp}" and the lime "${lime}"`, () => {
      const { draft, result } = run(shrimp, lime);
      // Cloves are klyfta, not whole bulbs; "5 cm" has no catalog unit and is read from the text.
      expect(draft.lines[0]).toMatchObject({ amount: 3, unit: "klyfta" });
      expect(result.uncounted).toEqual([]);
      expect(result.coverage.counted).toBe(result.coverage.total);
      expect(result.coverage.uncountedG).toBe(0);
      expect(isTrustworthy(result.coverage)).toBe(true);
      // Coconut milk (about 960 kcal for the can) dominates, then the shrimp and the rice.
      expect(result.perServing.kcal).toBeGreaterThan(500);
      expect(result.perServing.kcal).toBeLessThan(800);
      expect(result.portionEstimates.map((estimate) => estimate.name)).toContain("jasminris");
    });
  }
});
