import { normalizeUnit, type IngredientMatch } from "@/features/catalog";
import type { LineHint, RecipeDraft, RecipeLine } from "./recipe-draft";

// The only mapping from the AI port's answer to a RecipeDraft (AD-10), for
// link, text, photo and AI suggestions alike. Units are read with the
// catalog's normalizeUnit (AD-12); amounts are never converted.

/**
 * What fromAiRecipe reads from `AiRecipe` (src/server/ai/schemas.ts). Declared
 * here because domain code never imports the AI port (AD-1); an AiRecipe fits it.
 */
export type AiRecipeLike = {
  title: string;
  servings: number;
  totalMinutes: number | null;
  ingredients: readonly {
    originalText: string;
    amount: number | null;
    unit: string | null;
    isVague: boolean;
    stepIndexes: readonly number[];
    hint?: LineHint | null;
  }[];
  steps: readonly string[];
};

/** Where the recipe came from. Only a link has a source URL, and only a page can give an image. */
export type RecipeSource =
  | { kind: "text" }
  | { kind: "photo" }
  | { kind: "ai" }
  | { kind: "url"; url: string; imageUrl?: string | null };

function toLine(
  line: AiRecipeLike["ingredients"][number],
  ingredient: IngredientMatch,
  /** The AI's step index → the draft's step index, for the steps that were kept. */
  stepIndex: ReadonlyMap<number, number>,
): RecipeLine {
  const kept = line.stepIndexes.flatMap((index) => {
    const to = stepIndex.get(index);
    return to === undefined ? [] : [to];
  });
  const stepIndexes = [...new Set(kept)].sort((a, b) => a - b);
  const amount = line.amount !== null && Number.isFinite(line.amount) && line.amount > 0 ? line.amount : null;
  const unit = normalizeUnit(line.unit);
  const base = {
    originalText: line.originalText,
    ingredient,
    stepIndexes,
    ...(line.hint
      ? {
          hint: {
            name: line.hint.name,
            section: line.hint.section,
            location: line.hint.location,
            defaultUnit: line.hint.defaultUnit,
          },
        }
      : {}),
  };
  // A vague line, one without an amount, or one with a unit the catalog does not
  // know ("1 bit", "en näve") keeps only its original text.
  if (line.isVague || amount === null || !unit.known) {
    return { ...base, amount: null, unit: null, isVague: true };
  }
  return { ...base, amount, unit: unit.unit, isVague: false };
}

/**
 * The draft for an AI answer. `matches[i]` is the catalog match for
 * `aiRecipe.ingredients[i]` (from matchIngredients). Step indexes that do not
 * point at a step are removed.
 */
export function fromAiRecipe(
  aiRecipe: AiRecipeLike,
  matches: readonly IngredientMatch[],
  source: RecipeSource,
): RecipeDraft {
  if (matches.length !== aiRecipe.ingredients.length) {
    throw new Error("fromAiRecipe needs one match per ingredient line");
  }
  // Empty steps are dropped, and the lines' step indexes follow the steps that are kept.
  const steps: string[] = [];
  const stepIndex = new Map<number, number>();
  aiRecipe.steps.forEach((step, index) => {
    if (!step.trim()) return;
    stepIndex.set(index, steps.length);
    steps.push(step.trim());
  });
  return {
    title: aiRecipe.title.trim(),
    servings: Math.max(1, Math.round(aiRecipe.servings)),
    totalMinutes:
      aiRecipe.totalMinutes !== null && Number.isFinite(aiRecipe.totalMinutes) && aiRecipe.totalMinutes >= 0
        ? Math.round(aiRecipe.totalMinutes)
        : null,
    imageUrl: source.kind === "url" ? (source.imageUrl ?? null) : null,
    sourceKind: source.kind,
    sourceUrl: source.kind === "url" ? source.url : null,
    steps,
    lines: aiRecipe.ingredients.map((line, index) => toLine(line, matches[index], stepIndex)),
  };
}
