import "server-only";
import { CatalogDataError, commitIngredients } from "@/features/catalog/server";
import type { PantryItemSet } from "../domain/pantry-item-form";
import { mergeConfirmations, mergePantrySets, type ConfirmItem } from "../domain/pantry-suggestion";

/**
 * The catalog step of confirming lagerförslag (Stories 6.2 and 6.4, AD-1,
 * AD-6), shared by confirmPantrySuggestions and confirmPantryInventory: the
 * validated items are merged (mergeConfirmations), and their ingredients
 * committed through the catalog, where a new one is created only now and an
 * existing id is passed as an exact match, so commitIngredients checks it is
 * in the user's catalog (`unknown_ingredient`) and saves no synonym. The
 * items are merged again on the ids the catalog gave (mergePantrySets), since
 * a new name can turn out to be an ingredient already in the list.
 *
 * Returns the items for the pantry write, in the order they first came.
 * Throws CatalogDataError, also `missing_id` when the catalog gave no id for
 * an item. The catalog and the pantry are separate modules, so new
 * ingredients stay when the pantry write fails afterwards.
 */
export async function commitConfirmations(items: readonly ConfirmItem[]): Promise<PantryItemSet[]> {
  const merged = mergeConfirmations(items);
  const ids = await commitIngredients(
    merged.map(({ ingredient }) =>
      ingredient.kind === "new"
        ? {
            text: ingredient.name,
            ingredient: {
              kind: "new",
              proposal: {
                name: ingredient.name,
                section: ingredient.section,
                location: ingredient.location,
                defaultUnit: ingredient.defaultUnit,
              },
            },
          }
        : { text: "", ingredient: { kind: "match", ingredientId: ingredient.ingredientId, confidence: "exact" } },
    ),
  );
  if (ids.length !== merged.length || ids.some((id) => id === null)) {
    throw new CatalogDataError("query_failed", "missing_id");
  }
  return mergePantrySets(
    merged.map(({ location, amount, unit }, index) => ({ ingredientId: ids[index]!, location, amount, unit })),
  );
}
