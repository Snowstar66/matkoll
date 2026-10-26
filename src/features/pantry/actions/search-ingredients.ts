"use server";

import { requireUser } from "@/features/auth/server";
import type { IngredientDefaults, IngredientSearchHit } from "@/features/catalog";
import { CatalogDataError, getIngredientDefaults, matchIngredients, searchIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { collapseName } from "../domain/pantry-item-form";

/**
 * A catalog hit with what the catalog suggests for it; `defaults` is null if
 * the ingredient is gone. `exact` when the typed text, normalised, is its
 * name or one of its synonyms, so it is no new ingredient.
 */
export type PantryIngredientHit = IngredientSearchHit & { defaults: IngredientDefaults | null; exact: boolean };

/**
 * Searches the catalog while Pontus types in the sheet Lagervara (AD-1: a
 * search* action), with each hit's location, section and default unit, so
 * choosing one can suggest where it is kept and its unit (FR-11), and with
 * whether the text is its name or a synonym (catalog.matchIngredients, the
 * same rule that keeps the catalog free of duplicates). The catalog's
 * searchIngredients does the search; at most 20 hits, best first.
 * Fails like it: `unauthorized`, `validation` or `catalog_unavailable`.
 */
export async function searchPantryIngredients(query: string): Promise<Result<PantryIngredientHit[]>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const found = await searchIngredients(query);
  if (!found.ok) return found;
  if (found.data.length === 0) return ok([]);
  try {
    const [defaults, [match]] = await Promise.all([
      getIngredientDefaults(found.data.map((hit) => hit.id)),
      matchIngredients([{ text: collapseName(query) }]),
    ]);
    const exactId = match?.kind === "match" ? match.ingredientId : null;
    return ok(found.data.map((hit) => ({ ...hit, defaults: defaults[hit.id] ?? null, exact: hit.id === exactId })));
  } catch (error) {
    if (!(error instanceof CatalogDataError)) throw error;
    console.error("catalog_unavailable", { reason: error.code, detail: error.detail });
    return fail("catalog_unavailable");
  }
}
