import "server-only";
import { env } from "@/server/env";
import { createAiService, type AiService } from "./service";

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
export { warmUpKinds } from "./service";
export type { AiIngredientHint, AiPantryItem, AiRecipe, AiRecipeIngredient, ItemPosition } from "./schemas";
export { minLoopRepeats } from "./schemas";

let service: AiService | undefined;

/** The AI service for the configured AI_PROVIDER. */
export function getAiService(): AiService {
  service ??= createAiService(env);
  return service;
}
