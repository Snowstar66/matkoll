import "server-only";
import { env } from "@/server/env";
import { createAiService, type AiChoice, type AiService } from "./service";
import { withUsageSink, type AiUsageSink } from "./usage";

// Entry point of the AI port (AD-9). Only src/server/ai imports the AI SDK.

export type {
  AiService,
  AnalyzeImageInput,
  AnalyzeImageResult,
  AskThingsInput,
  AskThingsPlace,
  AskThingsResult,
  CategorizeThingsInput,
  CategorizeThingsResult,
  ThingSearchTermsInput,
  ThingSearchTermsResult,
  AnalyzePlace,
  ImageInput,
  ListThingsInput,
  ListThingsResult,
  MergeThingsInput,
  MergeThingsPair,
  MergeThingsResult,
  LocateItemsInput,
  LocateItemsResult,
  LocateThingInput,
  LocateThingResult,
  ParseRecipeInput,
  RunOptions,
  SuggestDishesInput,
  SuggestPantryItem,
  WarmUpKind,
  WarmUpResult,
} from "./service";
export { aiEfforts, askThingsText, categorizeThingsText, thingSearchTermsText, inputLimits, mergeThingsText, warmUpKinds } from "./service";
export type { AiChoice, AiEffort } from "./service";
export type { AiIngredientHint, AiPantryItem, AiRecipe, AiRecipeIngredient, AiThing, ItemPosition, ThingCategory, ThingConfidence, ThingIntent, ThingToRefill, ThingToRemember } from "./schemas";
export { maxThings, thingCategories, thingConfidences } from "./schemas";
export { minLoopRepeats } from "./schemas";
export type { AiUsage, AiUsageSink } from "./usage";

let service: AiService | undefined;

/** The AI service for the configured AI_PROVIDER. */
export function getAiService(): AiService {
  service ??= createAiService(env);
  return service;
}

const choiceServices = new Map<string, AiService>();

/**
 * Story 17.5: the AI service for a choice made in Inställningar, or the one
 * for AI_PROVIDER/AI_MODEL when there is none. Built once per distinct
 * choice, so a changed choice applies to the next job without a restart.
 * Story 17.6: with a `sink`, every call of the returned service reports the
 * model and the tokens it used to it (once per call, over all attempts).
 */
export function getAiServiceFor(choice: AiChoice | null, sink?: AiUsageSink): AiService {
  const base = choiceService(choice);
  return sink ? withSink(base, sink) : base;
}

function choiceService(choice: AiChoice | null): AiService {
  if (!choice) return getAiService();
  const key = `${choice.provider}|${choice.model}|${choice.effort}`;
  let chosen = choiceServices.get(key);
  if (!chosen) {
    chosen = createAiService(env, {}, choice);
    choiceServices.set(key, chosen);
  }
  return chosen;
}

/** The service with each call run under `sink`. warmUp is left out: it is local and a single token. */
function withSink(service: AiService, sink: AiUsageSink): AiService {
  return {
    parseRecipe: (input, signal) => withUsageSink(sink, () => service.parseRecipe(input, signal)),
    suggestDishes: (input, signal, options) => withUsageSink(sink, () => service.suggestDishes(input, signal, options)),
    analyzeImage: (input, signal, options) => withUsageSink(sink, () => service.analyzeImage(input, signal, options)),
    locateItems: (input, signal, options) => withUsageSink(sink, () => service.locateItems(input, signal, options)),
    listThings: (input, signal, options) => withUsageSink(sink, () => service.listThings(input, signal, options)),
    locateThing: (input, signal, options) => withUsageSink(sink, () => service.locateThing(input, signal, options)),
    askThings: (input, signal, options) => withUsageSink(sink, () => service.askThings(input, signal, options)),
    mergeThings: (input, signal, options) => withUsageSink(sink, () => service.mergeThings(input, signal, options)),
    thingSearchTerms: (input, signal, options) => withUsageSink(sink, () => service.thingSearchTerms(input, signal, options)),
    categorizeThings: (input, signal, options) => withUsageSink(sink, () => service.categorizeThings(input, signal, options)),
    warmUp: (kind, signal, options) => service.warmUp(kind, signal, options),
    warmUpKey: (kind) => service.warmUpKey(kind),
  };
}
