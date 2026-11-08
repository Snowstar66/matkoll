import "server-only";
import { normalizeIngredientText } from "@/features/catalog";
import { getIngredientNames } from "@/features/catalog/server";
import { createClient } from "@/lib/supabase/server";
import { loadNutritionByNames } from "./data/queries";
import { nameCandidates } from "./domain/names";
import type { IngredientNutrition } from "./domain/groups";

// Server-only entry (AD-1). The nutrition table is reference data, read with
// the signed-in user's session client (select for authenticated, no writes).

/** What the functions below throw when Supabase fails; never user data. */
export { NutritionDataError } from "./data/queries";

/**
 * The nutrition of the catalog ingredients among `ingredientIds`, by ingredient
 * id. Catalog ingredients belong to a household, so the match is by the
 * ingredient's normalised name. An id without a catalog ingredient or without
 * a nutrition row is left out, which the domain counts as "not counted".
 * Throws CatalogDataError or NutritionDataError.
 */
export async function getIngredientNutrition(ingredientIds: readonly string[]): Promise<Record<string, IngredientNutrition>> {
  if (ingredientIds.length === 0) return {};
  const names = await getIngredientNames(ingredientIds);
  const normalizedById = new Map(Object.entries(names).map(([id, name]) => [id, normalizeIngredientText(name)]));
  const candidatesById = new Map([...normalizedById].map(([id, normalized]) => [id, nameCandidates(normalized)]));
  const allNames = new Set([...candidatesById.values()].flat());
  const rows = await loadNutritionByNames(await createClient(), [...allNames]);
  const result: Record<string, IngredientNutrition> = {};
  for (const [id, candidates] of candidatesById) {
    const hit = candidates.find((candidate) => Object.hasOwn(rows, candidate));
    if (hit !== undefined) result[id] = rows[hit];
  }
  return result;
}
