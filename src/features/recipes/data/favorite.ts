import "server-only";
import { RecipeDataError, type RecipesDb } from "./client";

/**
 * Marks the recipe `id` as a favourite or not. RLS limits the update to the
 * signed-in user's household (Story 21.2a: favourites are the household's).
 * Returns false when the household has no recipe with that id, and then
 * nothing changes. Throws RecipeDataError when the update fails.
 */
export async function setFavoriteIn(db: RecipesDb, id: string, isFavorite: boolean): Promise<boolean> {
  const { data, error } = await db
    .from("recipe")
    .update({ is_favorite: isFavorite })
    .eq("id", id)
    .select("id");
  if (error) throw new RecipeDataError(`update_failed ${error.code}`);
  return data.length > 0;
}
