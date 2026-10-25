import { z } from "zod";
import { chosenIngredientSchema, ingredientMatchSchema, unitSchema } from "@/features/catalog";

// The one format for a parsed recipe (AD-10). Link, text, photo and AI
// suggestions all become a RecipeDraft through fromAiRecipe; the preview edits
// it, and saveRecipe/updateRecipe (Story 1.7) are the only ways it is written.

export const SOURCE_KINDS = ["url", "text", "photo", "ai"] as const;
export const sourceKindSchema = z.enum(SOURCE_KINDS);
export type SourceKind = z.infer<typeof sourceKindSchema>;

/**
 * Size limits of a draft, the same as the checks in the recipes migrations and
 * in save_recipe (tests/design/recipe-checks.test.ts).
 */
export const draftLimits = {
  titleChars: 200,
  stepChars: 2000,
  originalTextChars: 300,
  urlChars: 2048,
  steps: 100,
  lines: 200,
} as const;

const webUrl = () => z.url({ protocol: /^https?$/ }).max(draftLimits.urlChars);

/** The catalog ingredient of a line: the catalog's match, or one Pontus chose instead. */
export const lineIngredientSchema = z.union([ingredientMatchSchema, chosenIngredientSchema]);
export type LineIngredient = z.infer<typeof lineIngredientSchema>;

/**
 * The AI's suggestion for the line's catalog ingredient, as free text. Kept so
 * that a new ingredient Pontus names gets the AI's section, location and unit.
 */
export const lineHintSchema = z.object({
  name: z.string(),
  section: z.string(),
  location: z.string(),
  defaultUnit: z.string(),
});
export type LineHint = z.infer<typeof lineHintSchema>;

export const recipeLineSchema = z
  .object({
    /** The line as written in the recipe; shown for a vague line. */
    originalText: z.string().trim().min(1).max(draftLimits.originalTextChars),
    amount: z.number().positive().nullable(),
    unit: unitSchema.nullable(),
    /**
     * No amount as a number ("salt efter smak"). A line is vague exactly when it
     * has no amount, and then it has no unit either.
     */
    isVague: z.boolean(),
    ingredient: lineIngredientSchema,
    /** Index (from 0) of the steps the line is used in. */
    stepIndexes: z.array(z.number().int().min(0)),
    hint: lineHintSchema.optional(),
  })
  .refine((line) => line.isVague === (line.amount === null), {
    message: "A line is vague exactly when it has no amount",
    path: ["isVague"],
  })
  .refine((line) => line.amount !== null || line.unit === null, {
    message: "A line without amount has no unit",
    path: ["unit"],
  });
export type RecipeLine = z.infer<typeof recipeLineSchema>;

export const recipeDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(draftLimits.titleChars),
    /** The servings the amounts are written for. */
    servings: z.number().int().min(1),
    totalMinutes: z.number().int().min(0).nullable(),
    imageUrl: webUrl().nullable(),
    sourceKind: sourceKindSchema,
    /** The recipe page, only for sourceKind "url". */
    sourceUrl: webUrl().nullable(),
    steps: z.array(z.string().trim().min(1).max(draftLimits.stepChars)).max(draftLimits.steps),
    lines: z.array(recipeLineSchema).max(draftLimits.lines),
  })
  .superRefine((draft, context) => {
    if ((draft.sourceKind === "url") !== (draft.sourceUrl !== null)) {
      context.addIssue({
        code: "custom",
        message: "sourceUrl is set exactly when sourceKind is url",
        path: ["sourceUrl"],
      });
    }
    draft.lines.forEach((line, lineIndex) => {
      line.stepIndexes.forEach((stepIndex, position) => {
        if (stepIndex >= draft.steps.length) {
          context.addIssue({
            code: "custom",
            message: "stepIndexes must point at an existing step",
            path: ["lines", lineIndex, "stepIndexes", position],
          });
        }
      });
    });
  });
export type RecipeDraft = z.infer<typeof recipeDraftSchema>;

/** What Pontus has typed in a field that is not (yet) a valid value, so the draft does not have it. */
export type PendingFieldText = {
  totalMinutes?: string;
  /** By line index. */
  amounts?: Readonly<Record<number, string>>;
};

export const draftFieldMessages = {
  title: "Ange en titel.",
  step: "Skriv vad steget gör.",
  number: "Ange ett tal.",
  other: "Kontrollera uppgiften.",
} as const;

/**
 * Field errors for a draft in the preview, keyed by path: "title",
 * "totalMinutes", "steps.<i>", "lines.<i>.amount", or any other path the
 * schema rejects. `pending` is text in fields that did not become a value. No
 * errors means the draft can be saved.
 */
export function validateDraft(draft: RecipeDraft, pending: PendingFieldText = {}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!draft.title.trim()) errors.title = draftFieldMessages.title;
  draft.steps.forEach((step, index) => {
    if (!step.trim()) errors[`steps.${index}`] = draftFieldMessages.step;
  });
  if (pending.totalMinutes !== undefined) errors.totalMinutes = draftFieldMessages.number;
  for (const index of Object.keys(pending.amounts ?? {})) errors[`lines.${index}.amount`] = draftFieldMessages.number;
  const parsed = recipeDraftSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) errors[issue.path.join(".")] ??= draftFieldMessages.other;
  }
  return errors;
}
