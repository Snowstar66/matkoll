"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { setFavoriteIn } from "../data/favorite";
import { favoriteChangeSchema, type FavoriteChange } from "../domain/recipe-list";

/**
 * The heart (FR-9): makes the recipe a favourite or not. It sets the value
 * rather than flipping it, so two quick taps end where the last one points.
 * Another user's recipe, or one that is gone, changes nothing (RLS). Fails
 * with `unauthorized`, `validation` or `recipe_favorite_failed`.
 */
export async function setFavorite(change: FavoriteChange): Promise<Result<FavoriteChange>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = favoriteChangeSchema.safeParse(change);
  if (!parsed.success) return fail("validation");
  const { id, isFavorite } = parsed.data;

  try {
    const found = await setFavoriteIn(await createClient(), id, isFavorite);
    if (!found) {
      console.error("recipe_favorite_failed", { reason: "not_found" });
      return fail("recipe_favorite_failed");
    }
    revalidateFor("recipe");
    return ok({ id, isFavorite });
  } catch (error) {
    if (!(error instanceof RecipeDataError)) throw error;
    console.error("recipe_favorite_failed", { reason: error.detail });
    return fail("recipe_favorite_failed");
  }
}
