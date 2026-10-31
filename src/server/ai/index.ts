import "server-only";
import { env } from "@/server/env";
import { createAiService, type AiChoice, type AiService } from "./service";

// Entry point of the AI port (AD-9). Only src/server/ai imports the AI SDK.

export type {
  AiService,
  AnalyzeImageInput,
  AnalyzeImageResult,
  AnalyzePlace,
  ImageInput,
  LocateItemsInput,
  LocateItemsResult,
  ParseRecipeInput,
  RunOptions,
  SuggestDishesInput,
  SuggestPantryItem,
  WarmUpKind,
  WarmUpResult,
} from "./service";
export { aiEfforts, warmUpKinds } from "./service";
export type { AiChoice, AiEffort } from "./service";
export type { AiIngredientHint, AiPantryItem, AiRecipe, AiRecipeIngredient, ItemPosition } from "./schemas";
export { minLoopRepeats } from "./schemas";

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
 */
export function getAiServiceFor(choice: AiChoice | null): AiService {
  if (!choice) return getAiService();
  const key = `${choice.provider}|${choice.model}|${choice.effort}`;
  let chosen = choiceServices.get(key);
  if (!chosen) {
    chosen = createAiService(env, {}, choice);
    choiceServices.set(key, chosen);
  }
  return chosen;
}
