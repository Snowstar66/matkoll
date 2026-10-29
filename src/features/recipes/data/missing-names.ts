import "server-only";
import { getIngredientNames } from "@/features/catalog/server";
import type { PantrySnapshot } from "@/features/pantry";
import { missingIngredientIds, type RecipeListRow } from "../domain/recipe-list";

/**
 * The names (by id) of the ingredients the library rows miss (Story 4.3), for
 * the badges' accessible names; nothing is read when nothing is missing.
 */
export async function missingNames(
  rows: readonly RecipeListRow[],
  snapshot: PantrySnapshot | null,
): Promise<Record<string, string>> {
  const ids = missingIngredientIds(rows, snapshot);
  return ids.length > 0 ? getIngredientNames(ids) : {};
}
