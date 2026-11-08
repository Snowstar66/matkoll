"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, commitIngredients, matchIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { getSharedIn, saveSharedIn } from "../data/shared";
import { sharedChoices, sharedMatchItems } from "../domain/shared-recipe";

const idSchema = z.guid();

/**
 * "Spara i mina recept" on a shared recipe, and the quiet copy before "Lägg på matsedeln" and
 * "Köp det som saknas" there (the meal plan and the shopping list hold only own recipes). Makes a
 * copy in the household, or gives the copy it already has (never two):
 *
 * 1. get_shared_recipe reads the recipe (only if it is still shared and not the household's own).
 * 2. Each line's ingredient is matched by NAME against the household's own catalog, and the ones it
 *    lacks are created, as an import does it (catalog.matchIngredients, commitIngredients; no AI).
 * 3. save_shared_recipe copies the recipe, its steps and lines in one transaction, with those ids,
 *    and remembers where it came from ("Delat av …", "Sparat av …").
 *
 * Returns the copy's id and its catalog ingredient for each line of the recipe as shown, in order,
 * so the page can put what is missing on the list against the copy. Fails with `unauthorized`,
 * `validation`, `recipe_shared_gone` (no longer shared) or `recipe_shared_save_failed`.
 */
export async function saveSharedRecipe(id: string): Promise<Result<{ id: string; ingredientIds: (string | null)[] }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!idSchema.safeParse(id).success) return fail("validation");
  try {
    const db = await createClient();
    const shared = await getSharedIn(db, id);
    if (!shared) return fail("recipe_shared_gone");
    const matches = await matchIngredients(sharedMatchItems(shared.lines));
    const ingredientIds = await commitIngredients(sharedChoices(shared.lines, matches));
    const copyId = shared.savedCopyId ?? (await saveSharedIn(db, id, ingredientIds));
    if (!copyId) return fail("recipe_shared_gone");
    revalidateFor("recipe");
    return ok({ id: copyId, ingredientIds });
  } catch (error) {
    if (error instanceof CatalogDataError) {
      console.error("recipe_shared_save_failed", { reason: `catalog_${error.code}` });
      return fail("recipe_shared_save_failed");
    }
    if (error instanceof RecipeDataError) {
      console.error("recipe_shared_save_failed", { reason: error.detail });
      return fail("recipe_shared_save_failed");
    }
    throw error;
  }
}
