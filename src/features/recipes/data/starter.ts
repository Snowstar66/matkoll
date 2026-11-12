import "server-only";
import { parseStarterRecipe, type StarterListRow, type StarterPackEntry, type StarterRecipe, type StarterRoom } from "../domain/starter-recipe";
import { RecipeDataError, type RecipesDb } from "./client";

// Kom igång med recept (supabase/migrations/20261112120000_starter_recipes.sql). Every read of the
// pack and every copy goes through those functions with the signed-in user's session client: the
// pack's own table has no grant for any client, the members' functions answer only for the
// caller's household, and the owner's only for the app owner (is_app_owner()).

/** The pack in its order, with the household's own copy of each (starter_pack_list). Throws RecipeDataError. */
export async function listStarterIn(db: RecipesDb): Promise<StarterListRow[]> {
  const { data, error } = await db.rpc("starter_pack_list");
  if (error) throw new RecipeDataError(`starter_list_failed ${error.code}`);
  return data.map((row) => ({
    itemId: row.item_id,
    title: row.title,
    servings: row.original_servings,
    totalMinutes: row.total_minutes ?? null,
    imageUrl: row.image_url ?? null,
    hasImage: row.has_image === true,
    note: row.note ?? null,
    lineTexts: row.line_texts ?? [],
    copyId: row.copy_id ?? null,
  }));
}

/** One pack recipe, or `null` when it is not in the pack (get_starter_recipe). Throws RecipeDataError. */
export async function getStarterIn(db: RecipesDb, itemId: string): Promise<StarterRecipe | null> {
  const { data, error } = await db.rpc("get_starter_recipe", { item: itemId });
  if (error) throw new RecipeDataError(`starter_get_failed ${error.code}`);
  const recipe = parseStarterRecipe(data);
  if (data !== null && recipe === null) throw new RecipeDataError("invalid_row");
  return recipe;
}

/** The household's recipe count and the cap starter copies stop at (starter_recipe_room). Throws RecipeDataError. */
export async function starterRoomIn(db: RecipesDb): Promise<StarterRoom> {
  const { data, error } = await db.rpc("starter_recipe_room");
  if (error) throw new RecipeDataError(`starter_room_failed ${error.code}`);
  const row = data[0];
  if (!row) throw new RecipeDataError("missing_row");
  return { count: row.recipe_count, cap: row.recipe_cap };
}

/**
 * The household's copy of the pack recipe `itemId`, made now or the one it has (save_starter_recipe),
 * with `ingredientIds[i]` the household's own catalog ingredient of line i as of `version`.
 * "gone" when it is not in the pack, "changed" when its lines changed since `version`, "cap" when
 * the household has the recipe cap. Throws RecipeDataError.
 */
export async function saveStarterIn(
  db: RecipesDb,
  itemId: string,
  ingredientIds: readonly (string | null)[],
  version: string,
): Promise<{ id: string } | "gone" | "changed" | "cap"> {
  const { data, error } = await db.rpc("save_starter_recipe", {
    item: itemId,
    // The generated type says string[]; a line without an ingredient is null in the array.
    ingredient_ids: ingredientIds as string[],
    expected_version: version,
  });
  if (error) {
    if (error.code === "P0002") return "gone";
    if (error.code === "40001") return "changed";
    if (error.code === "54000") return "cap";
    throw new RecipeDataError(`starter_save_failed ${error.code}`);
  }
  if (!data) throw new RecipeDataError("missing_id");
  return { id: data };
}

/** The folder of a pack recipe's stored picture, or `null` (starter_image_folder). Throws RecipeDataError. */
export async function starterImageFolderIn(db: RecipesDb, itemId: string): Promise<string | null> {
  const { data, error } = await db.rpc("starter_image_folder", { item: itemId });
  if (error) throw new RecipeDataError(`starter_image_failed ${error.code}`);
  return data ?? null;
}

/** The household's starter copies and whether each is untouched (starter_copies). Throws RecipeDataError. */
export async function starterCopiesIn(db: RecipesDb): Promise<{ recipeId: string; untouched: boolean }[]> {
  const { data, error } = await db.rpc("starter_copies");
  if (error) throw new RecipeDataError(`starter_copies_failed ${error.code}`);
  return data.map((row) => ({ recipeId: row.recipe_id, untouched: row.untouched === true }));
}

/**
 * Deletes the household's untouched starter copies, all or those in `ids` (delete_untouched_starter_copies),
 * and gives each deleted one's id and picture folder. Throws RecipeDataError.
 */
export async function deleteUntouchedStarterIn(db: RecipesDb, ids: readonly string[] | null): Promise<{ id: string; folder: string | null }[]> {
  // The generated type says string[]; null means every untouched copy.
  const { data, error } = await db.rpc("delete_untouched_starter_copies", { recipe_ids: ids as string[] });
  if (error) throw new RecipeDataError(`starter_delete_failed ${error.code}`);
  return data.map((row) => ({ id: row.id, folder: row.image_path ?? null }));
}

/** Whether the signed-in user is the app's owner (is_app_owner()). Throws RecipeDataError. */
export async function isOwnerIn(db: RecipesDb): Promise<boolean> {
  const { data, error } = await db.rpc("is_app_owner");
  if (error) throw new RecipeDataError(`owner_failed ${error.code}`);
  return data === true;
}

/** The pack as the owner manages it (starter_pack_items); `null` for anyone but the owner. Throws RecipeDataError. */
export async function listStarterPackIn(db: RecipesDb): Promise<StarterPackEntry[] | null> {
  const { data, error } = await db.rpc("starter_pack_items");
  if (error) {
    if (error.code === "42501") return null;
    throw new RecipeDataError(`starter_pack_failed ${error.code}`);
  }
  return data.map((row) => ({
    itemId: row.item_id,
    recipeId: row.recipe_id,
    title: row.title,
    servings: row.original_servings,
    totalMinutes: row.total_minutes ?? null,
    imageUrl: row.image_url ?? null,
    imagePath: row.image_path ?? null,
    position: row.position,
    note: row.note ?? null,
    copies: row.copies,
  }));
}

/** What an owner's change of the pack gives: done, or why not. */
export type PackChange = "done" | "not_owner" | "missing" | "copy" | "full";

function packOutcome(error: { code?: string } | null, found: boolean): PackChange {
  if (!error) return found ? "done" : "missing";
  if (error.code === "42501") return "not_owner";
  if (error.code === "P0002") return "missing";
  if (error.code === "22023") return "copy";
  if (error.code === "54000") return "full";
  throw new RecipeDataError(`starter_pack_change_failed ${error.code}`);
}

/** "Lägg i startpaketet": the owner's own recipe last in the pack (starter_pack_add). Throws RecipeDataError. */
export async function addToPackIn(db: RecipesDb, recipeId: string): Promise<PackChange> {
  const { data, error } = await db.rpc("starter_pack_add", { pack_recipe: recipeId });
  return packOutcome(error, Boolean(data));
}

/** "Ta bort ur startpaketet" (starter_pack_remove). Throws RecipeDataError. */
export async function removeFromPackIn(db: RecipesDb, itemId: string): Promise<PackChange> {
  const { data, error } = await db.rpc("starter_pack_remove", { item: itemId });
  return packOutcome(error, data === true);
}

/** The item's note, null to remove it (starter_pack_set_note). Throws RecipeDataError. */
export async function setPackNoteIn(db: RecipesDb, itemId: string, note: string | null): Promise<PackChange> {
  // The generated type says string; null (or blank) removes the note.
  const { data, error } = await db.rpc("starter_pack_set_note", { item: itemId, item_note: note as string });
  return packOutcome(error, data === true);
}

/** One place up (-1) or down (+1) (starter_pack_move); "missing" also when it is already first or last. Throws RecipeDataError. */
export async function movePackItemIn(db: RecipesDb, itemId: string, step: -1 | 1): Promise<PackChange> {
  const { data, error } = await db.rpc("starter_pack_move", { item: itemId, step });
  return packOutcome(error, data === true);
}
