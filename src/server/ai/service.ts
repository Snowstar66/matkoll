import "server-only";
import { fail, ok, type Result } from "@/lib/errors";
import { imageMediaTypes, maxImageBytes } from "@/lib/images";
import {
  avoidTitleLines,
  cleanModelText,
  isValidPantryEntry,
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
import { prompts } from "./prompts";
import { defaultLimits, runStructured, type Limits, type ModelTarget } from "./run";
import {
  analyzeImageAnswer,
  parseAnalyzeItems,
  parseRecipeAnswer,
  suggestDishesAnswerFor,
  type AiPantryItem,
  type AiRecipe,
} from "./schemas";

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

/** What analyzeImage answers: the items that passed aiPantryItem, in the model's order, and how many did not. */
export type AnalyzeImageResult = { items: AiPantryItem[]; invalid: number };

export type AnalyzeImageInput = {
  /** A photo of the place, already resized in the client (AD-15). Never stored or logged. */
  image: ImageInput;
  /** The place the photo shows. */
  place: AnalyzePlace;
};

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
   * pass aiPantryItem is left out and counted in `invalid`. Fails with
   * `validation` (an image outside the limits, or an unknown place),
   * `ai_unavailable` (also when the deadline leaves too little time),
   * `ai_rejected` or `ai_invalid` (the answer as a whole is broken).
   */
  analyzeImage(input: AnalyzeImageInput, signal: AbortSignal, options?: RunOptions): Promise<Result<AnalyzeImageResult>>;
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
   * characters of lines (about 1 300 tokens), and three answers of at most
   * about 1 000 tokens each (the prompt allows 10 lines and 6 short steps per
   * dish), so prompt, schema, pantry and answer fit in 8 192 tokens.
   */
  suggest: { ...suggestInputLimits, maxOutputTokens: 4_000 },
  /**
   * analyzeImage: measured with Qwen3.6 in LM Studio (2026-10-26), prompt,
   * schema and a photo of 1600 px are under 1 000 tokens, and an item is
   * about 60 tokens of answer. At most 25 items is about 1 500 tokens, so
   * 3 000 leaves room for long labels, and the answer comes well within the
   * 100 s attempt. The prompt asks for at most 25; more are cut by the
   * caller, not refused.
   */
  analyze: { maxItems: 25, maxOutputTokens: 3_000 },
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

/** True when there is at least one pantry entry and the input stays within inputLimits.suggest. */
export function isValidSuggestDishesInput(input: SuggestDishesInput): boolean {
  const limits = inputLimits.suggest;
  const { pantry, avoidTitles } = input;
  if (pantry.length === 0 || pantry.length > limits.maxPantryItems) return false;
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
          // An answer with a title to avoid is invalid, so the retry tells the model.
          schema: suggestDishesAnswerFor(input.avoidTitles),
          system: prompts.suggestDishes,
          messages: [{ role: "user", content: suggestDishesContent(input) }],
          maxOutputTokens: inputLimits.suggest.maxOutputTokens,
        },
        signal,
        within,
      );
      if (!answer.ok) return answer;
      return ok(answer.data.suggestions);
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
        },
        signal,
        within,
      );
      if (!answer.ok) return answer;
      return ok(parseAnalyzeItems(answer.data.items));
    },
  };
}

const placeNames: Record<AnalyzePlace, string> = { Kyl: "kylen", Frys: "frysen", Skafferi: "skafferiet" };

/** The user message: "Bilden visar kylen." and the photo as a `file` part. */
export function analyzeImageContent(input: AnalyzeImageInput) {
  return [
    { type: "text" as const, text: `Bilden visar ${placeNames[input.place]}.` },
    { type: "file" as const, data: input.image.data, mediaType: input.image.mediaType },
  ];
}

/**
 * The user message: "Lagret:" with one line per entry, then "Föreslå inte:"
 * with a line per title, when there are any. Names, units and titles are
 * clean (no line breaks), so none of them can start a section of its own; the
 * prompt says both lists are data, not instructions.
 */
export function suggestDishesContent(input: SuggestDishesInput): string {
  const parts = [`Lagret:\n${pantryLines(input.pantry)}`];
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
export function createAiService(env: Env, options: AiServiceOptions = {}): AiService {
  return withInputValidation(createAdapter(env, options));
}

function createAdapter(env: Env, options: AiServiceOptions): AiService {
  const model = (name: string | undefined) => {
    if (!name) throw new Error("AI_MODEL is not set");
    return name;
  };

  switch (env.AI_PROVIDER) {
    case "mock":
      return createMockAiService(options.fixturesDir);
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
        createAnthropicTarget({ apiKey: env.ANTHROPIC_API_KEY, model: model(env.AI_MODEL), fetch: options.fetch }),
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
