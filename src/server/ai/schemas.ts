import { z } from "zod";
import { labelKey } from "@/lib/label-key";
import { cleanModelText, cutCodePoints, normalizeTitle } from "@/lib/suggest-input";
import { thingNoun, thingNounCap } from "@/lib/thing-noun";

// Response schemas for the AI port (AD-9, AD-10). The model's answer is
// validated against these; an answer that does not pass is retried, then
// reported as ai_invalid. Section, location and units are free text here:
// the catalog interprets them (AD-6, AD-12), so a new spelling never makes
// an otherwise usable answer invalid. The one exception is `new` in a
// suggested dish's line (compactDishIngredient, Story 12.3): its section,
// location and default unit are strict enums of the catalog's values on
// purpose, so an unknown section ("Godis") makes the answer invalid and gets
// a new attempt, and a strict provider decodes only known values. Every
// property is required (nullable where it may be missing), so all providers
// can use strict JSON schemas.

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

/**
 * Every stepIndexes entry of a recipe's lines points at one of its steps: an
 * issue, with the path for the model, for each entry that does not.
 */
function checkStepIndexes(
  recipe: { ingredients: readonly { stepIndexes: readonly number[] }[]; steps: readonly string[] },
  context: z.RefinementCtx,
) {
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
}

export const aiRecipe = z
  .object({
    title: text(),
    servings: z.number().int().min(1),
    totalMinutes: z.number().int().min(0).nullable(),
    ingredients: z.array(aiRecipeIngredient).min(1),
    steps: z.array(text()).min(1),
  })
  .superRefine(checkStepIndexes);

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
 * The store sections, places at home and units of the catalog (AD-12), as
 * the suggest-dishes prompt lists them. The port never imports the catalog
 * (AD-1); tests/lint/ai-catalog-lists.test.ts keeps them in step.
 */
export const catalogSections = [
  "Frukt och grönt",
  "Bröd",
  "Mejeri",
  "Kött och fisk",
  "Chark",
  "Frys",
  "Skafferi",
  "Dryck",
  "Övrigt",
] as const;
export const catalogLocations = ["Kyl", "Frys", "Skafferi"] as const;
export const catalogUnits = [
  "g",
  "kg",
  "ml",
  "cl",
  "dl",
  "l",
  "krm",
  "tsk",
  "msk",
  "st",
  "förp",
  "klyfta",
  "kruka",
  "knippe",
  "skiva",
] as const;

/**
 * Story 12.3: a line of a suggested dish, shorter than aiRecipeIngredient,
 * since every token of the answer takes time with Qwen locally. `name` is the
 * catalog name (the pantry's when the item is there), and `new` the catalog
 * entry only for an item that is not in the pantry: one that is, is already
 * in the catalog and is matched on its name (AD-6). `new` is required but
 * nullable, like every property here, so strict JSON schemas take it. The
 * unit is free text as in aiRecipeIngredient (the catalog reads it, AD-12);
 * the catalog entry in `new` must be one the catalog knows, or the answer is
 * invalid. fromCompactDish turns a dish into an AiRecipe (AD-10).
 */
export const compactDishIngredient = z.object({
  text: text().describe("Raden som i ett svenskt recept, t.ex. 2 dl grädde"),
  amount: z.number().positive().nullable().describe("Mängden som tal, null vid vag mängd"),
  unit: unit().describe("Enheten, null om den saknas eller vid vag mängd"),
  name: text().describe("Varan i grundform, samma namn som i lagret när den finns där"),
  stepIndexes: z
    .array(z.number().int().min(0))
    .describe("Index (från 0) för de steg där varan används, tom lista om det är oklart"),
  new: z
    .object({
      section: z.enum(catalogSections).describe("Avdelning i butiken"),
      location: z.enum(catalogLocations).describe("Plats hemma"),
      defaultUnit: z.enum(catalogUnits).describe("Enheten varan oftast mäts i"),
    })
    .nullable()
    .describe("Bara för en vara som inte står i lagret, annars null"),
});

/** Story 12.3: one suggested dish in the compact form (compactDishIngredient). */
export const compactDish = z
  .object({
    title: text(),
    servings: z.number().int().min(1),
    totalMinutes: z.number().int().min(0).nullable(),
    ingredients: z.array(compactDishIngredient).min(1),
    steps: z.array(text()).min(1),
  })
  .superRefine(checkStepIndexes);

/**
 * What the model answers to suggestDishes (Story 12.3): exactly three dishes
 * in the compact form (compactDish), with titles of their own, none of them
 * one of `avoidTitles`. Titles are compared normalized (normalizeTitle). The
 * count is checked here rather than with `.length(3)`, because strict JSON
 * schemas (OpenAI, Anthropic) do not take minItems or maxItems over 1; the
 * path in each issue lets schemaFeedback tell the model what to fix. The JSON
 * schema is the same for every `avoidTitles`.
 */
export function suggestDishesAnswerCompactFor(avoidTitles: readonly string[]) {
  const avoided = new Set(avoidTitles.map(normalizeTitle));
  return z
    .object({
      suggestions: z.array(compactDish).describe("Exakt tre olika rätter"),
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
      answer.suggestions.forEach((dish, index) => {
        const title = normalizeTitle(dish.title);
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

/** suggestDishesAnswerCompact with nothing to avoid, e.g. for the mock's fixtures. */
export const suggestDishesAnswerCompact = suggestDishesAnswerCompactFor([]);

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
/** How sure the model is of an item (Story 6.5): "osäker" for a likely guess, e.g. a package partly hidden. */
export const pantryItemConfidences = ["säker", "osäker"] as const;
const confidenceDescription = "säker när du ser vad varan är, osäker när det är en trolig gissning";
/** What reads as sure; anything else, or nothing, is "osäker". */
const sureWords = new Set(["säker", "saker", "sure", "certain"]);

/**
 * The confidence as the port keeps it: "säker" for säker, saker, sure or
 * certain (trimmed, any case), "osäker" for anything else or nothing. The
 * JSON schema still asks for the enum, so a strict provider decodes one of
 * the two, but an odd value or a missing field never makes an answer or an
 * item invalid: it only makes the item unsure.
 */
const confidence = () =>
  z.preprocess(
    (value) => (typeof value === "string" && sureWords.has(value.trim().toLowerCase()) ? "säker" : "osäker"),
    z.enum(pantryItemConfidences),
  );

const aiPantryItemShape = z.object({
  label: z.string().describe("Varan som den står på förpackningen, med märke, sort och storlek, t.ex. Arla mellanmjölk 1,5 l"),
  confidence: confidence().describe(confidenceDescription),
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
  items: z.array(aiPantryItemShape).describe("Matvarorna som syns på bilden, tom lista om inga syns"),
});

/**
 * One food item as the port returns it, checked on its own. What it says is
 * only what the model sees, so it is untrusted text: the catalog link comes
 * from matchIngredients (AD-6), never from the model. An amount of 0 is no
 * amount; a negative one makes the item invalid.
 */
export const aiPantryItem = z.object({
  label: itemText(),
  confidence: confidence(),
  amount: z
    .number()
    .min(0)
    .nullable()
    .transform((amount) => (amount === 0 ? null : amount)),
  unit: unit(),
  hint: z.object({ name: itemText(), section: itemText(), location: itemText(), defaultUnit: itemText() }),
});

/** Repeats of one label from which an answer counts as a repetition loop: the label three times or more. */
export const minLoopRepeats = 2;

/** Whether two units are the same as the model wrote them (trimmed, any case; none equals none). */
const sameUnit = (a: string | null, b: string | null) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/**
 * One item for copies with the same label key (labelKey): the first copy's
 * label and hint, "osäker" when any copy is, and its amount:
 * - a single duplicate (two copies) adds the amounts when both have one in
 *   the same unit, since it may be two packages;
 * - a loop (minLoopRepeats repeats or more) keeps one amount, never the sum:
 *   "Grädde" twelve times is the model repeating itself, not twelve packages;
 * - otherwise, and in a loop, the first copy's amount, or the first one that
 *   has an amount when the first has none.
 */
function mergeCopies(copies: readonly AiPantryItem[]): AiPantryItem {
  const [first] = copies;
  if (copies.length === 1) return first;
  const merged: AiPantryItem = { ...first, confidence: copies.some((copy) => copy.confidence === "osäker") ? "osäker" : "säker" };
  const [, second] = copies;
  if (copies.length === 2 && first.amount !== null && second.amount !== null && sameUnit(first.unit, second.unit)) {
    return { ...merged, amount: first.amount + second.amount };
  }
  if (first.amount !== null) return merged;
  const measured = copies.find((copy) => copy.amount !== null);
  return measured ? { ...merged, amount: measured.amount, unit: measured.unit } : merged;
}

/**
 * The items of an answer that pass aiPantryItem, in order, how many did not
 * (`invalid`), and how often the model repeated one label (`repeated`, Story
 * 6.5: the most extra copies of one label key). Copies with the same
 * labelKey are one item (mergeCopies), at the first copy's place. A single
 * duplicate (`repeated` 1) is merged quietly; from minLoopRepeats it is a
 * repetition loop, and the caller decides what that means.
 */
export function parseAnalyzeItems(items: readonly unknown[]): { items: AiPantryItem[]; invalid: number; repeated: number } {
  const byKey = new Map<string, AiPantryItem[]>();
  let invalid = 0;
  for (const item of items) {
    const parsed = aiPantryItem.safeParse(item);
    if (!parsed.success) {
      invalid++;
      continue;
    }
    const key = labelKey(parsed.data.label);
    const copies = byKey.get(key);
    if (copies) copies.push(parsed.data);
    else byKey.set(key, [parsed.data]);
  }
  const groups = [...byKey.values()];
  const repeated = groups.reduce((most, copies) => Math.max(most, copies.length - 1), 0);
  return { items: groups.map(mergeCopies), invalid, repeated };
}

/**
 * Prylar (Story 18.2): the categories of a thing, as the migration's check
 * lists them. The port never imports a feature (AD-1); the things module
 * keeps its own list in step with this one.
 */
export const thingCategories = [
  "Verktyg",
  "Sport & fritid",
  "Trädgård",
  "Elektronik",
  "Förvaring & lådor",
  "Kläder & textil",
  "Hushåll",
  "Byggmaterial",
  "Övrigt",
] as const;
export type ThingCategory = (typeof thingCategories)[number];

/** How sure the model is of a thing: high, medium or low (shown as "kanske"). */
export const thingConfidences = ["high", "medium", "low"] as const;
export type ThingConfidence = (typeof thingConfidences)[number];

/** The most things a photo gives; the model is asked for the clearest first. */
export const maxThings = 60;

/**
 * What the model answers to listThings: types and fields only, so strict
 * JSON schemas take it, and one bad thing never makes the whole answer
 * invalid. Each thing is checked on its own (parseThings).
 */
export const listThingsAnswer = z.object({
  things: z
    .array(
      z.object({
        name: z.string().describe(`${thingNounCap.definite}s namn på svenska, kort, t.ex. hammare eller cirkelsåg`),
        category: z.string().describe(`En av: ${thingCategories.join(", ")}`),
        where: z.string().nullable().describe("Var på bilden, t.ex. översta hyllan, vänster; null om det är oklart"),
        confidence: z.string().describe("high, medium eller low"),
      }),
    )
    .describe(`${thingNounCap.definitePlural} som syns på bilden, tom lista om inga syns`),
  hiddenContainers: z.number().describe("Antal lådor, backar, påsar och skåp vars innehåll inte syns, 0 om inga"),
  hiddenNote: z.string().nullable().describe("En mening om det som inte syns, t.ex. innehållet i två lådor; null om inget"),
});

/** The most places an answer to askThings may point to. */
export const maxAskRefs = 5;
/** The longest answer to askThings, in characters: it is a short answer. */
export const maxAskAnswerChars = 600;

/**
 * What the model answers to askThings (Story 18.4): a short answer in
 * Swedish and the numbers of the places it is about (the numbers in the
 * list it was given).
 */
export const askThingsAnswer = z.object({
  answer: z.string().describe("Ett kort svar på svenska, en till tre meningar"),
  places: z.array(z.number()).describe("Numren på de platser i listan som svaret handlar om, tom lista om ingen"),
});

/**
 * The answer cleaned (one line, cut at maxAskAnswerChars) and the place
 * numbers that are in the list (1 to `placeCount`), once each, the first
 * maxAskRefs; `null` when there is no answer text.
 */
export function parseAskAnswer(
  answer: z.output<typeof askThingsAnswer>,
  placeCount: number,
): { answer: string; refs: number[] } | null {
  const text = cutCodePoints(cleanModelText(answer.answer), maxAskAnswerChars);
  if (text === "") return null;
  const refs: number[] = [];
  for (const number of answer.places) {
    if (Number.isInteger(number) && number >= 1 && number <= placeCount && !refs.includes(number)) refs.push(number);
  }
  return { answer: text, refs: refs.slice(0, maxAskRefs) };
}

/** The most pairs one merge answer may hold: a card has at most 60 things. */
export const maxMergePairs = 60;

/**
 * What the model answers to mergeThings (Story 18.6): the pairs of a thing on
 * the new card and the same thing on another card, as the numbers of the two
 * lists it was given.
 */
export const mergeThingsAnswer = z.object({
  same: z
    .array(
      z.object({
        new: z.number().describe(`Numret på ${thingNoun.definite} på det nya kortet`),
        existing: z.number().describe(`Numret på samma ${thingNoun.singular} bland de befintliga`),
      }),
    )
    .describe(`Bara de par som är samma fysiska ${thingNoun.singular}, tom lista om inga`),
});

/**
 * The pairs as zero-based indexes: only numbers that are in the lists, and
 * one to one (a thing on the new card is in one pair, and a kept thing is
 * paired once, so two identical things on one card are never both made one).
 * The first pair of a number wins.
 */
export function parseMergePairs(
  answer: z.output<typeof mergeThingsAnswer>,
  addedCount: number,
  existingCount: number,
): { added: number; existing: number }[] {
  const pairs: { added: number; existing: number }[] = [];
  const usedAdded = new Set<number>();
  const usedExisting = new Set<number>();
  for (const { new: added, existing } of answer.same) {
    const valid = Number.isInteger(added) && Number.isInteger(existing) && added >= 1 && added <= addedCount && existing >= 1 && existing <= existingCount;
    if (!valid || usedAdded.has(added) || usedExisting.has(existing)) continue;
    usedAdded.add(added);
    usedExisting.add(existing);
    pairs.push({ added: added - 1, existing: existing - 1 });
  }
  return pairs.slice(0, maxMergePairs);
}

/**
 * What the model answers to categorizeThings (Story 18.13): one category for
 * each name of the numbered list it was given, in the same order.
 */
export const categorizeThingsAnswer = z.object({
  categories: z.array(z.string()).describe(`En kategori per ${thingNoun.singular} i listan, i samma ordning, bara ur den givna listan`),
});

/**
 * One category for each of `count` names: the model's answer in order, with
 * "Övrigt" for an unknown category, a missing one and any beyond `count`.
 * The list is the app's, the model may be loose.
 */
export function parseCategories(answer: z.output<typeof categorizeThingsAnswer>, count: number): ThingCategory[] {
  return Array.from({ length: count }, (_, index) => {
    const value = answer.categories[index];
    const category = typeof value === "string" ? value.trim() : "";
    return (thingCategories as readonly string[]).includes(category) ? (category as ThingCategory) : "Övrigt";
  });
}

/** The most search terms the port gives for a question (Story 18.14). */
export const maxSearchTerms = 8;
/** The shortest and longest search term, in characters. */
export const searchTermChars = { min: 2, max: 40 } as const;

/**
 * What the model answers to thingSearchTerms (Story 18.14): the words to look
 * for in the names of the things (the thing asked about and its synonyms,
 * with the context of the earlier questions).
 */
export const thingTermsAnswer = z.object({
  // Story 18.19: the same call says what the text is, so "remember this" costs no second call.
  intent: z.string().describe("question, search eller remember"),
  terms: z.array(z.string()).describe("Sökord: det som frågan gäller och synonymer, på svenska, i grundform"),
  thing: z.string().nullable().describe("Vid remember: föremålets namn som i en lista, t.ex. Pass; annars null"),
  room: z.string().nullable().describe("Vid remember: rummet, t.ex. Sovrummet; null om det inte står"),
  part: z.string().nullable().describe("Vid remember: var i rummet, t.ex. översta byrålådan; null om det inte står"),
  category: z.string().nullable().describe(`Vid remember: en av ${thingCategories.join(", ")}; annars null`),
});

/** What the text in the chat is (Story 18.19): a question, a plain search, or something to remember. */
export const thingIntents = ["question", "search", "remember"] as const;
export type ThingIntent = (typeof thingIntents)[number];

/** The longest name of a remembered thing and of a room or part, as the tables' checks count them. */
export const rememberLimits = { name: 80, place: 40 } as const;

/** Something to remember, as the model proposed it: cleaned and cut, the category one of the app's. `room` is null when the text named none. */
export type ThingToRemember = { name: string; room: string | null; part: string | null; category: ThingCategory };

/**
 * The model's intent and the thing it proposes to remember (Story 18.19). An
 * unknown intent is a question (the answer that is always safe); "remember"
 * without a name is a question too. The texts are one line and cut to what the
 * tables take; an unknown category is "Övrigt".
 */
export function parseThingIntent(answer: z.output<typeof thingTermsAnswer>): { intent: ThingIntent; remember: ThingToRemember | null } {
  const intent = typeof answer.intent === "string" ? answer.intent.trim().toLowerCase() : "";
  const clean = (value: unknown, max: number) => (typeof value === "string" ? cutCodePoints(cleanModelText(value), max) : "");
  if (intent === "remember") {
    const name = clean(answer.thing, rememberLimits.name);
    if (name === "") return { intent: "question", remember: null };
    const room = clean(answer.room, rememberLimits.place);
    const part = clean(answer.part, rememberLimits.place);
    const category = typeof answer.category === "string" ? answer.category.trim() : "";
    return {
      intent: "remember",
      remember: {
        name,
        room: room === "" ? null : room,
        part: part === "" ? null : part,
        category: (thingCategories as readonly string[]).includes(category) ? (category as ThingCategory) : "Övrigt",
      },
    };
  }
  return { intent: intent === "search" ? "search" : "question", remember: null };
}

/** The terms cleaned: one line, lower case, 2 to 40 characters, once each, the first maxSearchTerms. */
export function parseSearchTerms(answer: z.output<typeof thingTermsAnswer>): string[] {
  const terms: string[] = [];
  for (const value of answer.terms) {
    if (typeof value !== "string") continue;
    const term = cleanModelText(value).toLocaleLowerCase("sv");
    const length = [...term].length;
    if (length < searchTermChars.min || length > searchTermChars.max || terms.includes(term)) continue;
    terms.push(term);
  }
  return terms.slice(0, maxSearchTerms);
}

const thingText = (max: number) => text().refine((value) => value.length <= max, { message: `At most ${max} characters` });

/** One thing as the port returns it, checked on its own. Text from the model is untrusted. */
export const aiThing = z.object({
  name: thingText(80),
  // An unknown category is "Övrigt", never an invalid thing: the list is the app's, the model may be loose.
  category: z.preprocess(
    (value) => (typeof value === "string" && (thingCategories as readonly string[]).includes(value.trim()) ? value.trim() : "Övrigt"),
    z.enum(thingCategories),
  ),
  where: z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? value : null),
    thingText(120).nullable(),
  ),
  // Anything but a clear "high" or "medium" is low: a guess shows as "kanske".
  confidence: z.preprocess(
    (value) => {
      const word = typeof value === "string" ? value.trim().toLowerCase() : "";
      return word === "high" || word === "medium" ? word : "low";
    },
    z.enum(thingConfidences),
  ),
});
export type AiThing = z.output<typeof aiThing>;

/**
 * The things of an answer that pass aiThing, the first maxThings, with the
 * names cleaned of control characters (cleanModelText), and how many did not
 * (`invalid`) or were cut (`trimmed`). A thing named twice on the same spot
 * is kept once; the same name in two places is two things.
 */
export function parseThings(answer: z.output<typeof listThingsAnswer>): {
  things: AiThing[];
  invalid: number;
  trimmed: number;
  hiddenContainers: number;
  hiddenNote: string | null;
} {
  let invalid = 0;
  const seen = new Set<string>();
  const things: AiThing[] = [];
  for (const entry of answer.things) {
    const parsed = aiThing.safeParse({
      ...entry,
      name: cleanModelText(entry.name),
      where: entry.where === null ? null : cleanModelText(entry.where),
    });
    if (!parsed.success) {
      invalid++;
      continue;
    }
    const key = `${labelKey(parsed.data.name)}|${labelKey(parsed.data.where ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    things.push(parsed.data);
  }
  const note = answer.hiddenNote === null ? "" : cleanModelText(answer.hiddenNote);
  const hidden = Number.isFinite(answer.hiddenContainers) ? Math.min(99, Math.max(0, Math.round(answer.hiddenContainers))) : 0;
  return {
    things: things.slice(0, maxThings),
    invalid,
    trimmed: Math.max(0, things.length - maxThings),
    hiddenContainers: hidden,
    hiddenNote: note !== "" && note.length <= 300 ? note : null,
  };
}

/** The coordinate range of a point on the photo, in thousandths of its width and height (Story 6.6). */
export const maxPositionCoordinate = 1000;

/**
 * What the model answers to locateItems (Story 6.6): one point per numbered
 * label, `n` the label's number and `position` [x, y] for the item's middle
 * in thousandths (0–1000) from the photo's top left corner. Types only, so
 * strict JSON schemas take it, and one bad point never makes the whole
 * answer invalid: each is checked on its own (parseItemPositions).
 */
export const locateItemsAnswer = z.object({
  positions: z
    .array(
      z.object({
        n: z.number().describe("Varans nummer i listan"),
        position: z.array(z.number()).describe("[x, y] för varans mitt, i tusendelar (0–1000)"),
      }),
    )
    .describe("En post per nummer i listan, i samma ordning"),
});

/** One item's point as the port returns it: its number in the list and the point in thousandths. */
export type ItemPosition = { n: number; x: number; y: number };

const coordinate = z.number().min(0).max(maxPositionCoordinate);

/**
 * The points of an answer that are valid for `count` labels, sorted by
 * number, and how many were not (`invalid`): `n` must be a whole number from
 * 1 to `count` and `position` exactly two numbers from 0 to 1000. A second
 * point for the same number is invalid too; the first one is kept.
 */
export function parseItemPositions(
  entries: readonly unknown[],
  count: number,
): { positions: ItemPosition[]; invalid: number } {
  const entry = z.object({
    n: z.number().int().min(1).max(count),
    position: z.tuple([coordinate, coordinate]),
  });
  const byNumber = new Map<number, ItemPosition>();
  let invalid = 0;
  for (const candidate of entries) {
    const parsed = entry.safeParse(candidate);
    if (!parsed.success || byNumber.has(parsed.data.n)) {
      invalid++;
      continue;
    }
    const [x, y] = parsed.data.position;
    byNumber.set(parsed.data.n, { n: parsed.data.n, x, y });
  }
  return { positions: [...byNumber.values()].sort((a, b) => a.n - b.n), invalid };
}

export type AiIngredientHint = z.infer<typeof aiIngredientHint>;
export type AiRecipeIngredient = z.infer<typeof aiRecipeIngredient>;
export type AiRecipe = z.infer<typeof aiRecipe>;
export type ParseRecipeAnswer = z.infer<typeof parseRecipeAnswer>;
export type CompactDish = z.output<typeof compactDish>;
export type SuggestDishesAnswerCompact = z.output<typeof suggestDishesAnswerCompact>;
export type AiPantryItem = z.output<typeof aiPantryItem>;
export type PantryItemConfidence = (typeof pantryItemConfidences)[number];
export type AnalyzeImageAnswer = z.infer<typeof analyzeImageAnswer>;
export type LocateItemsAnswer = z.infer<typeof locateItemsAnswer>;
export type ListThingsAnswer = z.infer<typeof listThingsAnswer>;
export type AskThingsAnswer = z.infer<typeof askThingsAnswer>;
export type CategorizeThingsAnswer = z.infer<typeof categorizeThingsAnswer>;
export type ThingTermsAnswer = z.infer<typeof thingTermsAnswer>;
