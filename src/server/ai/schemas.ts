import { z } from "zod";
import { normalizeTitle } from "@/lib/suggest-input";

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

/** A unit as written, or null; an empty unit means no unit. */
const unit = () =>
  z
    .string()
    .nullable()
    .transform((value) => (value?.trim() ? value.trim() : null));

export const aiRecipeIngredient = z
  .object({
    originalText: text().describe("Raden ordagrant som den står i receptet"),
    amount: z.number().positive().nullable().describe("Mängden som tal, null vid vag mängd"),
    unit: unit().describe("Enheten som den står, null om den saknas eller vid vag mängd"),
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

/** How many dishes suggestDishes answers with. */
export const suggestionCount = 3;

/**
 * What the model answers to suggestDishes: exactly three dishes with titles of
 * their own, none of them one of `avoidTitles`. Titles are compared
 * normalized (normalizeTitle). The count is checked here rather than with
 * `.length(3)`, because strict JSON schemas (OpenAI, Anthropic) do not take
 * minItems or maxItems over 1; the path in each issue lets schemaFeedback tell
 * the model what to fix. The JSON schema is the same for every `avoidTitles`.
 */
export function suggestDishesAnswerFor(avoidTitles: readonly string[]) {
  const avoided = new Set(avoidTitles.map(normalizeTitle));
  return z
    .object({
      suggestions: z.array(aiRecipe).describe("Exakt tre olika rätter"),
    })
    .superRefine((answer, context) => {
      if (answer.suggestions.length !== suggestionCount) {
        context.addIssue({
          code: "custom",
          message: `Give exactly ${suggestionCount} suggestions, not ${answer.suggestions.length}`,
          path: ["suggestions"],
        });
      }
      const titles = new Set<string>();
      answer.suggestions.forEach((recipe, index) => {
        const title = normalizeTitle(recipe.title);
        if (avoided.has(title)) {
          context.addIssue({
            code: "custom",
            message: "This title was suggested before; suggest another dish",
            path: ["suggestions", index, "title"],
          });
        } else if (titles.has(title)) {
          context.addIssue({
            code: "custom",
            message: "Each suggestion needs a title of its own",
            path: ["suggestions", index, "title"],
          });
        }
        titles.add(title);
      });
    });
}

/** suggestDishesAnswer with nothing to avoid, e.g. for the mock's fixtures. */
export const suggestDishesAnswer = suggestDishesAnswerFor([]);

/** The longest label or hint text taken from the model for a pantry item; a longer one is no label on a shelf. */
export const maxPantryItemTextChars = 200;

/** Text from the model for a pantry item: not empty, at most maxPantryItemTextChars. The length is a refinement, so it stays out of the JSON schema. */
const itemText = () =>
  text().refine((value) => value.length <= maxPantryItemTextChars, {
    message: `At most ${maxPantryItemTextChars} characters`,
  });

const pantryHintDescriptions = {
  name: "Varan i grundform, t.ex. mellanmjölk",
  section: "Avdelning i butiken",
  location: "Plats hemma: Kyl, Frys eller Skafferi",
  defaultUnit: "Enheten varan oftast köps i",
} as const;

/**
 * The shape the model answers per item in analyzeImage: types and fields
 * only, so strict JSON schemas take it, and one bad item never makes the
 * whole answer invalid. Each item is then checked on its own against
 * aiPantryItem (parseAnalyzeItems).
 */
const aiPantryItemShape = z.object({
  label: z.string().describe("Varan som den syns, t.ex. Arla mellanmjölk"),
  amount: z
    .number()
    .nullable()
    .describe("Antal synliga förpackningar eller styck, eller mängden som står tydligt, annars null"),
  unit: z.string().nullable().describe("Enheten till mängden, t.ex. förp eller st, null om mängden saknas"),
  hint: z.object({
    name: z.string().describe(pantryHintDescriptions.name),
    section: z.string().describe(pantryHintDescriptions.section),
    location: z.string().describe(pantryHintDescriptions.location),
    defaultUnit: z.string().describe(pantryHintDescriptions.defaultUnit),
  }),
});

/**
 * What the model answers to analyzeImage: the food items it sees, an empty
 * list when there are none. No maxItems: strict JSON schemas do not take it,
 * so the prompt asks for at most inputLimits.analyze.maxItems and the caller
 * keeps the first ones. Only a broken answer as a whole (no list, a field of
 * the wrong type) is invalid and retried.
 */
export const analyzeImageAnswer = z.object({
  items: z.array(aiPantryItemShape).describe("Matvarorna som syns tydligt, tom lista om inga syns"),
});

/**
 * One food item as the port returns it, checked on its own. What it says is
 * only what the model sees, so it is untrusted text: the catalog link comes
 * from matchIngredients (AD-6), never from the model. An amount of 0 is no
 * amount; a negative one makes the item invalid.
 */
export const aiPantryItem = z.object({
  label: itemText(),
  amount: z
    .number()
    .min(0)
    .nullable()
    .transform((amount) => (amount === 0 ? null : amount)),
  unit: unit(),
  hint: z.object({ name: itemText(), section: itemText(), location: itemText(), defaultUnit: itemText() }),
});

/** The items of an answer that pass aiPantryItem, in order, and how many did not. */
export function parseAnalyzeItems(items: readonly unknown[]): { items: AiPantryItem[]; invalid: number } {
  const valid: AiPantryItem[] = [];
  for (const item of items) {
    const parsed = aiPantryItem.safeParse(item);
    if (parsed.success) valid.push(parsed.data);
  }
  return { items: valid, invalid: items.length - valid.length };
}

export type AiIngredientHint = z.infer<typeof aiIngredientHint>;
export type AiRecipeIngredient = z.infer<typeof aiRecipeIngredient>;
export type AiRecipe = z.infer<typeof aiRecipe>;
export type ParseRecipeAnswer = z.infer<typeof parseRecipeAnswer>;
export type SuggestDishesAnswer = z.infer<typeof suggestDishesAnswer>;
export type AiPantryItem = z.output<typeof aiPantryItem>;
export type AnalyzeImageAnswer = z.infer<typeof analyzeImageAnswer>;
