import "server-only";
import { getPantryForStatus } from "@/features/pantry/server";
import { listRecipeRows } from "@/features/recipes/server";
import { offerTagsByRecipe } from "../domain/recipe-offers";
import type { OfferInfo } from "../domain/offer-input";

/**
 * The filter Erbjudanden in Recept (Story 9.3): the offers each of the user's
 * recipes uses on a main ingredient, by recipe id (offerTagsByRecipe), for the
 * offers of all the user's stores (the page reads them once, for the sheet too).
 * A read, counted without AI. Throws what the recipe and pantry reads throw.
 */
export async function recipeOfferTags(offers: readonly OfferInfo[]): Promise<Record<string, string[]>> {
  if (offers.length === 0) return {};
  const [rows, { staples }] = await Promise.all([listRecipeRows(), getPantryForStatus()]);
  return offerTagsByRecipe(
    offers,
    rows.map((row) => ({ id: row.id, lines: row.lines.map((line) => ({ ingredientId: line.ingredientId, amount: line.amount, unit: line.unit })) })),
    staples,
  );
}
