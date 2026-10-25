import { cleanIngredientText, normalizeUnit, parseQuantity, toLocation, toSection } from "@/features/catalog";
import type { Unit } from "@/features/catalog";
import type { PendingFieldText, RecipeDraft, RecipeLine, RecipeStep } from "./recipe-draft";

// Edits Pontus makes in the preview (FR-6). Pure, so the preview and the
// recipe form of Story 1.11 change a draft the same way.

/** The amount in what Pontus typed: a number, `null` for an empty field, or `undefined` when it is not a number. */
export function parseAmountInput(text: string): number | null | undefined {
  if (!text.trim()) return null;
  return parseQuantity(text) ?? undefined;
}

/** Minutes in what Pontus typed: a whole number ≥ 0, `null` for an empty field, or `undefined` otherwise. */
export function parseMinutesInput(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (!trimmed) return null;
  return /^\d{1,4}$/.test(trimmed) ? Number(trimmed) : undefined;
}

/** A new amount. An amount makes a vague line exact; without one the line is vague and has no unit. */
export function withAmount(line: RecipeLine, amount: number | null): RecipeLine {
  if (amount === null) return { ...line, amount: null, unit: null, isVague: true };
  return { ...line, amount, isVague: false };
}

/** A new unit. A vague line has no unit, so it is left unchanged. */
export function withUnit(line: RecipeLine, unit: Unit | null): RecipeLine {
  return line.isVague ? line : { ...line, unit };
}

/** Pontus chose a catalog ingredient for the line. */
export function withChosenIngredient(line: RecipeLine, ingredientId: string): RecipeLine {
  return { ...line, ingredient: { kind: "chosen", ingredientId } };
}

/**
 * The line gets a new catalog ingredient named `name` (nothing is created until
 * the recipe is saved). A line that already proposed one keeps its section,
 * location and unit; otherwise they come from the AI's hint, read the way the
 * catalog reads it (unknown section → Övrigt).
 */
export function withNewIngredient(line: RecipeLine, name: string): RecipeLine {
  const previous = line.ingredient.kind === "new" ? line.ingredient.proposal : null;
  const section = previous?.section ?? toSection(line.hint?.section);
  return {
    ...line,
    ingredient: {
      kind: "new",
      proposal: {
        name: name.trim(),
        section,
        location: previous?.location ?? toLocation(line.hint?.location, section),
        defaultUnit: previous ? previous.defaultUnit : normalizeUnit(line.hint?.defaultUnit).unit,
      },
    },
  };
}

/** Some field holds typed text that has not become a value. */
export function hasPending({ totalMinutes, amounts }: PendingFieldText): boolean {
  return totalMinutes !== undefined || Object.keys(amounts ?? {}).length > 0;
}

/** Pontus has changed the draft since `initial`, or typed text that has not become a value yet. */
export function isDraftDirty(draft: RecipeDraft, initial: RecipeDraft, pending: PendingFieldText): boolean {
  return hasPending(pending) || JSON.stringify(draft) !== JSON.stringify(initial);
}

/** Whether the form shows an error under the field at `path`; others need a notice of their own. */
export function isShownField(path: string): boolean {
  return path === "title" || path === "totalMinutes" || /^steps\.\d+$/.test(path) || /^lines\.\d+\.amount$/.test(path);
}

/** The line at `index` is removed. */
export function withoutLine(draft: RecipeDraft, index: number): RecipeDraft {
  return { ...draft, lines: draft.lines.filter((_, i) => i !== index) };
}

/** Typed amounts by line index, after the line at `index` is removed: later lines move up one. */
export function withoutPendingAmount(pending: PendingFieldText, index: number): PendingFieldText {
  if (!pending.amounts) return pending;
  const amounts: Record<number, string> = {};
  for (const [key, text] of Object.entries(pending.amounts)) {
    const at = Number(key);
    if (at < index) amounts[at] = text;
    else if (at > index) amounts[at - 1] = text;
  }
  return { ...pending, amounts };
}

/** A new, empty step at the end. */
export function withNewStep(draft: RecipeDraft): RecipeDraft {
  return { ...draft, steps: [...draft.steps, ""] };
}

/** New text for a step; a saved step keeps its id. */
export function withStepText(step: RecipeStep, text: string): RecipeStep {
  return typeof step === "string" ? text : { ...step, text };
}

/**
 * The step at `index` is removed. The lines no longer point at it, and their
 * later steps move up one, so every line keeps the steps it had.
 */
export function withoutStep(draft: RecipeDraft, index: number): RecipeDraft {
  return {
    ...draft,
    steps: draft.steps.filter((_, i) => i !== index),
    lines: draft.lines.map((line) => ({
      ...line,
      stepIndexes: line.stepIndexes.filter((at) => at !== index).map((at) => (at > index ? at - 1 : at)),
    })),
  };
}

/** The catalog match is uncertain: the AI's name for it matched, not the line's text. */
export function needsCheck(line: RecipeLine): boolean {
  return line.ingredient.kind === "match" && line.ingredient.confidence === "hint";
}

/** The name of the line's catalog ingredient, given the names of matched and chosen ones by id. */
export function ingredientLabel(line: RecipeLine, names: Readonly<Record<string, string>>): string {
  const { ingredient } = line;
  switch (ingredient.kind) {
    case "match":
    case "chosen":
      return names[ingredient.ingredientId] ?? (cleanIngredientText(line.originalText) || line.originalText);
    case "new":
      return ingredient.proposal.name;
    case "unmatched":
      return "Ingen ingrediens";
  }
}
