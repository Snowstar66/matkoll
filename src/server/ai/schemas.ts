import { z } from "zod";

// Response schemas for the AI port (AD-9, AD-10). The model's answer is
// validated against these; an answer that does not pass is retried, then
// reported as ai_invalid. Section, location and units are free text here:
// the catalog interprets them (AD-6, AD-12), so a new spelling never makes
// an otherwise usable answer invalid. Every property is required (nullable
// where it may be missing), so all providers can use strict JSON schemas.

/** A string that is not empty or whitespace only; surrounding whitespace is removed. */
const text = () => z.string().trim().min(1);

/** The model's suggestion for a catalog ingredient, used when the catalog has no match. */
export const aiIngredientHint = z.object({
  name: text().describe("Ingrediensens namn i grundform, t.ex. gul lök"),
  section: text().describe("Avdelning i butiken"),
  location: text().describe("Plats hemma: Kyl, Frys eller Skafferi"),
  defaultUnit: text().describe("Enheten ingrediensen oftast köps eller mäts i"),
});

export const aiRecipeIngredient = z
  .object({
    originalText: text().describe("Raden ordagrant som den står i receptet"),
    amount: z.number().positive().nullable().describe("Mängden som tal, null vid vag mängd"),
    unit: z
      .string()
      .nullable()
      // An empty unit means no unit.
      .transform((unit) => (unit?.trim() ? unit.trim() : null))
      .describe("Enheten som den står, null om den saknas eller vid vag mängd"),
    isVague: z.boolean().describe("true när mängden inte går att ange som tal, t.ex. salt efter smak"),
    hint: aiIngredientHint,
    stepIndexes: z
      .array(z.number().int().min(0))
      .describe("Index (från 0) för de steg där ingrediensen används, tom lista om det är oklart"),
  })
  .refine((line) => !line.isVague || (line.amount === null && line.unit === null), {
    message: "A vague line has neither amount nor unit",
    path: ["isVague"],
  });

export const aiRecipe = z
  .object({
    title: text(),
    servings: z.number().int().min(1),
    totalMinutes: z.number().int().min(0).nullable(),
    ingredients: z.array(aiRecipeIngredient).min(1),
    steps: z.array(text()).min(1),
  })
  .superRefine((recipe, context) => {
    recipe.ingredients.forEach((line, lineIndex) => {
      line.stepIndexes.forEach((stepIndex, position) => {
        if (stepIndex >= recipe.steps.length) {
          context.addIssue({
            code: "custom",
            message: "stepIndexes must point at an existing step",
            path: ["ingredients", lineIndex, "stepIndexes", position],
          });
        }
      });
    });
  });

/**
 * What the model answers to parseRecipe: a recipe, or `noRecipe: true` when the
 * input has no recipe. The root is an object (not a union) because strict JSON
 * schemas require that.
 */
export const parseRecipeAnswer = z
  .object({
    noRecipe: z.boolean().describe("true bara när indata inte innehåller något recept"),
    recipe: aiRecipe.nullable().describe("Receptet, eller null när noRecipe är true"),
  })
  .refine((answer) => answer.noRecipe === (answer.recipe === null), {
    message: "recipe is null exactly when noRecipe is true",
    path: ["recipe"],
  });

export type AiIngredientHint = z.infer<typeof aiIngredientHint>;
export type AiRecipeIngredient = z.infer<typeof aiRecipeIngredient>;
export type AiRecipe = z.infer<typeof aiRecipe>;
export type ParseRecipeAnswer = z.infer<typeof parseRecipeAnswer>;
