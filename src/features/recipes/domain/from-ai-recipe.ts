import { importAmount, unitInNoun, unitOfNoun, type IngredientMatch, type Unit } from "@/features/catalog";
import { draftLimits, type LineHint, type RecipeDraft, type RecipeLine, type RecipeStep } from "./recipe-draft";

// The only mapping from the AI port's answer to a RecipeDraft (AD-10), for
// link, text, photo and AI suggestions alike. Units are read with the
// catalog's importAmount: a catalog unit keeps its amount (AD-12), a foreign
// one ("cups", "näve") is converted once, at import.

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
    /** The ingredient group the line stands under ("Rostad småpotatis"), or null. */
    group?: string | null;
    /** The source marks the line as a staple (•). */
    isStapleMarked?: boolean;
  }[];
  /** A step's text, or its text with its heading ("Rostad småpotatis"), title null for none. */
  steps: readonly (string | { title?: string | null; text: string })[];
};

/**
 * A group name or step heading for the draft: trimmed, cut to `max`
 * characters (whole code points), or null when blank.
 */
export function shortHeading(value: string | null | undefined, max: number): string | null {
  const trimmed = value?.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;
  let cut = "";
  for (const point of trimmed) {
    if (cut.length + point.length > max) break;
    cut += point;
  }
  return cut.trim() || null;
}

/** Where the recipe came from. Only a link has a source URL, and only a page can give an image. */
export type RecipeSource =
  | { kind: "text" }
  | { kind: "photo" }
  | { kind: "ai" }
  | { kind: "url"; url: string; imageUrl?: string | null };

/**
 * The line's unit when the AI read it as a count, but the line writes the
 * unit inside its noun: "2 vitlöksklyftor" and "3 klyftor vitlök" are 2 and 3
 * klyfta, not whole bulbs (catalog.unitInNoun). The prompt asks for this too;
 * this reads it the same way whatever the model answers. A line whose
 * ingredient is named after the unit itself ("brödskiva") keeps its count.
 */
function unitOfCount(
  line: AiRecipeLike["ingredients"][number],
  ingredient: IngredientMatch,
  unit: Unit | null,
): Unit | null {
  if (unit !== null && unit !== "st") return unit;
  const written = unitInNoun(line.originalText);
  if (written === null) return unit;
  const names = [line.hint?.name, ingredient.kind === "new" ? ingredient.proposal.name : undefined];
  return names.some((name) => unitOfNoun(name) === written) ? unit : written;
}

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
  // A unit the catalog lacks ("näve", "cups", "oz") is converted once, here at
  // the import (catalog.importAmount), so the amount is not lost.
  const imported = amount === null ? null : importAmount(amount, line.unit);
  const group = shortHeading(line.group, draftLimits.groupChars);
  const base = {
    originalText: line.originalText,
    ingredient,
    stepIndexes,
    ...(group ? { group } : {}),
    ...(line.isStapleMarked ? { isStapleMarked: true } : {}),
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
  // A vague line, one without an amount, or one with a unit neither the catalog
  // nor the import table knows keeps only its original text.
  if (line.isVague || imported === null) {
    return { ...base, amount: null, unit: null, isVague: true };
  }
  return { ...base, amount: imported.amount, unit: unitOfCount(line, ingredient, imported.unit), isVague: false };
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
  // A step with a heading keeps it; one without stays plain text.
  const steps: RecipeStep[] = [];
  const stepIndex = new Map<number, number>();
  aiRecipe.steps.forEach((step, index) => {
    const text = (typeof step === "string" ? step : step.text).trim();
    if (!text) return;
    const title = typeof step === "string" ? null : shortHeading(step.title, draftLimits.stepTitleChars);
    stepIndex.set(index, steps.length);
    steps.push(title ? { text, title } : text);
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
