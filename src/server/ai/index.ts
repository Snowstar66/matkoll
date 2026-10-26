import "server-only";
import { env } from "@/server/env";
import { createAiService, type AiService } from "./service";

// Entry point of the AI port (AD-9). Only src/server/ai imports the AI SDK.

export type { AiService, ImageInput, ParseRecipeInput, SuggestDishesInput, SuggestPantryItem } from "./service";
export type { AiIngredientHint, AiRecipe, AiRecipeIngredient } from "./schemas";

let service: AiService | undefined;

/** The AI service for the configured AI_PROVIDER. */
export function getAiService(): AiService {
  service ??= createAiService(env);
  return service;
}
