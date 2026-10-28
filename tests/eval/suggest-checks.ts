import type { AiRecipe } from "@/server/ai/schemas";
import type { SuggestDishesInput } from "@/server/ai/service";
import { normalize, type Check } from "./compare";

// Checks a suggestDishes answer against suggest-dishes.expected.json and the
// pantry it was given. Used by `pnpm eval:ai` and by the mock's tests, which
// prove that the fixture answer meets its own expectations.

export type SuggestExpected = {
  /** How many suggestions the answer has. */
  suggestions: number;
  /** Lines per suggestion, at least, whose hint.name (normalized) is a pantry item's name. */
  minPantryLines: number;
};

export function checkSuggestions(
  recipes: readonly AiRecipe[],
  input: SuggestDishesInput,
  expected: SuggestExpected,
): Check[] {
  const titles = recipes.map((recipe) => normalize(recipe.title));
  const pantry = new Set(input.pantry.map((item) => normalize(item.name)));
  const avoided = new Set(input.avoidTitles.map(normalize));
  const checks: Check[] = [
    {
      name: "antal förslag",
      ok: recipes.length === expected.suggestions,
      expected: String(expected.suggestions),
      actual: String(recipes.length),
    },
    {
      name: "olika titlar",
      ok: new Set(titles).size === titles.length,
      expected: "alla olika",
      actual: recipes.map((recipe) => recipe.title).join(" / "),
    },
    {
      name: "inga titlar ur avoidTitles",
      ok: titles.every((title) => !avoided.has(title)),
      expected: input.avoidTitles.join(" / ") || "–",
      actual: recipes.map((recipe) => recipe.title).join(" / "),
    },
  ];
  for (const recipe of recipes) {
    const fromPantry = recipe.ingredients.filter((line) => pantry.has(normalize(line.hint.name)));
    const missing = recipe.ingredients.filter((line) => !pantry.has(normalize(line.hint.name)));
    checks.push({
      name: `${recipe.title}: rader ur lagret`,
      ok: fromPantry.length >= expected.minPantryLines,
      expected: `minst ${expected.minPantryLines}`,
      actual: `${fromPantry.length} av ${recipe.ingredients.length}${
        missing.length > 0 ? ` (utöver lagret: ${missing.map((line) => line.hint.name).join(", ")})` : ""
      }`,
    });
  }
  return checks;
}

/** Story 12.3: what a model's answer text looks like, beside the checks. */
export type AnswerShape = {
  /** The compact answer (lines with `name` and no `hint`), not the full AiRecipe. */
  compact: boolean;
  /** Indented or on several lines, which costs tokens. */
  indented: boolean;
  lines: number;
  /** Lines with a catalog entry in `new`. */
  linesWithNew: number;
  /** Names of lines without `new` that are not a pantry item's name: a new catalog item under Övrigt. */
  unmatchedWithoutNew: string[];
};

type RawLine = { name?: unknown; hint?: unknown; new?: unknown };

/** The shape of an answer text, or null when it is not JSON with suggestions. Reads only; never checks the answer. */
export function answerShape(content: string | undefined, input: SuggestDishesInput): AnswerShape | null {
  if (!content) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  const suggestions = (parsed as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(suggestions)) return null;
  const lines = suggestions.flatMap((dish: { ingredients?: unknown }) =>
    Array.isArray(dish?.ingredients) ? (dish.ingredients as RawLine[]) : [],
  );
  const compact = lines.length > 0 && lines.every((line) => typeof line === "object" && line !== null && "name" in line && !("hint" in line));
  const pantry = new Set(input.pantry.map((item) => normalize(item.name)));
  const withoutNew = compact ? lines.filter((line) => line.new === null || line.new === undefined) : [];
  return {
    compact,
    indented: /\n/.test(content.trim()),
    lines: lines.length,
    linesWithNew: compact ? lines.length - withoutNew.length : 0,
    unmatchedWithoutNew: withoutNew.map((line) => String(line.name)).filter((name) => !pantry.has(normalize(name))),
  };
}
