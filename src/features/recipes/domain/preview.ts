import { cleanIngredientText, normalizeUnit, parseQuantity, toLocation, toSection } from "@/features/catalog";
import type { Unit } from "@/features/catalog";
import type { RecipeLine } from "./recipe-draft";

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
