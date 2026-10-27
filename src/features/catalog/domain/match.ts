import { z } from "zod";
import { locationSchema, toLocation } from "./locations";
import { catalogName } from "./name";
import { cleanIngredientText, normalizeIngredientText } from "./normalize";
import { sectionSchema, toSection } from "./sections";
import { normalizeUnit, unitSchema } from "./units";

// Matching text against the catalog (AD-6). Matching never writes. Order: the
// line's normalised text against ingredient names, then synonyms; then the AI
// hint's normalised name against names, then synonyms (confidence "hint", less
// certain, so the preview asks Pontus to check it); otherwise a new ingredient
// built from the hint. A line with neither usable text nor hint is "unmatched".
// commitIngredients saves the choices.

/** The AI's free-text suggestion for an ingredient (`AiRecipe.ingredients[].hint`). */
export type IngredientHint = {
  name: string;
  section: string;
  location: string;
  defaultUnit: string;
};

export type MatchItem = { text: string; hint?: IngredientHint | null };

/** A proposed catalog ingredient. `name` is for display, in its original casing with an uppercase first letter (catalogName). */
export const ingredientProposalSchema = z.object({
  name: z.string().trim().min(1),
  section: sectionSchema,
  location: locationSchema,
  defaultUnit: unitSchema.nullable(),
});
export type IngredientProposal = z.infer<typeof ingredientProposalSchema>;

/** What the catalog suggests for one of its ingredients: where it is kept and its usual unit. */
export type IngredientDefaults = Pick<IngredientProposal, "section" | "location" | "defaultUnit">;

/** An ingredient's name and section, as the pantry's list shows them (Story 11.2): the view works out its category (AD-12). */
export type IngredientSummary = Pick<IngredientProposal, "name" | "section">;

export const ingredientMatchSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("match"),
    ingredientId: z.uuid(),
    /** exact: the text is the name; synonym: the text is a synonym; hint: the AI's name for it matched. */
    confidence: z.enum(["exact", "synonym", "hint"]),
  }),
  z.object({ kind: z.literal("new"), proposal: ingredientProposalSchema }),
  /** Nothing to match or propose: no usable text and no hint. Commits to no ingredient (`null`). */
  z.object({ kind: z.literal("unmatched") }),
]);
export type IngredientMatch = z.infer<typeof ingredientMatchSchema>;

/** Pontus picked a catalog ingredient other than the one suggested. */
export const chosenIngredientSchema = z.object({ kind: z.literal("chosen"), ingredientId: z.uuid() });
export type ChosenIngredient = z.infer<typeof chosenIngredientSchema>;

/**
 * What a saving action passes to commitIngredients for one line: the original
 * text and the match it keeps, or the ingredient Pontus chose instead.
 */
export const ingredientChoiceSchema = z.object({
  text: z.string(),
  ingredient: z.union([ingredientMatchSchema, chosenIngredientSchema]),
});
export type IngredientChoice = z.infer<typeof ingredientChoiceSchema>;

/** The catalog rows that matter for a set of normalised texts. */
export type CatalogSnapshot = {
  /** normalized_name → ingredient id */
  ingredients: ReadonlyMap<string, string>;
  /** synonym normalized → ingredient id */
  synonyms: ReadonlyMap<string, string>;
};

/**
 * A new ingredient from the AI's hint, or from the text alone without one, or
 * `null` when neither gives a name. The name keeps its casing, with an
 * uppercase first letter as the catalog stores it ("gul lök" → "Gul lök",
 * Story 10.4); only the stored normalized_name is normalised.
 */
export function proposalFrom(item: MatchItem): IngredientProposal | null {
  const hint = item.hint;
  const cleaned = cleanIngredientText(hint?.name) || cleanIngredientText(item.text);
  if (!cleaned) return null;
  const name = catalogName(cleaned);
  const section = toSection(hint?.section);
  return {
    name,
    section,
    location: toLocation(hint?.location, section),
    defaultUnit: normalizeUnit(hint?.defaultUnit).unit,
  };
}

/** The normalised texts matching looks up for the items: each line's text and its hint's name. */
export function lookupKeys(items: readonly MatchItem[]): string[] {
  return items.flatMap((item) => [normalizeIngredientText(item.text), normalizeIngredientText(item.hint?.name)]);
}

function find(key: string, snapshot: CatalogSnapshot) {
  if (!key) return null;
  const exact = snapshot.ingredients.get(key);
  if (exact) return { ingredientId: exact, how: "exact" as const };
  const synonym = snapshot.synonyms.get(key);
  return synonym ? { ingredientId: synonym, how: "synonym" as const } : null;
}

/**
 * One match per item, in order: text exact, text synonym, hint name exact,
 * hint name synonym, new ingredient, unmatched. The snapshot must hold the
 * rows for lookupKeys(items).
 */
export function matchAgainst(items: readonly MatchItem[], snapshot: CatalogSnapshot): IngredientMatch[] {
  return items.map((item): IngredientMatch => {
    const byText = find(normalizeIngredientText(item.text), snapshot);
    if (byText) return { kind: "match", ingredientId: byText.ingredientId, confidence: byText.how };
    const byHint = find(normalizeIngredientText(item.hint?.name), snapshot);
    if (byHint) return { kind: "match", ingredientId: byHint.ingredientId, confidence: "hint" };
    const proposal = proposalFrom(item);
    return proposal ? { kind: "new", proposal } : { kind: "unmatched" };
  });
}
