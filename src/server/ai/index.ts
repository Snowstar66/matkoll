import "server-only";
import { fail } from "@/lib/errors";
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
  MatchOffersInput,
  MatchOffersPair,
  MatchOffersResult,
  MergeThingsInput,
  MergeThingsPair,
  MergeThingsResult,
  NowIdeasInput,
  NowIdeasResult,
  LocateThingInput,
  LocateThingResult,
  ParseRecipeInput,
  MenuQuality,
  ReadMenuInput,
  ReadMenuResult,
  ReadShoppingListInput,
  ReadShoppingListResult,
  RunOptions,
  SuggestDishesInput,
  SuggestPantryItem,
  WarmUpKind,
  WarmUpResult,
} from "./service";
export { aiEfforts, askThingsText, categorizeThingsText, thingSearchTermsText, inputLimits, matchOffersText, mergeThingsText, warmUpKinds } from "./service";
export type { AiChoice, AiEffort } from "./service";
export type { MenuAnswer, NowIdea, NowIdeaKind } from "./schemas";
export { nowIdeaKinds } from "./schemas";
export type { AiListItem, AiIngredientHint, AiPantryItem, AiRecipe, AiRecipeIngredient, AiThing, ItemPoint, PhotoItem, ThingCategory, ThingConfidence, ThingIntent, ThingToRefill, ThingToRemember } from "./schemas";
export { maxListItems, maxThings, thingCategories, thingConfidences } from "./schemas";
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
export function getAiServiceFor(choice: AiChoice | null, sink?: AiUsageSink, gate?: AiGate): AiService {
  const base = choiceService(choice);
  const counted = sink ? withSink(base, sink) : base;
  return gate ? withGate(counted, gate) : counted;
}

/**
 * Tak för AI-kostnad: asked before each call of the port; `false` stops the call, which then answers
 * `ai_cap_reached` without reaching the model. Must not throw (a failed check is for the caller to let through).
 */
export type AiGate = () => Promise<boolean>;

/** The service whose calls (not warmUp) first ask `gate` and, when it says no, answer `ai_cap_reached`. */
function withGate(service: AiService, gate: AiGate): AiService {
  const gated =
    <Args extends unknown[], Answer>(call: (...args: Args) => Promise<Answer>) =>
    async (...args: Args): Promise<Answer | ReturnType<typeof fail>> =>
      (await gate()) ? call(...args) : fail("ai_cap_reached");
  return {
    parseRecipe: gated(service.parseRecipe),
    suggestDishes: gated(service.suggestDishes),
    ideasNow: gated(service.ideasNow),
    analyzeImage: gated(service.analyzeImage),
    listThings: gated(service.listThings),
    locateThing: gated(service.locateThing),
    readShoppingList: gated(service.readShoppingList),
    readMenu: gated(service.readMenu),
    askThings: gated(service.askThings),
    mergeThings: gated(service.mergeThings),
    matchOffers: gated(service.matchOffers),
    thingSearchTerms: gated(service.thingSearchTerms),
    categorizeThings: gated(service.categorizeThings),
    warmUp: service.warmUp,
    warmUpKey: service.warmUpKey,
  };
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
    ideasNow: (input, signal, options) => withUsageSink(sink, () => service.ideasNow(input, signal, options)),
    analyzeImage: (input, signal, options) => withUsageSink(sink, () => service.analyzeImage(input, signal, options)),
    listThings: (input, signal, options) => withUsageSink(sink, () => service.listThings(input, signal, options)),
    locateThing: (input, signal, options) => withUsageSink(sink, () => service.locateThing(input, signal, options)),
    readShoppingList: (input, signal, options) => withUsageSink(sink, () => service.readShoppingList(input, signal, options)),
    readMenu: (input, signal, options) => withUsageSink(sink, () => service.readMenu(input, signal, options)),
    askThings: (input, signal, options) => withUsageSink(sink, () => service.askThings(input, signal, options)),
    mergeThings: (input, signal, options) => withUsageSink(sink, () => service.mergeThings(input, signal, options)),
    matchOffers: (input, signal, options) => withUsageSink(sink, () => service.matchOffers(input, signal, options)),
    thingSearchTerms: (input, signal, options) => withUsageSink(sink, () => service.thingSearchTerms(input, signal, options)),
    categorizeThings: (input, signal, options) => withUsageSink(sink, () => service.categorizeThings(input, signal, options)),
    warmUp: (kind, signal, options) => service.warmUp(kind, signal, options),
    warmUpKey: (kind) => service.warmUpKey(kind),
  };
}
