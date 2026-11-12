"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, commitIngredients, matchIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { copyLinesIn, getSharedIn, saveSharedIn } from "../data/shared";
import { copyLineIngredients, sharedChoices, sharedMatchItems } from "../domain/shared-recipe";
import { storeRecipeImage } from "./store-recipe-image";

const idSchema = z.guid();
const versionSchema = z.string().max(100).optional();

/**
 * "Spara i mina recept" on a shared recipe, and the quiet copy before "Lägg på matsedeln" and
 * "Köp det som saknas" there (the meal plan and the shopping list hold only own recipes). Makes a
 * copy in the household, or gives the copy it already has (never two):
 *
 * 1. get_shared_recipe reads the recipe (only if it is still shared and not the household's own).
 *    `version` is the one the page showed: when the lines changed since, nothing is saved.
 * 2. A copy saved before is given back with its own lines' ingredients; nothing is written.
 * 3. Otherwise each line's ingredient is matched by NAME against the household's own catalog, and
 *    the ones it lacks are created, as an import does it (catalog.matchIngredients,
 *    commitIngredients; no AI), and save_shared_recipe copies the recipe, its steps and lines in
 *    one transaction with those ids, refusing when the lines changed in between.
 *
 * Returns the copy's id and its catalog ingredient for each line of the recipe as shown, in order.
 * Fails with `unauthorized`, `validation`, `recipe_shared_gone` (no longer shared),
 * `recipe_shared_changed` (the lines changed: show the recipe again) or `recipe_shared_save_failed`.
 */
export async function saveSharedRecipe(id: string, version?: string): Promise<Result<{ id: string; ingredientIds: (string | null)[] }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!idSchema.safeParse(id).success || !versionSchema.safeParse(version).success) return fail("validation");
  try {
    const db = await createClient();
    const shared = await getSharedIn(db, id);
    if (!shared) return fail("recipe_shared_gone");
    if (version !== undefined && version !== shared.version) return fail("recipe_shared_changed");
    if (shared.savedCopyId) {
      // A copy saved before the pictures were kept (or whose picture could not be fetched) gets its own copy now.
      await storeRecipeImage(db, shared.savedCopyId);
      const ingredientIds = copyLineIngredients(shared.lines, await copyLinesIn(db, shared.savedCopyId));
      return ok({ id: shared.savedCopyId, ingredientIds });
    }
    const matches = await matchIngredients(sharedMatchItems(shared.lines));
    const ingredientIds = await commitIngredients(sharedChoices(shared.lines, matches));
    const saved = await saveSharedIn(db, id, ingredientIds, shared.version);
    if (saved === "gone") return fail("recipe_shared_gone");
    if (saved === "changed") return fail("recipe_shared_changed");
    // The copy has the original's image address (https only): its picture is fetched into this
    // household's own storage, never read from the other household's folder (the bucket is closed
    // to other households). A picture that cannot be fetched never fails the save (never throws).
    await storeRecipeImage(db, saved.id);
    revalidateFor("recipe");
    return ok({ id: saved.id, ingredientIds });
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
