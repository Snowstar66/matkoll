import { z } from "zod";
import { labelKey } from "@/lib/label-key";
import { cleanModelText, cutCodePoints, normalizeTitle } from "@/lib/suggest-input";
import { boxFromThousandths, type ThingBox } from "@/lib/thing-box";
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

/** A heading as written, or null; an empty heading means none. Cut to length later (fromAiRecipe). */
const heading = unit;

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
    group: heading().describe("Rubriken för ingrediensgruppen raden står under, t.ex. Rostad småpotatis, null utan grupp"),
    isStapleMarked: z.boolean().describe("true när källan märker raden som basvara, t.ex. med •"),
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
  recipe: { ingredients: readonly { stepIndexes: readonly number[] }[]; steps: readonly unknown[] },
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

/** A step of a parsed recipe: its heading, if the recipe gives one, and its text. */
export const aiRecipeStep = z.object({
  title: heading().describe("Stegets rubrik, t.ex. Rostad småpotatis, null utan rubrik"),
  text: text().describe("Vad steget gör"),
});

export const aiRecipe = z
  .object({
    title: text(),
    servings: z.number().int().min(1),
    totalMinutes: z.number().int().min(0).nullable(),
    ingredients: z.array(aiRecipeIngredient).min(1),
    steps: z.array(aiRecipeStep).min(1),
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
const compactDishBase = z.object({
  title: text(),
  servings: z.number().int().min(1),
  totalMinutes: z.number().int().min(0).nullable(),
  ingredients: z.array(compactDishIngredient).min(1),
  steps: z.array(text()).min(1),
});
export const compactDish = compactDishBase.superRefine(checkStepIndexes);

/**
 * Nya idéer med extrapris: a compact dish that also says, like a friend, why it
 * is a good idea (`why`) and which of the offers and what is at home it leans
 * on (`uses`, names as given). The code checks the names (checkNowIdeas).
 */
export const compactOfferDish = compactDishBase
  .extend({
    why: text().describe("En kort mening om varför just den här rätten, t.ex. 'Fläskfilén är billig och riset finns hemma.'"),
    uses: z.array(text()).describe("Varor ur erbjudandelistan eller lagret som rätten bygger på, med exakt samma namn som i listorna"),
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
export function suggestDishesAnswerCompactFor(avoidTitles: readonly string[], { flexibleCount = false }: { flexibleCount?: boolean } = {}) {
  const avoided = new Set(avoidTitles.map(normalizeTitle));
  return z
    .object({
      suggestions: z.array(compactDish).describe(flexibleCount ? "En till tre olika rätter" : "Exakt tre olika rätter"),
    })
    .superRefine((answer, context) => {
      // Story 25.2: "Vad kan jag laga nu?" takes one to three dishes.
      const countOk = flexibleCount
        ? answer.suggestions.length >= 1 && answer.suggestions.length <= suggestionCount
        : answer.suggestions.length === suggestionCount;
      if (!countOk) {
        context.addIssue({
          code: "custom",
          message: flexibleCount
            ? `Give one to ${suggestionCount} suggestions, not ${answer.suggestions.length}`
            : `Give exactly ${suggestionCount} suggestions, not ${answer.suggestions.length}`,
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

/**
 * The answer for dishes built around the offers in the friend's way: an `intro`
 * of a thought or two, and two or three dishes (compactOfferDish) with titles of their own.
 */
export function suggestOfferIdeasAnswerFor(avoidTitles: readonly string[]) {
  const avoided = new Set(avoidTitles.map(normalizeTitle));
  return z
    .object({
      intro: text().describe("Två meningar som resonerar om veckans erbjudanden och vad som finns hemma, t.ex. 'Fläskfilé och broccoli är billigt i veckan, och du har ris hemma.'"),
      suggestions: z.array(compactOfferDish).describe("Två eller tre olika rätter"),
    })
    .superRefine((answer, context) => {
      if (answer.suggestions.length < 2 || answer.suggestions.length > suggestionCount) {
        context.addIssue({ code: "custom", message: `Give two or ${suggestionCount} suggestions, not ${answer.suggestions.length}`, path: ["suggestions"] });
      }
      const titles = new Set<string>();
      answer.suggestions.forEach((dish, index) => {
        const title = normalizeTitle(dish.title);
        if (avoided.has(title)) {
          context.addIssue({ code: "custom", message: "This title was suggested before; suggest another dish", path: ["suggestions", index, "title"] });
        } else if (titles.has(title)) {
          context.addIssue({ code: "custom", message: "Each suggestion needs a title of its own", path: ["suggestions", index, "title"] });
        }
        titles.add(title);
      });
    });
}

/** The friend's answer as a fixture file holds it: `intro`, `why` and `uses` may be left out. */
export const suggestOfferIdeasFixture = z.object({
  intro: z.string().default(""),
  suggestions: z
    .array(compactDishBase.extend({ why: z.string().default(""), uses: z.array(z.string()).default([]) }))
    .min(1),
});

/** suggestDishesAnswerCompact with nothing to avoid, e.g. for the mock's fixtures. */
export const suggestDishesAnswerCompact = suggestDishesAnswerCompactFor([]);

/** The longest label or hint text taken from the model for a pantry item; a longer one is no label on a shelf. */
export const maxPantryItemTextChars = 200;

/** Text from the model for a pantry item: not empty, at most maxPantryItemTextChars. The length is a refinement, so it stays out of the JSON schema. */
const itemText = () =>
  text().refine((value) => value.length <= maxPantryItemTextChars, {
    message: `At most ${maxPantryItemTextChars} characters`,
  });

/** How sure the model is of an item (Story 6.5): "osäker" for a likely guess, e.g. a package partly hidden. */
export const pantryItemConfidences = ["säker", "osäker"] as const;
/** What reads as sure; anything else, or nothing, is "osäker". */
const sureWords = new Set(["säker", "saker", "sure", "certain"]);

/**
 * The confidence as the port keeps it: "säker" for säker, saker, sure or
 * certain (trimmed, any case), "osäker" for anything else or nothing. An odd
 * value or a missing field never makes an item invalid: it only makes the
 * item unsure.
 */
const confidence = () =>
  z.preprocess(
    (value) => (typeof value === "string" && sureWords.has(value.trim().toLowerCase()) ? "säker" : "osäker"),
    z.enum(pantryItemConfidences),
  );

/** The most other names the model gives for an item it is unsure of (Kylfoto B). */
export const maxPantryAlternatives = 2;

/**
 * Kylfoto B: what the model answers per item in analyzeImage, in a short
 * form, since every token of the answer takes time: the label (`l`), the
 * name in base form (`n`), amount and unit (`q`, `u`), the store section
 * (`s`), the item's middle on the photo (`p`, [x, y] in thousandths, so the
 * numbers on the photo need no second call) and, only for an item the model
 * is unsure of, other names it may be (`a`; null for a sure item, so `a`
 * also says how sure it is). Where the item is kept comes from the place
 * the photo shows, and the catalog's unit from `u`. Every property is
 * required (nullable where it may be missing), so strict JSON schemas take
 * it; types only, so one bad item never makes the whole answer invalid.
 * Each item is then checked on its own (parseAnalyzeItems).
 */
const pantryPhotoItemShape = z.object({
  l: z.string().describe("Varan som på förpackningen, med märke, sort och storlek"),
  n: z.string().describe("Varan i grundform, t.ex. mellanmjölk"),
  q: z.number().nullable().describe("Antal förpackningar eller styck, eller mängden som står; null om okänt"),
  u: z.string().nullable().describe("Enheten till q, t.ex. förp eller st; null utan q"),
  s: z.string().describe("Avdelning i butiken"),
  p: z
    .array(z.number())
    .nullable()
    .describe("Krävs: [x, y] för varans mitt i tusendelar (heltal 0–1000, inte pixlar) från bildens övre vänstra hörn; uppskatta om osäker"),
  a: z
    .array(z.string())
    .nullable()
    .describe("null när du ser vad varan är; vid en trolig gissning högst två andra namn den kan vara, annars []"),
});

/**
 * What the model answers to analyzeImage: the food items it sees in the
 * short form (pantryPhotoItemShape), an empty list when there are none. No
 * maxItems: strict JSON schemas do not take it, so the prompt asks for at
 * most inputLimits.analyze.maxItems and the caller keeps the first ones.
 * Only a broken answer as a whole (no list, a field of the wrong type) is
 * invalid and retried.
 */
export const analyzeImageAnswer = z.object({
  i: z.array(pantryPhotoItemShape).describe("Matvarorna som syns på bilden, tom lista om inga syns"),
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

/** Kylfoto B: an item's middle on the photo, in thousandths (0–1000) of its width and height from the top left corner. */
export type ItemPoint = { x: number; y: number };

/**
 * Kylfoto B: an item of a photo as analyzeImage returns it: today's
 * AiPantryItem, its point on the photo (`null` when the model gave none, or
 * one that is not two numbers from 0 to 1000) and, for an unsure item, the
 * other names the model gave (at most maxPantryAlternatives, else empty).
 */
export type PhotoItem = AiPantryItem & { point: ItemPoint | null; alternatives: string[] };

/**
 * One item for copies with the same label key (labelKey): the first copy's
 * label, hint and point, "osäker" when any copy is, and its amount:
 * - a single duplicate (two copies) adds the amounts when both have one in
 *   the same unit, since it may be two packages;
 * - a loop (minLoopRepeats repeats or more) keeps one amount, never the sum:
 *   "Grädde" twelve times is the model repeating itself, not twelve packages;
 * - otherwise, and in a loop, the first copy's amount, or the first one that
 *   has an amount when the first has none.
 */
function mergeCopies(copies: readonly PhotoItem[]): PhotoItem {
  const [first] = copies;
  if (copies.length === 1) return first;
  const merged: PhotoItem = { ...first, confidence: copies.some((copy) => copy.confidence === "osäker") ? "osäker" : "säker" };
  const [, second] = copies;
  if (copies.length === 2 && first.amount !== null && second.amount !== null && sameUnit(first.unit, second.unit)) {
    return { ...merged, amount: first.amount + second.amount };
  }
  if (first.amount !== null) return merged;
  const measured = copies.find((copy) => copy.amount !== null);
  return measured ? { ...merged, amount: measured.amount, unit: measured.unit } : merged;
}

/** Kylfoto: how far past 0–1000 a coordinate may go and still be read, at the edge (a model rounds a middle near the edge outwards). */
export const pointOvershoot = 25;

/** A photo's size in pixels, for points a model gives in pixels instead of thousandths. */
export type PointImageSize = { width: number; height: number };

/**
 * The raw point of an answer's `p`: [x, y], or the middle of a box [x1, y1,
 * x2, y2] (a model used to boxes may give one); finite numbers only, else
 * `null`. Not yet checked against any scale.
 */
function rawPointOf(value: unknown): ItemPoint | null {
  if (!Array.isArray(value) || !value.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const numbers = value as number[];
  if (numbers.length === 2) return { x: numbers[0], y: numbers[1] };
  if (numbers.length === 4) return { x: (numbers[0] + numbers[2]) / 2, y: (numbers[1] + numbers[3]) / 2 };
  return null;
}

/**
 * Kylfoto: what an answer's points are in, judged from all of them at once:
 * thousandths as asked; fractions (0–1, as some models answer) when every
 * coordinate is at most 1 and some are not whole; or the photo's pixels when
 * some coordinate is past 1000 + pointOvershoot and every point fits the
 * photo (`size`). Returns the factors that make them thousandths.
 */
export function pointScale(points: readonly (ItemPoint | null)[], size?: PointImageSize | null): { x: number; y: number } {
  const given = points.filter((point): point is ItemPoint => point !== null);
  if (given.length === 0) return { x: 1, y: 1 };
  const maxX = Math.max(...given.map((point) => point.x));
  const maxY = Math.max(...given.map((point) => point.y));
  const fractional = given.some((point) => !Number.isInteger(point.x) || !Number.isInteger(point.y));
  if (maxX <= 1 && maxY <= 1 && fractional) return { x: 1000, y: 1000 };
  const limit = 1000 + pointOvershoot;
  if ((maxX > limit || maxY > limit) && size && size.width > 0 && size.height > 0) {
    const fits = maxX <= size.width * 1.02 && maxY <= size.height * 1.02;
    if (fits) return { x: 1000 / size.width, y: 1000 / size.height };
  }
  return { x: 1, y: 1 };
}

/**
 * A raw point in thousandths (`scale` from pointScale), rounded and kept on
 * the photo: a coordinate up to pointOvershoot outside 0–1000 is moved to
 * the edge, one further out makes it `null`. A bad point never makes the
 * item invalid.
 */
function pointOf(raw: ItemPoint | null, scale: { x: number; y: number }): ItemPoint | null {
  if (!raw) return null;
  const x = Math.round(raw.x * scale.x);
  const y = Math.round(raw.y * scale.y);
  const off = (value: number) => value < -pointOvershoot || value > 1000 + pointOvershoot;
  if (off(x) || off(y)) return null;
  const edge = (value: number) => Math.min(1000, Math.max(0, value));
  return { x: edge(x), y: edge(y) };
}

/** The other names of an unsure item: one line each, not empty, not the item's own name, once each, the first maxPantryAlternatives. */
function alternativesOf(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set([labelKey(name)]);
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const cleaned = cleanModelText(entry);
    const key = labelKey(cleaned);
    if (cleaned === "" || cleaned.length > maxPantryItemTextChars || seen.has(key)) continue;
    seen.add(key);
    names.push(cleaned);
  }
  return names.slice(0, maxPantryAlternatives);
}

/** An item in the short form (Kylfoto B): its catalog unit comes from `u`, and may be empty, which the catalog reads as none. */
const shortPantryItem = aiPantryItem.extend({
  hint: z.object({ name: itemText(), section: itemText(), location: itemText(), defaultUnit: z.string().trim() }),
});

/**
 * One item of an answer as a PhotoItem, or `null` when it does not pass.
 * The short form of Kylfoto B (`l`, `n`, `q`, `u`, `s`, `p`, `a`) is turned
 * into today's AiPantryItem: an `a` list (or `o` set, as a lenient model may
 * write it) makes it unsure, `place` is where it is kept, and `u` is the
 * catalog's unit. The long form of before (`label`, `confidence`, `hint`, …)
 * is still read, without a point, so an answer kept from before never breaks.
 */
function toPhotoItem(value: unknown, place: string, scale: { x: number; y: number }): PhotoItem | null {
  if (typeof value !== "object" || value === null) return null;
  const entry = value as Record<string, unknown>;
  if ("label" in entry) {
    const parsed = aiPantryItem.safeParse(entry);
    return parsed.success ? { ...parsed.data, point: null, alternatives: [] } : null;
  }
  const unsure = Array.isArray(entry.a) || entry.o === 1 || entry.o === true;
  const parsed = shortPantryItem.safeParse({
    label: entry.l,
    confidence: unsure ? "osäker" : "säker",
    amount: entry.q ?? null,
    unit: entry.u ?? null,
    hint: { name: entry.n, section: entry.s, location: place, defaultUnit: typeof entry.u === "string" ? entry.u : "" },
  });
  if (!parsed.success) return null;
  return {
    ...parsed.data,
    point: pointOf(rawPointOf(entry.p), scale),
    alternatives: unsure ? alternativesOf(entry.a, parsed.data.hint.name) : [],
  };
}

/**
 * The items of an answer that pass, in order, as PhotoItems (toPhotoItem,
 * with `place` as where they are kept), how many did not (`invalid`), and
 * how often the model repeated one label (`repeated`, Story 6.5: the most
 * extra copies of one label key). Copies with the same labelKey are one item
 * (mergeCopies), at the first copy's place. A single duplicate (`repeated`
 * 1) is merged quietly; from minLoopRepeats it is a repetition loop, and the
 * caller decides what that means. Kylfoto: the points are read in the
 * scale the whole answer uses (pointScale, with the photo's `imageSize` for
 * pixels), so a model that answers in fractions or pixels still gets its
 * numbers on the photo.
 */
export function parseAnalyzeItems(
  items: readonly unknown[],
  place: string,
  imageSize?: PointImageSize | null,
): { items: PhotoItem[]; invalid: number; repeated: number } {
  const byKey = new Map<string, PhotoItem[]>();
  let invalid = 0;
  // Kylfoto: the scale of the points is judged from the whole answer (pointScale).
  const scale = pointScale(
    items.map((item) => (typeof item === "object" && item !== null ? rawPointOf((item as { p?: unknown }).p) : null)),
    imageSize,
  );
  for (const item of items) {
    const parsed = toPhotoItem(item, place, scale);
    if (!parsed) {
      invalid++;
      continue;
    }
    const key = labelKey(parsed.label);
    const copies = byKey.get(key);
    if (copies) copies.push(parsed);
    else byKey.set(key, [parsed]);
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

/** Story 18.23: the most alike föremål the model may count on a card. */
export const maxThingCount = 999;

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
        // Story 18.7: the box in the same call, so a new card needs no second call to show where a thing is.
        box: z
          .array(z.number())
          .nullable()
          .describe(`[x1, y1, x2, y2] runt ${thingNoun.definite} i tusendelar, heltal 0–1000 av bildens bredd och höjd från övre vänstra hörnet, inte pixlar; uppskatta om du är osäker, null bara om det inte syns`),
        // Story 18.23: how many alike, for consumables only, and only when they can be counted clearly. Never a guess.
        count: z
          .number()
          .nullable()
          .describe("Hur många likadana förbrukningsvaror du kan räkna tydligt (1–999); null för en enda sak, verktyg, möbler och när du inte kan räkna säkert"),
      }),
    )
    .describe(`${thingNounCap.definitePlural} som syns på bilden, tom lista om inga syns`),
  hiddenContainers: z.number().describe("Antal lådor, backar, påsar och skåp vars innehåll inte syns, 0 om inga"),
  hiddenNote: z.string().nullable().describe("En mening om det som inte syns, t.ex. innehållet i två lådor; null om inget"),
});

/** Inköpslista from a photo: at most this many items are kept; the prompt asks for no more. */
export const maxListItems = 60;
/** The longest item name kept, in characters. */
export const maxListNameChars = 80;

/**
 * What the model answers to readShoppingList: the lines of a list on a photo
 * (a handwritten note, a screenshot), a name each with an amount and a unit
 * when the line has them. Loose on purpose (like listThingsAnswer): each item
 * is checked on its own (parseShoppingList), so one bad line never makes the
 * whole answer invalid.
 */
export const shoppingListAnswer = z.object({
  items: z
    .array(
      z.object({
        name: z.string().describe("Varans namn på svenska, utan punkt, kryssruta eller mängd, t.ex. mjölk"),
        amount: z.number().nullable().describe("Mängden som tal om raden har en, annars null"),
        unit: z.string().nullable().describe("Enheten om raden har en, t.ex. st, dl, kg, annars null"),
      }),
    )
    .describe("Varorna på listan i den ordning de står, tom lista om bilden inte visar en lista"),
});

/** One line of a shopping list as the port returns it. */
export type AiListItem = { name: string; amount: number | null; unit: string | null };

/**
 * The items of a readShoppingList answer that pass: a name on one line (cleaned, cut to maxListNameChars), an
 * amount that is a positive number below a million with a unit (else both are dropped, the item stays), the
 * first maxListItems, a name once (labelKey). `invalid` counts the lines without a usable name, `trimmed` the
 * ones cut by the maximum. Counts only, never the names, are for the log.
 */
export function parseShoppingList(answer: z.output<typeof shoppingListAnswer>): { items: AiListItem[]; invalid: number; trimmed: number } {
  let invalid = 0;
  let trimmed = 0;
  const seen = new Set<string>();
  const items: AiListItem[] = [];
  for (const entry of answer.items) {
    const name = cutCodePoints(cleanModelText(entry.name), maxListNameChars);
    if (name === "") {
      invalid++;
      continue;
    }
    const key = labelKey(name);
    if (seen.has(key)) continue;
    if (items.length >= maxListItems) {
      trimmed++;
      continue;
    }
    seen.add(key);
    const unit = entry.unit === null ? "" : cleanModelText(entry.unit);
    const hasAmount = entry.amount !== null && Number.isFinite(entry.amount) && entry.amount > 0 && entry.amount < 1_000_000 && unit !== "";
    items.push({ name, amount: hasAmount ? entry.amount : null, unit: hasAmount ? unit : null });
  }
  return { items, invalid, trimmed };
}

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

/** The most pairs one offer-matching answer may hold: a run gives the model at most 60 offers. */
export const maxOfferMatches = 60;

/**
 * What the model answers to matchOffers (Story 9.10): for each offer it knows
 * the catalog ingredient it is, as the numbers of the two lists it was given,
 * or `null` when no ingredient fits.
 */
export const matchOffersAnswer = z.object({
  matches: z
    .array(
      z.object({
        offer: z.number().describe("Numret på erbjudandet"),
        ingredient: z.number().nullable().describe("Numret på ingrediensen i katalogen, eller null när ingen passar"),
      }),
    )
    .describe("Ett par per erbjudande"),
});

/**
 * The pairs that have an ingredient, as zero-based indexes: only numbers that
 * are in the lists, each offer once (the first answer for it wins).
 */
export function parseOfferMatches(
  answer: z.output<typeof matchOffersAnswer>,
  offerCount: number,
  ingredientCount: number,
): { offer: number; ingredient: number }[] {
  const pairs: { offer: number; ingredient: number }[] = [];
  const seen = new Set<number>();
  for (const { offer, ingredient } of answer.matches) {
    if (!Number.isInteger(offer) || offer < 1 || offer > offerCount || seen.has(offer)) continue;
    seen.add(offer);
    if (ingredient === null || !Number.isInteger(ingredient) || ingredient < 1 || ingredient > ingredientCount) continue;
    pairs.push({ offer: offer - 1, ingredient: ingredient - 1 });
  }
  return pairs.slice(0, maxOfferMatches);
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
  intent: z.string().describe("question, search, remember eller refill"),
  terms: z.array(z.string()).describe("Sökord: det som frågan gäller och synonymer, på svenska, i grundform"),
  thing: z.string().nullable().describe("Vid remember och refill: föremålets namn som i en lista, t.ex. Pass; annars null"),
  room: z.string().nullable().describe("Vid remember: rummet, t.ex. Sovrummet; null om det inte står"),
  part: z.string().nullable().describe("Vid remember: var i rummet, t.ex. översta byrålådan; null om det inte står"),
  category: z.string().nullable().describe(`Vid remember och refill: en av ${thingCategories.join(", ")}; annars null`),
  // Story 18.24: "jag har köpt 4 batterier" says how many, so Fyll på opens on it.
  count: z.number().nullable().describe("Vid refill: hur många som köptes om det sades (1–999); annars null"),
});

/** What the text in the chat is (Story 18.19): a question, a plain search, something to remember, or (Story 18.24) something bought to put away. */
export const thingIntents = ["question", "search", "remember", "refill"] as const;
export type ThingIntent = (typeof thingIntents)[number];

/** The longest name of a remembered thing and of a room or part, as the tables' checks count them. */
export const rememberLimits = { name: 80, place: 40 } as const;

/** Something to remember, as the model proposed it: cleaned and cut, the category one of the app's. `room` is null when the text named none. */
export type ThingToRemember = { name: string; room: string | null; part: string | null; category: ThingCategory };

/** Story 18.24: something bought, to be put away: its name, how many when it was said (1–999), and its category. */
export type ThingToRefill = { name: string; count: number | null; category: ThingCategory };

/**
 * The model's intent and the thing it proposes to remember (Story 18.19). An
 * unknown intent is a question (the answer that is always safe); "remember"
 * without a name is a question too. The texts are one line and cut to what the
 * tables take; an unknown category is "Övrigt".
 */
export function parseThingIntent(answer: z.output<typeof thingTermsAnswer>): {
  intent: ThingIntent;
  remember: ThingToRemember | null;
  refill: ThingToRefill | null;
} {
  const intent = typeof answer.intent === "string" ? answer.intent.trim().toLowerCase() : "";
  const clean = (value: unknown, max: number) => (typeof value === "string" ? cutCodePoints(cleanModelText(value), max) : "");
  const rawCategory = typeof answer.category === "string" ? answer.category.trim() : "";
  const category: ThingCategory = (thingCategories as readonly string[]).includes(rawCategory) ? (rawCategory as ThingCategory) : "Övrigt";
  if (intent === "remember") {
    const name = clean(answer.thing, rememberLimits.name);
    if (name === "") return { intent: "question", remember: null, refill: null };
    const room = clean(answer.room, rememberLimits.place);
    const part = clean(answer.part, rememberLimits.place);
    return {
      intent: "remember",
      remember: { name, room: room === "" ? null : room, part: part === "" ? null : part, category },
      refill: null,
    };
  }
  if (intent === "refill") {
    // Story 18.24: "refill" without a name is a question; a count that is not a whole number from 1 to 999 is none.
    const name = clean(answer.thing, rememberLimits.name);
    if (name === "") return { intent: "question", remember: null, refill: null };
    const count = typeof answer.count === "number" && Number.isInteger(answer.count) && answer.count >= 1 && answer.count <= maxThingCount ? answer.count : null;
    return { intent: "refill", remember: null, refill: { name, count, category } };
  }
  return { intent: intent === "search" ? "search" : "question", remember: null, refill: null };
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
  // Story 18.7: a box that is not reasonable is left out, never the thing (boxFromThousandths).
  box: z.preprocess((value) => boxFromThousandths(value), z.custom<ThingBox>().nullable()),
  // Story 18.23: a whole number from 1 to 999, or no count; anything else is no count, never an invalid thing.
  count: z.preprocess((value) => (typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maxThingCount ? value : null), z.number().int().nullable()),
});
export type AiThing = z.output<typeof aiThing>;

/** The numbers of a raw box answer: four finite numbers, else `null`. */
function rawBoxOf(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  return value.every((n): n is number => typeof n === "number" && Number.isFinite(n)) ? (value as number[]) : null;
}

/**
 * What the boxes of an answer are in, judged from all of them at once like
 * the fridge's points (pointScale): thousandths, fractions or the photo's
 * pixels (`size`). A box's two corners are the points. Returns the factors
 * that make them thousandths; garbage is left out of the judgement.
 */
export function boxesScale(boxes: readonly unknown[], size?: PointImageSize | null): { x: number; y: number } {
  const corners: ItemPoint[] = [];
  for (const value of boxes) {
    const box = rawBoxOf(value);
    if (box) corners.push({ x: box[0], y: box[1] }, { x: box[2], y: box[3] });
  }
  return pointScale(corners, size);
}

/** A raw box answer with its numbers in thousandths (`scale` from boxesScale); anything that is not four numbers is left as it is. */
function scaledBox(value: unknown, scale: { x: number; y: number }): unknown {
  const box = rawBoxOf(value);
  return box ? [box[0] * scale.x, box[1] * scale.y, box[2] * scale.x, box[3] * scale.y] : value;
}

/**
 * The things of an answer that pass aiThing, the first maxThings, with the
 * names cleaned of control characters (cleanModelText), and how many did not
 * (`invalid`) or were cut (`trimmed`). A thing named twice on the same spot
 * is kept once; the same name in two places is two things. The boxes are
 * read in the scale the whole answer uses (boxesScale, with the photo's
 * `imageSize` for pixels).
 */
export function parseThings(answer: z.output<typeof listThingsAnswer>, imageSize?: PointImageSize | null): {
  things: AiThing[];
  invalid: number;
  trimmed: number;
  hiddenContainers: number;
  hiddenNote: string | null;
} {
  let invalid = 0;
  const seen = new Set<string>();
  const things: AiThing[] = [];
  const scale = boxesScale(answer.things.map((entry) => entry.box), imageSize);
  for (const entry of answer.things) {
    const parsed = aiThing.safeParse({
      ...entry,
      box: scaledBox(entry.box, scale),
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
    // Story 18.23: a count is only kept for a föremål the model is sure of; a guess is never counted.
    things.push(parsed.data.confidence === "low" ? { ...parsed.data, count: null } : parsed.data);
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

/**
 * What the model answers to locateThing (Story 18.7): whether it sees the
 * föremål, and its box [x1, y1, x2, y2] in thousandths. Types only, so strict
 * JSON schemas take it; the box is checked on its own (boxFromThousandths).
 */
export const locateThingAnswer = z.object({
  found: z.boolean().describe(`true om ${thingNoun.definite} syns på bilden`),
  box: z
    .array(z.number())
    .nullable()
    .describe(`[x1, y1, x2, y2] runt ${thingNoun.definite} i tusendelar, heltal 0–1000 från bildens övre vänstra hörn, inte pixlar; uppskatta om du är osäker, null bara om det inte syns`),
});

/** The box of an answer to locateThing, or `null` when the model did not find it or gave a box that is not reasonable. */
export function parseLocatedBox(answer: z.output<typeof locateThingAnswer>, imageSize?: PointImageSize | null): ThingBox | null {
  return answer.found ? boxFromThousandths(scaledBox(answer.box, boxesScale([answer.box], imageSize))) : null;
}

export type AiIngredientHint = z.infer<typeof aiIngredientHint>;
export type AiRecipeIngredient = z.infer<typeof aiRecipeIngredient>;
export type AiRecipe = z.infer<typeof aiRecipe>;
export type AiRecipeStep = z.infer<typeof aiRecipeStep>;
export type ParseRecipeAnswer = z.infer<typeof parseRecipeAnswer>;
export type CompactDish = z.output<typeof compactDish>;
export type CompactOfferDish = z.output<typeof compactOfferDish>;
export type SuggestDishesAnswerCompact = z.output<typeof suggestDishesAnswerCompact>;
export type AiPantryItem = z.output<typeof aiPantryItem>;
export type PantryItemConfidence = (typeof pantryItemConfidences)[number];
export type AnalyzeImageAnswer = z.infer<typeof analyzeImageAnswer>;
export type ListThingsAnswer = z.infer<typeof listThingsAnswer>;
export type LocateThingAnswer = z.infer<typeof locateThingAnswer>;
export type AskThingsAnswer = z.infer<typeof askThingsAnswer>;
export type CategorizeThingsAnswer = z.infer<typeof categorizeThingsAnswer>;
export type ThingTermsAnswer = z.infer<typeof thingTermsAnswer>;

/** The kinds of small thing "Idéer" of "Vad kan jag laga nu?" tells apart (Story 25.4). */
export const nowIdeaKinds = ["rätt", "tillbehör", "sås", "mellanmål", "frukost"] as const;
export type NowIdeaKind = (typeof nowIdeaKinds)[number];
/** At most this many ideas are kept, and this much of each text, in characters. */
export const nowIdeaLimits = { maxIdeas: 4, maxIntroChars: 320, maxNameChars: 60, maxHowChars: 160, maxWhyChars: 120, maxNames: 6, maxNameLength: 60 } as const;

/**
 * What the model answers to ideasNow (Story 25.4): a warm sentence or two and
 * one to four small ideas, as a friend would say them. The model may be loose
 * (the kind is free text here, the names are the ones it was given or not);
 * parseNowIdeas cleans it and the suggestions module checks the names against
 * what is at home.
 */
export const nowIdeasAnswer = z.object({
  intro: z.string().describe("Två eller tre varma, ärliga meningar som resonerar om vad som finns, t.ex. 'Du har mest såser och lite grönt, men ägg och mjölk räcker långt.'"),
  ideas: z
    .array(
      z.object({
        name: z.string().describe("Idéns namn, kort"),
        how: z.string().describe("En mening om hur, t.ex. 'dressing + ketchup och lite senap'"),
        why: z.string().describe("En kort mening om varför just den här, t.ex. 'Använder grädden som legat längst.'"),
        kind: z.string().describe("rätt, tillbehör, sås, mellanmål eller frukost"),
        uses: z.array(z.string()).describe("Varor ur lagret, med exakt samma namn som i listan"),
        missing: z.array(z.string()).describe("Varor som inte finns i lagret; helst tom"),
      }),
    )
    .describe("En till fyra idéer"),
});
export type NowIdeasAnswer = z.infer<typeof nowIdeasAnswer>;

/** An idea as the port gives it: cleaned and cut, the kind one of `nowIdeaKinds`. */
export type NowIdea = { name: string; how: string; why: string; kind: NowIdeaKind; uses: string[]; missing: string[] };

/** The model's ideas, cleaned: texts on one line and cut, an unknown kind is "rätt", at most four ideas, none without a name or a how. */
export function parseNowIdeas(answer: NowIdeasAnswer): { intro: string; ideas: NowIdea[] } {
  const line = (value: string, max: number) => cutCodePoints(cleanModelText(value), max).trim();
  const names = (values: readonly string[]) =>
    [...new Set(values.map((value) => line(value, nowIdeaLimits.maxNameLength)).filter((value) => value !== ""))].slice(0, nowIdeaLimits.maxNames);
  const ideas: NowIdea[] = [];
  for (const idea of answer.ideas) {
    const name = line(idea.name, nowIdeaLimits.maxNameChars);
    const how = line(idea.how, nowIdeaLimits.maxHowChars);
    if (name === "" || how === "") continue;
    const why = line(idea.why, nowIdeaLimits.maxWhyChars);
    const kind = line(idea.kind, 20).toLocaleLowerCase("sv");
    ideas.push({
      name,
      how,
      why,
      kind: (nowIdeaKinds as readonly string[]).includes(kind) ? (kind as NowIdeaKind) : "rätt",
      uses: names(idea.uses),
      missing: names(idea.missing),
    });
    if (ideas.length === nowIdeaLimits.maxIdeas) break;
  }
  return { intro: line(answer.intro, nowIdeaLimits.maxIntroChars), ideas };
}

/** readMenu: at most this many dishes are kept; a menu of about 80 dishes is the largest the prompt expects. */
export const maxMenuDishes = 150;

const menuAllergenList = ["gluten", "laktos", "notter", "skaldjur", "agg", "fisk", "soja", "sesam"] as const;

/**
 * What the model answers to readMenu: a restaurant menu on one to three photos, dish by dish. The field names are
 * Swedish, as the prompt asks. The currency code of a row is checked against `valutasymbol_pa_menyn` by the
 * caller (the menu-advisor domain), not here.
 */
export const menuDishAnswer = z.object({
  originalnamn: z.string(),
  grupp: z.enum(["Förrätt", "Varmrätt", "Efterrätt", "Drycker", "Övrigt"]),
  forklaring: z.string().describe('EN kort mening (ca 60-110 tecken) på klar svenska om vad man får: huvudråvara, tillagning och viktiga tillbehör, utan marknadsföring. Kryptiska menynamn förklaras: "Bläckfisk i vitlök och persilja med inlagd lök och klyftpotatis"'),
  huvudingredienser: z.array(z.string()),
  kategori: z.enum(["kott", "fisk", "skaldjur", "vegetariskt", "veganskt", "ej_tillampligt"]),
  allergener: z.array(z.enum(menuAllergenList)),
  kan_innehalla: z.array(z.enum(menuAllergenList)),
  pris: z.number().nullable(),
  valuta: z.string().nullable(),
});

export const menuAnswer = z.object({
  restaurang: z.string().nullable(),
  sprak: z.enum(["sv", "en", "es", "annat"]),
  valutasymbol_pa_menyn: z.string().nullable().describe('Symbolen priserna står med på menyn: "€", "kr", "£", "$"; null om ingen syns'),
  ratter: z.array(menuDishAnswer),
  osakert: z.array(z.string()),
});

export type MenuAnswer = z.output<typeof menuAnswer>;
export type MenuDishAnswer = z.output<typeof menuDishAnswer>;

/** One dish with its texts cleaned. */
export function cleanMenuDish(dish: MenuDishAnswer): MenuDishAnswer {
  return {
    ...dish,
    originalnamn: cleanModelText(dish.originalnamn),
    forklaring: cleanModelText(dish.forklaring),
    huvudingredienser: dish.huvudingredienser.map(cleanModelText).filter((name) => name !== ""),
  };
}

/** The answer with at most maxMenuDishes dishes, those without a name dropped, and every text cleaned. */
export function parseMenu(answer: MenuAnswer): MenuAnswer {
  const clean = (value: string) => cleanModelText(value);
  return {
    ...answer,
    restaurang: answer.restaurang === null ? null : clean(answer.restaurang) || null,
    osakert: answer.osakert.map(clean).filter((note) => note !== ""),
    ratter: answer.ratter
      .map(cleanMenuDish)
      .filter((dish) => dish.originalnamn !== "")
      .slice(0, maxMenuDishes),
  };
}

/** planWeek: at most seven days, and at most this many reasons per day are kept. */
export const maxPlanWeekReasons = 3;

/**
 * What the model answers to planWeek (Veckoagenten): a dish for each open day, as the number the dish has in the list
 * it was given. The field names are Swedish, as the prompt asks. The caller (the week agent) checks every pick again
 * in code, so nothing here is trusted: numbers outside the list are kept as unknown and caught there.
 */
export const planWeekAnswer = z.object({
  dagar: z
    .array(
      z.object({
        dag: z.number().describe("Veckodagens nummer: 1 måndag till 7 söndag, en av de lediga dagarna"),
        recept: z.number().describe("Numret på rätten i listan Rätter"),
        skal: z.array(z.string()).describe("Högst två korta skäl på svenska, bara fakta ur listan: extrapris, går ut snart, tid, passar vid sidan av en bestämd dag"),
      }),
    )
    .describe("En rad per ledig dag, i dagordning"),
});

export type PlanWeekAnswer = z.output<typeof planWeekAnswer>;

/** The answer as picks of recipe ids: a number outside the list gives the empty id (the planner's check names it unknown), the days and reasons are cleaned. */
export function parsePlanWeek(answer: PlanWeekAnswer, recipeIds: readonly string[]): { dayIndex: number; recipeId: string; reasons: string[] }[] {
  return answer.dagar.map((row) => ({
    dayIndex: Number.isInteger(row.dag) ? row.dag : 0,
    recipeId: Number.isInteger(row.recept) && row.recept >= 1 && row.recept <= recipeIds.length ? (recipeIds[row.recept - 1] ?? "") : "",
    reasons: row.skal.map(cleanModelText).filter((text) => text !== "").slice(0, maxPlanWeekReasons),
  }));
}

/** pickRestaurants: at most this many suggestions, and this many reasons per suggestion, are kept. */
export const maxPickRestaurantSuggestions = 8;
export const maxPickRestaurantReasons = 3;

/**
 * What the model answers to pickRestaurants (Restaurangagenten): the restaurants worth going to, best first, each with
 * short reasons that cite the restaurant's own page. Loose on purpose (strings): the feature's guard decides what is
 * valid, so one odd value does not throw away the whole answer.
 */
export const pickRestaurantsAnswer = z.object({
  suggestions: z
    .array(
      z.object({
        placeId: z.string().describe("The id of the restaurant exactly as given"),
        menuStatus: z.string().describe("found when the restaurant's own text gave something to base a reason on, otherwise missing"),
        why: z
          .array(
            z.object({
              text: z.string().describe("A short reason in Swedish, only from the restaurant's own text"),
              sourceUrl: z.string().describe("The page the reason comes from, exactly as given"),
            }),
          )
          .describe("At most two reasons; empty when menuStatus is missing"),
        warnings: z.array(z.string()).describe("Any of: menu_missing, allergy_unverified, diet_unverified, open_hours_unverified"),
      }),
    )
    .describe("Best first"),
});

export type PickRestaurantsAnswer = z.output<typeof pickRestaurantsAnswer>;

/** The answer with its text cleaned to one line, and bounded in length (not checked: the caller's guard does that). */
export function parsePickRestaurants(answer: PickRestaurantsAnswer): { placeId: string; menuStatus: string; why: { text: string; sourceUrl: string }[]; warnings: string[] }[] {
  return answer.suggestions.slice(0, maxPickRestaurantSuggestions).map((row) => ({
    placeId: row.placeId.trim(),
    menuStatus: row.menuStatus.trim(),
    why: row.why
      .map((reason) => ({ text: cleanModelText(reason.text), sourceUrl: reason.sourceUrl.trim() }))
      .filter((reason) => reason.text !== "")
      .slice(0, maxPickRestaurantReasons),
    warnings: row.warnings.map((warning) => warning.trim()),
  }));
}
