"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, commitIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { savedRecipeRefsIn, updateRecipeIn } from "../data/update";
import { hasOnlySavedIds, lineChoices } from "../domain/editable-draft";
import { recipeDraftSchema, type RecipeDraft } from "../domain/recipe-draft";

const recipeIdSchema = z.uuid();
const updatedAtSchema = z.iso.datetime({ offset: true });

/**
 * "Spara ändringar" in Ändra recept (Story 1.11): the only way a saved recipe
 * changes (AD-2, AD-10). `updatedAt` is SavedRecipe.updatedAt as the form read
 * it; a recipe that has changed since gives `recipe_conflict` and nothing is
 * written.
 *
 * Before anything is written, the saved recipe is read: it must be the user's,
 * unchanged since the form was filled, and every line and step id in the
 * draft must be one of its own. Then the catalog creates new ingredients and
 * saves a line Pontus linked to another ingredient as a synonym (AD-6); a
 * line whose ingredient did not change saves none. Last, update_recipe
 * changes the recipe, its steps and lines in one transaction, keeping the
 * ids of the lines and steps that remain. The catalog and the recipe are
 * separate modules (AD-1): if the recipe goes away between the commit and
 * the update, the commit's new ingredients and synonyms stay.
 *
 * Fails with `unauthorized`, `validation`, `recipe_conflict`,
 * `recipe_conflicting_links` (two lines with the same text linked to
 * different ingredients) or `recipe_save_failed`.
 */
export async function updateRecipe(id: string, draft: RecipeDraft, updatedAt: string): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = recipeDraftSchema.safeParse(draft);
  if (!parsed.success || !recipeIdSchema.safeParse(id).success || !updatedAtSchema.safeParse(updatedAt).success) {
    return fail("validation");
  }
  const valid = parsed.data;

  try {
    const db = await createClient();
    const saved = await savedRecipeRefsIn(db, id);
    if (!saved) {
      console.error("recipe_save_failed", { reason: "not_found" });
      return fail("recipe_save_failed");
    }
    if (saved.updatedAt !== updatedAt) return fail("recipe_conflict");
    if (!hasOnlySavedIds(valid, saved)) {
      console.error("recipe_save_failed", { reason: "foreign_ids" });
      return fail("validation");
    }
    const ingredientIds = await commitIngredients(lineChoices(valid.lines, saved.lines));
    const outcome = await updateRecipeIn(db, id, valid, ingredientIds, updatedAt);
    if (outcome === "conflict") return fail("recipe_conflict");
    if (outcome === "not_found") {
      console.error("recipe_save_failed", { reason: "gone_after_commit" });
      return fail("recipe_save_failed");
    }
    revalidateFor("recipe");
    return ok({ id });
  } catch (error) {
    if (error instanceof CatalogDataError) {
      if (error.code === "conflicting_synonyms") return fail("recipe_conflicting_links");
      console.error("recipe_save_failed", { reason: `catalog_${error.code}` });
      return fail("recipe_save_failed");
    }
    if (error instanceof RecipeDataError) {
      console.error("recipe_save_failed", { reason: error.detail });
      return fail("recipe_save_failed");
    }
    throw error;
  }
}
