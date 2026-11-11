import "server-only";
import { fail } from "@/lib/errors";
import { env } from "@/server/env";
import { createAiService, type AiChoice, type AiService } from "./service";
import { withUsageSink, type AiCapRefusal, type AiUsageReserver, type AiUsageSink } from "./usage";

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
  FindRestaurantsWebInput,
  FindRestaurantsWebResult,
  FindRestaurantsWebSuggestion,
  PlanWeekInput,
  PlanWeekPick,
  PlanWeekQuality,
  PlanWeekRecipe,
  PlanWeekResult,
  NowIdeasResult,
  LocateThingInput,
  LocateThingResult,
  ParseRecipeInput,
  MenuProgress,
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
export { aiEfforts, menuModels, planWeekModels, askThingsText, categorizeThingsText, thingSearchTermsText, inputLimits, matchOffersText, mergeThingsText, warmUpKinds } from "./service";
export type { AiChoice, AiEffort } from "./service";
export type { MenuAnswer, MenuDishAnswer, NowIdea, NowIdeaKind } from "./schemas";
export { nowIdeaKinds } from "./schemas";
export type { AiListItem, AiIngredientHint, AiPantryItem, AiRecipe, AiRecipeIngredient, AiThing, ItemPoint, PhotoItem, ThingCategory, ThingConfidence, ThingIntent, ThingToRefill, ThingToRemember } from "./schemas";
export { maxListItems, maxThings, thingCategories, thingConfidences } from "./schemas";
export { minLoopRepeats } from "./schemas";
export type { AiCapRefusal, AiUsage, AiUsageHold, AiUsageReserver, AiUsageSink } from "./usage";

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
export function getAiServiceFor(choice: AiChoice | null, sink?: AiUsageSink, gate?: AiGate, reserve?: AiUsageReserver): AiService {
  const base = choiceService(choice);
  const counted = sink || reserve ? withSink(base, sink, reserve) : base;
  return gate ? withGate(counted, gate) : counted;
}

/**
 * Tak för AI-kostnad: asked before each call of the port; `false` stops the call, which then answers
 * `ai_cap_reached` without reaching the model, and a refusal code answers that code (the cap could
 * not be checked: fails closed, security review S-03). Must not throw.
 * Security review S-02: with a reserver (getAiServiceFor's `reserve`), every run of the call then also
 * reserves its worst case against the cap before it asks the model (usage.ts holdUsage).
 */
export type AiGate = () => Promise<boolean | AiCapRefusal>;

/** The service whose calls (not warmUp) first ask `gate` and, when it says no, answer `ai_cap_reached` (or its refusal). */
function withGate(service: AiService, gate: AiGate): AiService {
  const gated =
    <Args extends unknown[], Answer>(call: (...args: Args) => Promise<Answer>) =>
    async (...args: Args): Promise<Answer | ReturnType<typeof fail>> => {
      const verdict = await gate();
      if (verdict === true) return call(...args);
      return fail(verdict === false ? "ai_cap_reached" : verdict);
    };
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
    planWeek: gated(service.planWeek),
    findRestaurantsWeb: gated(service.findRestaurantsWeb),
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

/** The service with each call run under `sink` and `reserve`. warmUp is left out: it is local and a single token. */
function withSink(service: AiService, sink: AiUsageSink | undefined, reserve: AiUsageReserver | undefined): AiService {
  const metered = <T>(run: () => T): T => withUsageSink(sink, run, reserve);
  return {
    parseRecipe: (input, signal) => metered(() => service.parseRecipe(input, signal)),
    suggestDishes: (input, signal, options) => metered(() => service.suggestDishes(input, signal, options)),
    ideasNow: (input, signal, options) => metered(() => service.ideasNow(input, signal, options)),
    analyzeImage: (input, signal, options) => metered(() => service.analyzeImage(input, signal, options)),
    listThings: (input, signal, options) => metered(() => service.listThings(input, signal, options)),
    locateThing: (input, signal, options) => metered(() => service.locateThing(input, signal, options)),
    readShoppingList: (input, signal, options) => metered(() => service.readShoppingList(input, signal, options)),
    readMenu: (input, signal, options) => metered(() => service.readMenu(input, signal, options)),
    askThings: (input, signal, options) => metered(() => service.askThings(input, signal, options)),
    mergeThings: (input, signal, options) => metered(() => service.mergeThings(input, signal, options)),
    matchOffers: (input, signal, options) => metered(() => service.matchOffers(input, signal, options)),
    planWeek: (input, signal, options) => metered(() => service.planWeek(input, signal, options)),
    findRestaurantsWeb: (input, signal, options) => metered(() => service.findRestaurantsWeb(input, signal, options)),
    thingSearchTerms: (input, signal, options) => metered(() => service.thingSearchTerms(input, signal, options)),
    categorizeThings: (input, signal, options) => metered(() => service.categorizeThings(input, signal, options)),
    warmUp: (kind, signal, options) => service.warmUp(kind, signal, options),
    warmUpKey: (kind) => service.warmUpKey(kind),
  };
}
