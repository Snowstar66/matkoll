import "server-only";
import { parseSharedRecipe, type SharedListRow, type SharedRecipe } from "../domain/shared-recipe";
import { RecipeDataError, type RecipesDb } from "./client";

// Delade recept (supabase/migrations/20261108190000_shared_recipes.sql). Every
// read and write across households goes through those security definer
// functions; sharing one's own recipe is an update of one's own row under RLS.

/** The recipes other households share, newest first (list_shared_recipes). Throws RecipeDataError. */
export async function listSharedIn(db: RecipesDb): Promise<SharedListRow[]> {
  const { data, error } = await db.rpc("list_shared_recipes");
  if (error) throw new RecipeDataError(`shared_list_failed ${error.code}`);
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    originalServings: row.original_servings,
    totalMinutes: row.total_minutes ?? null,
    imageUrl: row.image_url ?? null,
    householdName: row.household_name,
    createdAt: row.created_at,
    savedCopyId: row.saved_copy_id ?? null,
    lineTexts: row.line_texts ?? [],
  }));
}

/** One shared recipe, or `null` when it is not shared, the caller's own or gone (get_shared_recipe). Throws RecipeDataError. */
export async function getSharedIn(db: RecipesDb, id: string): Promise<SharedRecipe | null> {
  const { data, error } = await db.rpc("get_shared_recipe", { shared_recipe_id: id });
  if (error) throw new RecipeDataError(`shared_get_failed ${error.code}`);
  const recipe = parseSharedRecipe(data);
  if (data !== null && recipe === null) throw new RecipeDataError("invalid_row");
  return recipe;
}

/**
 * The household's copy of the shared recipe `id`, made now or the one saved before
 * (save_shared_recipe), with `ingredientIds[i]` the household's own catalog ingredient of the
 * original's line i, as of `version` (get_shared_recipe's). "gone" when the recipe is no longer
 * shared, "changed" when its lines changed since `version`. Throws RecipeDataError.
 */
export async function saveSharedIn(
  db: RecipesDb,
  id: string,
  ingredientIds: readonly (string | null)[],
  version: string,
): Promise<{ id: string } | "gone" | "changed"> {
  const { data, error } = await db.rpc("save_shared_recipe", {
    shared_recipe_id: id,
    // The generated type says string[]; a line without an ingredient is null in the array.
    ingredient_ids: ingredientIds as string[],
    expected_version: version,
  });
  if (error) {
    if (error.code === "P0002") return "gone";
    if (error.code === "40001") return "changed";
    throw new RecipeDataError(`shared_save_failed ${error.code}`);
  }
  if (!data) throw new RecipeDataError("missing_id");
  return { id: data };
}

/** The lines of the household's own recipe `id` (a saved copy), in order: text and catalog ingredient. Throws RecipeDataError. */
export async function copyLinesIn(db: RecipesDb, id: string): Promise<{ originalText: string; ingredientId: string | null }[]> {
  const { data, error } = await db.from("recipe_ingredient").select("original_text, ingredient_id").eq("recipe_id", id).order("position");
  if (error) throw new RecipeDataError(`query_failed ${error.code}`);
  return data.map((line) => ({ originalText: line.original_text, ingredientId: line.ingredient_id }));
}

/** The names of the other households that saved a copy of the household's recipe `id` (shared_recipe_savers). Throws RecipeDataError. */
export async function saversIn(db: RecipesDb, id: string): Promise<string[]> {
  const { data, error } = await db.rpc("shared_recipe_savers", { own_recipe_id: id });
  if (error) throw new RecipeDataError(`shared_savers_failed ${error.code}`);
  return data ?? [];
}

/** Shares the household's recipe `id`, or stops; false when the household has no such recipe. Throws RecipeDataError. */
export async function setSharedIn(db: RecipesDb, id: string, shared: boolean): Promise<boolean> {
  const { data, error } = await db.from("recipe").update({ is_shared: shared }).eq("id", id).select("id");
  if (error) throw new RecipeDataError(`update_failed ${error.code}`);
  return data.length > 0;
}

/** Tillval: dela alla, and how many of the household's recipes are shared (recipe_sharing). Throws RecipeDataError. */
export async function sharingIn(db: RecipesDb): Promise<{ shareAll: boolean; sharedCount: number }> {
  const { data, error } = await db.rpc("recipe_sharing");
  if (error) throw new RecipeDataError(`sharing_failed ${error.code}`);
  const row = data[0];
  return { shareAll: row?.share_all ?? false, sharedCount: row?.shared_count ?? 0 };
}

/** "Dela alla mina recept" on or off (set_recipe_share_all); how many are shared after. Throws RecipeDataError. */
export async function setShareAllIn(db: RecipesDb, share: boolean): Promise<number> {
  const { data, error } = await db.rpc("set_recipe_share_all", { share });
  if (error) throw new RecipeDataError(`share_all_failed ${error.code}`);
  return data;
}

/** "Sluta dela alla" (stop_sharing_recipes); how many stopped. Throws RecipeDataError. */
export async function stopSharingIn(db: RecipesDb): Promise<number> {
  const { data, error } = await db.rpc("stop_sharing_recipes");
  if (error) throw new RecipeDataError(`stop_sharing_failed ${error.code}`);
  return data;
}
