import "server-only";
import { fail, ok, type Result } from "@/lib/errors";
import { imageMediaTypes, maxImageBytes } from "@/lib/images";
import {
  avoidTitleLines,
  cleanModelText,
  isValidOfferName,
  isValidPantryEntry,
  offerLines,
  offerLinesLength,
  pantryLines,
  pantryLinesLength,
  suggestInputLimits,
  type SuggestPantryEntry,
} from "@/lib/suggest-input";
import type { Env } from "@/server/env-schema";
import { createAnthropicTarget } from "./adapters/anthropic";
import { createLmStudioTarget } from "./adapters/lmstudio";
import { createMockAiService } from "./adapters/mock";
import { createOpenAiTarget } from "./adapters/openai";
import { fromCompactDish } from "./compact-dish";
import { prompts } from "./prompts";
import {
  defaultLimits,
  runStructured,
  runWarmUp,
  type Limits,
  type ModelTarget,
  type WarmUpOptions,
  type WarmUpResult,
} from "./run";
import {
  analyzeImageAnswer,
  askThingsAnswer,
  parseAskAnswer,
  listThingsAnswer,
  locateItemsAnswer,
  maxPantryItemTextChars,
  parseAnalyzeItems,
  parseItemPositions,
  parseRecipeAnswer,
  parseThings,
  suggestDishesAnswerCompactFor,
  type AiPantryItem,
  type AiRecipe,
  type AiThing,
  type ItemPosition,
} from "./schemas";
import { warmImage } from "./warm-image";

// The AI port (AD-9). Modules call these methods and never see the provider.
// Each has its schema in schemas.ts and its prompt in prompts/.

export type ImageInput = { data: Uint8Array; mediaType: string };

export type ParseRecipeInput = {
  /** Recipe text: pasted by Pontus, or the readable text of a recipe page. */
  text?: string;
  /** schema.org/Recipe JSON-LD from a recipe page. Input, not the answer (AD-11). */
  jsonLd?: string;
  /** A photo of a cookbook page, already resized in the client (AD-15). */
  image?: ImageInput;
};

/** One pantry entry: a name with an amount and unit, or both `null` when the item is always enough. */
export type SuggestPantryItem = SuggestPantryEntry;

export type SuggestDishesInput = {
  /** What is at home, by catalog name. Never ids, locations or dates. */
  pantry: SuggestPantryItem[];
  /** Titles already suggested, which the model is asked not to suggest again; an answer with one of them is invalid. */
  avoidTitles: string[];
  /**
   * Story 9.5: the names of this week's offers (never prices), best first,
   * when the dishes are to be built around them. Empty (the default) gives
   * the message of Story 12.3 unchanged. Data for the model, never instructions.
   */
  offers?: string[];
};

export type RunOptions = {
  /**
   * When the whole request must be done (Date.now() milliseconds): the run's
   * total budget is cut to the time left, so the Route Handler fits its
   * maxDuration. Without it, the usual budget.
   */
  deadline?: number;
};

export type SuggestDishesOptions = RunOptions;

/** The places at home a photo can show. The port takes them as strings; it never imports a feature module (AD-1). */
export const analyzePlaces = ["Kyl", "Frys", "Skafferi"] as const;
export type AnalyzePlace = (typeof analyzePlaces)[number];

/**
 * What analyzeImage answers: the items that passed aiPantryItem, in the
 * model's order, how many did not (`invalid`), and the most extra copies of
 * one label the model gave (`repeated`, Story 6.5): copies are merged into
 * one item, and from minLoopRepeats the answer is a repetition loop.
 */
export type AnalyzeImageResult = { items: AiPantryItem[]; invalid: number; repeated: number };

export type AnalyzeImageInput = {
  /** A photo of the place, already resized in the client (AD-15). Never stored or logged. */
  image: ImageInput;
  /** The place the photo shows. */
  place: AnalyzePlace;
};

export type LocateItemsInput = {
  /** The same photo analyzeImage read, as the client sent it (AD-15). Never stored or logged. */
  image: ImageInput;
  /**
   * The items read from it, in reading order: item n is labels[n - 1]. Text
   * from the model on one line (cleanModelText), at most
   * inputLimits.locate.maxLabels of at most maxPantryItemTextChars each.
   * Data for the model, never instructions.
   */
  labels: string[];
};

/**
 * What locateItems answers (Story 6.6): the valid points, by number, and how
 * many the model gave that were not valid (`invalid`). Items without a point
 * are simply missing.
 */
export type LocateItemsResult = { positions: ItemPosition[]; invalid: number };

export type ListThingsInput = {
  /** A photo of a place, already resized in the client (AD-15). Never stored or logged by the port. */
  image: ImageInput;
};

/**
 * What listThings answers (Story 18.2): the things that passed aiThing, the
 * first maxThings in the model's order, how many did not (`invalid`) or were
 * cut (`trimmed`), how many closed containers the model could not see into,
 * and its sentence about them.
 */
export type ListThingsResult = {
  things: AiThing[];
  invalid: number;
  trimmed: number;
  hiddenContainers: number;
  hiddenNote: string | null;
};

/** A place as askThings gets it (Story 18.4): text only, never an image. Data for the model, never instructions. */
export type AskThingsPlace = {
  /** The place's name on one line, e.g. "Skräpförrådet · Översta hyllan". */
  title: string;
  /** The boende's name. */
  site: string;
  /** When the card was taken, as text: "31 okt". */
  cardDate: string;
  /** How many closed containers the card could not see into. */
  hidden: number;
  /** The things of the card: name and category, and where in the photo, all on one line. */
  things: { name: string; category: string; where: string | null }[];
};

export type AskThingsInput = {
  /** What Pontus asked, on one line. */
  question: string;
  /** The places, in the order the answer numbers them (the first is 1). */
  places: AskThingsPlace[];
};

/** What askThings answers: a short text and the places it is about, as indexes into `places` (zero-based). */
export type AskThingsResult = { answer: string; places: number[] };

/** What warmUp wakes (Story 12.2): the reading of a photo, or the text flows. */
export const warmUpKinds = ["image", "text"] as const;
export type WarmUpKind = (typeof warmUpKinds)[number];

function isWarmUpKind(kind: string): kind is WarmUpKind {
  return (warmUpKinds as readonly string[]).includes(kind);
}

export type { WarmUpOptions, WarmUpResult } from "./run";

export interface AiService {
  /**
   * Fails with `validation` (input outside the limits below), `import_no_recipe`
   * (the input has no recipe), `ai_unavailable`, `ai_rejected` or `ai_invalid`.
   */
  parseRecipe(input: ParseRecipeInput, signal: AbortSignal): Promise<Result<AiRecipe>>;
  /**
   * Three dishes from what is at home, with titles of their own and none of
   * `avoidTitles`. Fails with `validation` (no pantry item, or input outside
   * inputLimits.suggest), `ai_unavailable` (also when the deadline leaves too
   * little time), `ai_rejected` or `ai_invalid`.
   */
  suggestDishes(input: SuggestDishesInput, signal: AbortSignal, options?: SuggestDishesOptions): Promise<Result<AiRecipe[]>>;
  /**
   * The food items the model sees in a photo of a place at home, possibly
   * none, and possibly more than inputLimits.analyze.maxItems (the caller
   * keeps the first ones). Each item is checked on its own: one that does not
   * pass aiPantryItem is left out and counted in `invalid`, and copies of one
   * label are merged into one item and counted in `repeated`. Fails with
   * `validation` (an image outside the limits, or an unknown place),
   * `ai_unavailable` (also when the deadline leaves too little time),
   * `ai_rejected` or `ai_invalid` (the answer as a whole is broken).
   */
  analyzeImage(input: AnalyzeImageInput, signal: AbortSignal, options?: RunOptions): Promise<Result<AnalyzeImageResult>>;
  /**
   * Where on the photo each of the numbered labels is (Story 6.6): a second
   * call after analyzeImage with the same photo, which never changes the
   * reading. One point [x, y] in thousandths per label, each checked on its
   * own (parseItemPositions): a bad one is left out and counted in
   * `invalid`. Its own short budget (locateLimitsFrom: one attempt of at most
   * 30 s), since the numbers are extra. Only for a target that supports
   * grounding in thousandths (supportsGrounding: LM Studio with a Qwen model,
   * and the mock): any other answers `ai_unavailable` at once. Fails with `validation` (an image or
   * labels outside the limits), `ai_unavailable` (also when the deadline
   * leaves too little time), `ai_rejected` or `ai_invalid` (the answer as a
   * whole is broken).
   */
  locateItems(input: LocateItemsInput, signal: AbortSignal, options?: RunOptions): Promise<Result<LocateItemsResult>>;
  /**
   * The things the model sees in a photo of a place (Story 18.2): name,
   * category, where in the photo and how sure, partly visible things too, but
   * no fixtures such as shelves. Each is checked on its own (parseThings).
   * Fails with `validation` (an image outside the limits), `ai_unavailable`
   * (also when the deadline leaves too little time), `ai_rejected` or
   * `ai_invalid` (the answer as a whole is broken).
   */
  listThings(input: ListThingsInput, signal: AbortSignal, options?: RunOptions): Promise<Result<ListThingsResult>>;
  /**
   * A short answer in Swedish to a question about Pontus's things (Story
   * 18.4), from the lists the cards gave (text only, no image) and the
   * numbers of the places it is about, each checked to be in the list. Fails
   * with `validation` (a question or lists outside inputLimits.ask),
   * `ai_unavailable` (also when the deadline leaves too little time),
   * `ai_rejected` or `ai_invalid` (no usable answer).
   */
  askThings(input: AskThingsInput, signal: AbortSignal, options?: RunOptions): Promise<Result<AskThingsResult>>;
  /**
   * Wakes the model before it is needed (Story 12.2, FR-45): one call with
   * the flow's own system prompt (analyzeImage for `image`, suggestDishes
   * for `text`), a minimal message without any data of Pontus's (a grey
   * image, or a pantry of salt) and a single token of answer, without a
   * schema and without new attempts, at most warmUpLimits.totalMs. The
   * answer is never used. Only a target with a warmUpKey (LM Studio) is
   * called; any other answers `skipped` (`provider`) at once. `isBusy` is
   * asked again after the health check: a real call that started in the
   * meantime makes it `skipped` (`busy`). Never fails: a model that cannot
   * be reached is `unavailable`.
   */
  warmUp(kind: WarmUpKind, signal: AbortSignal, options?: WarmUpOptions): Promise<WarmUpResult>;
  /**
   * The model `kind` would wake, as a key for the limit on warm-ups (one
   * per user and model: both kinds wake the same LM Studio model), or
   * `null` when warmUp does nothing for this provider.
   */
  warmUpKey(kind: WarmUpKind): string | null;
}

/**
 * Input limits, sized for Qwen3.6 in LM Studio with an 8192-token context:
 * about 1 000 tokens of prompt and schema, at most 12 000 characters of text
 * and JSON-LD (Swedish runs at roughly 3–3.5 characters per token, so under
 * 4 000 tokens) and at most 3 000 tokens of answer.
 */
export const inputLimits = {
  maxTextChars: 12_000,
  /** AD-15: photos are resized in the client to at most 1.5 MB. */
  maxImageBytes,
  imageMediaTypes,
  maxOutputTokens: 3_000,
  /**
   * suggestDishes (src/lib/suggest-input.ts): the pantry as at most 4 000
   * characters of lines (about 1 300 tokens), and the answer, so prompt,
   * schema, pantry and answer fit in 8 192 tokens. Story 12.3: the compact
   * answer is about a third shorter. Counted with Qwen3.6's tokenizer on the
   * mock's answers, three dishes are about 1 070 tokens on one line (the full
   * AiRecipe was 1 620, and 12.1 measured 1 470–2 130), and about 1 460 when
   * every line has `new`. 3 000 leaves room for that twice over, and an
   * answer that runs on stops after about 70 s at 44 tokens per second, so a
   * new attempt still fits in the 115 s (it was 4 000, about 90 s). The live
   * measurement is in the one for all of Epic 12.
   */
  suggest: { ...suggestInputLimits, maxOutputTokens: 3_000 },
  /**
   * analyzeImage, measured with Qwen3.6 in LM Studio (MLX, 8 192 tokens of
   * context, 2026-10-26): an item is 60–70 tokens of answer, so 25 items
   * with brand, sort and size in the label are about 1 600 tokens, and 3 000
   * leaves room. The prompt tokens LM Studio reports (about 1 000 for prompt,
   * schema and message) are the same for a photo of 1600 and of 2048 px, so
   * the photo itself is not in that count and its share of the context is not
   * measured. Estimated at one token per 32 × 32 px, a photo of 2048 × 1536 px
   * is about 3 100 tokens, and 1 000 + 3 100 + 3 000 fits. A real photo of
   * the fridge at 2048 px took 19–51 s (pnpm eval:ai, Story 6.5), within the
   * 100 s attempt. The prompt asks for at most 25;
   * more are cut by the caller, not refused.
   */
  analyze: { maxItems: 25, maxOutputTokens: 3_000 },
  /**
   * listThings (Story 18.2): a thing is about 40 tokens of answer, so 60
   * things are about 2 400 and 4 000 leave room for the note and a model that
   * writes more around them. The spike on nine photos of a storage room gave
   * 9–47 things per photo in 9–24 s with Haiku 5.5.
   */
  things: { maxOutputTokens: 4_000 },
  /**
   * askThings (Story 18.4): the question at most 300 characters and the
   * lists at most 12 000 (askThingsText counts them), as for any text flow,
   * so prompt, schema and lists stay under about 5 000 tokens in 8 192; the
   * answer is a few sentences, so 600 tokens leave room for a model that
   * thinks aloud around them. The lists are names, never photos.
   */
  ask: { maxQuestionChars: 300, maxPlaces: 200, maxChars: 12_000, maxOutputTokens: 600 },
  /**
   * locateItems (Story 6.6), measured with Qwen3.6 in LM Studio on Pontus's
   * photo at 2048 px (2026-10-26): 20 points were 390 tokens of answer, in
   * about 10 s with a warm model and 24 s on the first, cold call. At most
   * as many labels as analyze keeps items, each a label as the port keeps it;
   * 25 points would be about 500 tokens, and 1 600 leave room for a model
   * that writes more around them (a cut answer is logged as
   * locate_truncated). One attempt of at most 30 s: the numbers are extra,
   * so failing fast is better than keeping the model busy. Only a target
   * with supportsGrounding is asked.
   */
  locate: { maxLabels: 25, maxLabelChars: maxPantryItemTextChars, maxOutputTokens: 1_600, attemptMs: 30_000 },
} as const;

/** True for an image that is not empty, at most maxImageBytes and of a type the port takes. */
export function isValidImage({ data, mediaType }: ImageInput): boolean {
  if (data.byteLength === 0 || data.byteLength > inputLimits.maxImageBytes) return false;
  return (inputLimits.imageMediaTypes as readonly string[]).includes(mediaType);
}

/** True when the input has something to read and stays within inputLimits. */
export function isValidParseRecipeInput(input: ParseRecipeInput): boolean {
  const text = (input.text?.trim().length ?? 0) + (input.jsonLd?.trim().length ?? 0);
  if (text === 0 && !input.image) return false;
  if (text > inputLimits.maxTextChars) return false;
  return !input.image || isValidImage(input.image);
}

/** True for an image within the limits and one of the three places. */
export function isValidAnalyzeImageInput(input: AnalyzeImageInput): boolean {
  return isValidImage(input.image) && (analyzePlaces as readonly string[]).includes(input.place);
}

/** True for one label as locateItems takes it: on one line (cleanModelText leaves it as it is), not empty, at most maxLabelChars. */
export function isValidLocateLabel(label: string): boolean {
  return label !== "" && label === cleanModelText(label) && label.length <= inputLimits.locate.maxLabelChars;
}

/** True for a question and lists within inputLimits.ask: a question on one line, 1 to maxPlaces places, each with a title, boende and date on one line. */
export function isValidAskThingsInput(input: AskThingsInput): boolean {
  const limits = inputLimits.ask;
  const { question, places } = input;
  if (question === "" || question !== cleanModelText(question) || question.length > limits.maxQuestionChars) return false;
  if (places.length === 0 || places.length > limits.maxPlaces) return false;
  const oneLine = (text: string) => text !== "" && text === cleanModelText(text);
  const valid = places.every(
    (place) =>
      oneLine(place.title) &&
      oneLine(place.site) &&
      oneLine(place.cardDate) &&
      Number.isInteger(place.hidden) &&
      place.hidden >= 0 &&
      place.things.every((thing) => oneLine(thing.name) && oneLine(thing.category) && (thing.where === null || oneLine(thing.where))),
  );
  return valid && askThingsText(input).length <= limits.maxChars;
}

/** True for an image within the limits and 1 to inputLimits.locate.maxLabels valid labels. */
export function isValidLocateItemsInput(input: LocateItemsInput): boolean {
  const { labels } = input;
  if (labels.length === 0 || labels.length > inputLimits.locate.maxLabels) return false;
  return isValidImage(input.image) && labels.every(isValidLocateLabel);
}

/**
 * locateItems' budget within `limits` (Story 6.6): one attempt, of at most
 * inputLimits.locate.attemptMs, after the health check. Shorter limits (in
 * tests) stay shorter.
 */
export function locateLimitsFrom(limits: Limits): Limits {
  const attemptMs = Math.min(limits.attemptMs, inputLimits.locate.attemptMs);
  return {
    ...limits,
    attemptMs,
    totalMs: Math.min(limits.totalMs, limits.healthMs + attemptMs),
    maxAttempts: 1,
  };
}

/** True when there is at least one pantry entry and the input stays within inputLimits.suggest. */
export function isValidSuggestDishesInput(input: SuggestDishesInput): boolean {
  const limits = inputLimits.suggest;
  const { pantry, avoidTitles } = input;
  const offers = input.offers ?? [];
  // Without offers there must be a pantry; around offers an empty pantry is fine.
  if ((pantry.length === 0 && offers.length === 0) || pantry.length > limits.maxPantryItems) return false;
  if (offers.length > limits.maxOffers || !offers.every(isValidOfferName) || new Set(offers).size !== offers.length) return false;
  if (offerLinesLength(offers) > limits.maxOfferChars) return false;
  if (!pantry.every(isValidPantryEntry)) return false;
  if (pantryLinesLength(pantry) > limits.maxPantryChars) return false;
  if (avoidTitles.length > limits.maxAvoidTitles) return false;
  return avoidTitles.every((title) => title !== "" && title === cleanModelText(title) && title.length <= limits.maxTitleChars);
}

/** Less time than this left before the deadline: the model is not asked. */
export const minRunMs = 10_000;

/** The run's budget within the deadline, or `null` when too little time is left. */
export function limitsWithin(limits: Limits, deadline: number | undefined): Limits | null {
  if (deadline === undefined) return limits;
  const left = deadline - Date.now();
  if (left < minRunMs) return null;
  const totalMs = Math.min(limits.totalMs, left);
  return { ...limits, totalMs, attemptMs: Math.min(limits.attemptMs, totalMs) };
}

/** Checks the input in front of any adapter, the mock included, so all behave alike. */
export function withInputValidation(service: AiService): AiService {
  return {
    async parseRecipe(input, signal) {
      if (!isValidParseRecipeInput(input)) return fail("validation");
      return service.parseRecipe(input, signal);
    },
    async suggestDishes(input, signal, options) {
      if (!isValidSuggestDishesInput(input)) return fail("validation");
      return service.suggestDishes(input, signal, options);
    },
    async analyzeImage(input, signal, options) {
      if (!isValidAnalyzeImageInput(input)) return fail("validation");
      return service.analyzeImage(input, signal, options);
    },
    async locateItems(input, signal, options) {
      if (!isValidLocateItemsInput(input)) return fail("validation");
      return service.locateItems(input, signal, options);
    },
    async listThings(input, signal, options) {
      if (!isValidImage(input.image)) return fail("validation");
      return service.listThings(input, signal, options);
    },
    async askThings(input, signal, options) {
      if (!isValidAskThingsInput(input)) return fail("validation");
      return service.askThings(input, signal, options);
    },
    async warmUp(kind, signal, options) {
      if (!isWarmUpKind(kind)) return { outcome: "skipped", reason: "provider" };
      return service.warmUp(kind, signal, options);
    },
    warmUpKey(kind) {
      return isWarmUpKind(kind) ? service.warmUpKey(kind) : null;
    },
  };
}

/** The port on top of a real model, with the shared run rules in run.ts. */
export function createModelAiService(target: ModelTarget, limits: Limits = defaultLimits): AiService {
  return {
    async parseRecipe(input, signal) {
      const answer = await runStructured(
        target,
        {
          schema: parseRecipeAnswer,
          system: prompts.parseRecipe,
          messages: [{ role: "user", content: parseRecipeContent(input) }],
          maxOutputTokens: inputLimits.maxOutputTokens,
        },
        signal,
        limits,
      );
      if (!answer.ok) return answer;
      // The schema guarantees that recipe is set exactly when noRecipe is false.
      if (answer.data.noRecipe || !answer.data.recipe) return fail("import_no_recipe");
      return ok(answer.data.recipe);
    },
    async suggestDishes(input, signal, options = {}) {
      const within = limitsWithin(limits, options.deadline);
      if (!within) {
        console.error("ai_unavailable", { reason: "deadline" });
        return fail("ai_unavailable");
      }
      const answer = await runStructured(
        target,
        {
          // Story 12.3: the compact answer. One with a title to avoid is invalid, so the retry tells the model.
          schema: suggestDishesAnswerCompactFor(input.avoidTitles),
          system: prompts.suggestDishes,
          messages: [{ role: "user", content: suggestDishesContent(input) }],
          maxOutputTokens: inputLimits.suggest.maxOutputTokens,
          // Story 12.3: the cap is lower now, so an answer cut at it is logged (only the event, never the answer).
          onTruncated: () => console.info("suggest_truncated"),
        },
        signal,
        within,
      );
      if (!answer.ok) return answer;
      return ok(answer.data.suggestions.map(fromCompactDish));
    },
    async analyzeImage(input, signal, options = {}) {
      const within = limitsWithin(limits, options.deadline);
      if (!within) {
        console.error("ai_unavailable", { reason: "deadline" });
        return fail("ai_unavailable");
      }
      const answer = await runStructured(
        target,
        {
          schema: analyzeImageAnswer,
          system: prompts.analyzeImage,
          messages: [{ role: "user", content: analyzeImageContent(input) }],
          maxOutputTokens: inputLimits.analyze.maxOutputTokens,
          // Story 6.5: the adapter's sampling for photos (LM Studio: Qwen's settings against repetition loops).
          sampling: target.imageSampling,
        },
        signal,
        within,
      );
      if (!answer.ok) return answer;
      return ok(parseAnalyzeItems(answer.data.items));
    },
    async listThings(input, signal, options = {}) {
      const within = limitsWithin(limits, options.deadline);
      if (!within) {
        console.error("ai_unavailable", { reason: "deadline" });
        return fail("ai_unavailable");
      }
      const answer = await runStructured(
        target,
        {
          schema: listThingsAnswer,
          system: prompts.listThings,
          messages: [{ role: "user", content: listThingsContent(input) }],
          maxOutputTokens: inputLimits.things.maxOutputTokens,
          sampling: target.imageSampling,
          onTruncated: () => console.info("things_truncated"),
        },
        signal,
        within,
      );
      if (!answer.ok) return answer;
      const parsed = parseThings(answer.data);
      // Counts only, never the names.
      if (parsed.invalid > 0 || parsed.trimmed > 0) console.info("things_dropped", { invalid: parsed.invalid, trimmed: parsed.trimmed });
      return ok(parsed);
    },
    async askThings(input, signal, options = {}) {
      const within = limitsWithin(limits, options.deadline);
      if (!within) {
        console.error("ai_unavailable", { reason: "deadline" });
        return fail("ai_unavailable");
      }
      const answer = await runStructured(
        target,
        {
          schema: askThingsAnswer,
          system: prompts.askThings,
          messages: [{ role: "user", content: askThingsText(input) }],
          maxOutputTokens: inputLimits.ask.maxOutputTokens,
          onTruncated: () => console.info("ask_truncated"),
        },
        signal,
        within,
      );
      if (!answer.ok) return answer;
      const parsed = parseAskAnswer(answer.data, input.places.length);
      if (!parsed) {
        console.error("ai_invalid", { reason: "empty_answer" });
        return fail("ai_invalid");
      }
      // The model's numbers start at 1; the port gives indexes.
      return ok({ answer: parsed.answer, places: parsed.refs.map((number) => number - 1) });
    },
    async locateItems(input, signal, options = {}) {
      // Story 6.6: only a model trained to point in thousandths is asked; the photo is not sent again otherwise.
      if (!target.supportsGrounding) {
        console.info("ai_unavailable", { reason: "no_grounding" });
        return fail("ai_unavailable");
      }
      const within = limitsWithin(locateLimitsFrom(limits), options.deadline);
      if (!within) {
        console.error("ai_unavailable", { reason: "deadline" });
        return fail("ai_unavailable");
      }
      const answer = await runStructured(
        target,
        {
          schema: locateItemsAnswer,
          system: prompts.locateItems,
          messages: [{ role: "user", content: locateItemsContent(input) }],
          maxOutputTokens: inputLimits.locate.maxOutputTokens,
          // The same sampling as the reading of the photo (Story 6.5, quick fix: temperature 0).
          sampling: target.imageSampling,
          onTruncated: () => console.info("locate_truncated"),
        },
        signal,
        within,
      );
      if (!answer.ok) return answer;
      const located = parseItemPositions(answer.data.positions, input.labels.length);
      // Counts only, never the labels or the points.
      if (located.invalid > 0) console.info("locate_positions_invalid", { count: located.invalid });
      return ok(located);
    },
    warmUpKey() {
      return target.warmUpKey ?? null;
    },
    async warmUp(kind, signal, options) {
      if (!target.warmUpKey) return { outcome: "skipped", reason: "provider" };
      return runWarmUp(
        target,
        kind === "image"
          ? {
              system: prompts.analyzeImage,
              messages: [{ role: "user", content: analyzeImageContent({ image: warmImage, place: "Kyl" }) }],
              // The same sampling as a real reading of a photo (Story 6.5).
              sampling: target.imageSampling,
            }
          : {
              system: prompts.suggestDishes,
              messages: [{ role: "user", content: suggestDishesContent(warmUpPantry) }],
            },
        signal,
        options,
      );
    },
  };
}

/** The text warm-up's pantry: one line, "salt: finns", and nothing of Pontus's. */
const warmUpPantry: SuggestDishesInput = { pantry: [{ name: "salt", amount: null, unit: null }], avoidTitles: [] };

const placeNames: Record<AnalyzePlace, string> = { Kyl: "kylen", Frys: "frysen", Skafferi: "skafferiet" };

/** The user message: "Bilden visar kylen." and the photo as a `file` part. */
export function analyzeImageContent(input: AnalyzeImageInput) {
  return [
    { type: "text" as const, text: `Bilden visar ${placeNames[input.place]}.` },
    { type: "file" as const, data: input.image.data, mediaType: input.image.mediaType },
  ];
}

/** The user message for listThings (Story 18.2): a line and the photo as a `file` part. */
export function listThingsContent(input: ListThingsInput) {
  return [
    { type: "text" as const, text: "Bilden visar en plats hemma. Lista prylarna." },
    { type: "file" as const, data: input.image.data, mediaType: input.image.mediaType },
  ];
}

/**
 * The user message for askThings (Story 18.4): "Fråga:" and the question,
 * then "Platser:" with a numbered line per place (title, boende, card date,
 * and the closed containers when there are any) and under it its things,
 * "Hammare (Verktyg, på väggen)" separated by semicolons. Every text is on
 * one line, so none can start a section of its own; the prompt says the
 * lists are data.
 */
export function askThingsText(input: AskThingsInput): string {
  const places = input.places.map((place, index) => {
    const head = [place.title, place.site, `kort ${place.cardDate}`];
    if (place.hidden > 0) head.push(`${place.hidden} ${place.hidden === 1 ? "låda" : "lådor"} syns inte`);
    const things = place.things
      .map((thing) => `${thing.name.replaceAll(";", ",")} (${[thing.category, thing.where].filter(Boolean).join(", ")})`)
      .join("; ");
    return `${index + 1}. ${head.join(" | ")}\n   ${things === "" ? "(inga prylar)" : things}`;
  });
  return `Fråga: ${input.question}\n\nPlatser:\n${places.join("\n")}`;
}

/**
 * The user message for locateItems (Story 6.6), as in the experiment of
 * 2026-10-26: the photo as a `file` part, then "Varorna:" with a numbered
 * line per label ("1. Arla mellanmjölk 1,5 l"). The labels are on one line,
 * so none can start a line of its own; the prompt says they are data.
 */
export function locateItemsContent(input: LocateItemsInput) {
  const lines = input.labels.map((label, index) => `${index + 1}. ${label}`).join("\n");
  return [
    { type: "file" as const, data: input.image.data, mediaType: input.image.mediaType },
    { type: "text" as const, text: `Varorna:\n${lines}` },
  ];
}

/**
 * The user message: "Lagret:" with one line per entry, then "Föreslå inte:"
 * with a line per title, when there are any. Names, units and titles are
 * clean (no line breaks), so none of them can start a section of its own; the
 * prompt says both lists are data, not instructions.
 */
export function suggestDishesContent(input: SuggestDishesInput): string {
  const parts = [input.pantry.length > 0 ? `Lagret:\n${pantryLines(input.pantry)}` : "Lagret:\n(tomt)"];
  if (input.offers && input.offers.length > 0) {
    parts.push(`Erbjudanden i butiken den här veckan:\n${offerLines(input.offers)}`);
  }
  if (input.avoidTitles.length > 0) parts.push(`Föreslå inte:\n${avoidTitleLines(input.avoidTitles)}`);
  return parts.join("\n\n");
}

function parseRecipeContent(input: ParseRecipeInput) {
  const parts: (
    | { type: "text"; text: string }
    | { type: "file"; data: Uint8Array; mediaType: string }
  )[] = [];
  if (input.text?.trim()) parts.push({ type: "text", text: `Recepttext:\n\n${input.text.trim()}` });
  if (input.jsonLd?.trim()) {
    parts.push({ type: "text", text: `JSON-LD från receptsidan:\n\n${input.jsonLd.trim()}` });
  }
  if (input.image) {
    parts.push({ type: "text", text: "Bild av receptet:" });
    parts.push({ type: "file", data: input.image.data, mediaType: input.image.mediaType });
  }
  return parts;
}

/** How hard a Claude model thinks (Story 17.5): sent as `output_config.effort`. LM Studio has no matching switch, so Qwen ignores it. */
export const aiEfforts = ["low", "medium", "high"] as const;
export type AiEffort = (typeof aiEfforts)[number];

/** The provider, model and level picked in Inställningar. The port never reads the database; the caller passes it in. */
export type AiChoice = { provider: "lmstudio" | "anthropic"; model: string; effort: AiEffort };

export type AiServiceOptions = {
  /** For tests: replaces fetch in the real adapters. */
  fetch?: typeof fetch;
  /** For tests: where the mock reads its fixtures. */
  fixturesDir?: string;
  limits?: Limits;
};

/**
 * Picks the adapter from AI_PROVIDER, with the input checked in front of it.
 * parseEnv has already checked that the settings fit.
 */
export function createAiService(env: Env, options: AiServiceOptions = {}, choice?: AiChoice): AiService {
  // Story 17.5: a choice made in Inställningar replaces AI_PROVIDER and AI_MODEL; the keys and URLs stay the environment's.
  const effective = choice ? { ...env, AI_PROVIDER: choice.provider, AI_MODEL: choice.model } : env;
  return withInputValidation(createAdapter(effective, options, choice?.effort));
}

function createAdapter(env: Env, options: AiServiceOptions, effort?: AiEffort): AiService {
  const model = (name: string | undefined) => {
    if (!name) throw new Error("AI_MODEL is not set");
    return name;
  };

  switch (env.AI_PROVIDER) {
    case "mock":
      return createMockAiService(options.fixturesDir, { delayMs: env.AI_MOCK_DELAY_MS });
    case "lmstudio":
      if (!env.LMSTUDIO_BASE_URL) throw new Error("LMSTUDIO_BASE_URL is not set");
      return createModelAiService(
        createLmStudioTarget({
          baseURL: env.LMSTUDIO_BASE_URL,
          model: model(env.AI_MODEL),
          cfAccess:
            env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET
              ? { clientId: env.CF_ACCESS_CLIENT_ID, clientSecret: env.CF_ACCESS_CLIENT_SECRET }
              : undefined,
          fetch: options.fetch,
        }),
        options.limits,
      );
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
      return createModelAiService(
        createAnthropicTarget({ apiKey: env.ANTHROPIC_API_KEY, model: model(env.AI_MODEL), effort, fetch: options.fetch }),
        options.limits,
      );
    case "openai":
      if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
      return createModelAiService(
        createOpenAiTarget({ apiKey: env.OPENAI_API_KEY, model: model(env.AI_MODEL), fetch: options.fetch }),
        options.limits,
      );
  }
}
