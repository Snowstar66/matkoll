import "server-only";
import { RecipeDataError, type RecipesDb } from "./client";

/**
 * Marks the recipe `id` of the user `userId` as a favourite or not. The
 * update filters on both, and RLS limits it to the signed-in user's rows too.
 * Returns false when the user has no recipe with that id, and then nothing
 * changes. Throws RecipeDataError when the update fails.
 */
export async function setFavoriteIn(db: RecipesDb, userId: string, id: string, isFavorite: boolean): Promise<boolean> {
  const { data, error } = await db
    .from("recipe")
    .update({ is_favorite: isFavorite })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id");
  if (error) throw new RecipeDataError(`update_failed ${error.code}`);
  return data.length > 0;
}
