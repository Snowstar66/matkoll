import "server-only";
import { recipeImageBucket, recipeImageFile, type RecipeImageSize } from "../domain/recipe-image";
import { RecipeDataError, type RecipesDb } from "./client";

// Every call to the bucket recipe-images and to recipe.image_path is here
// (20261112100000_recipe_images.sql). Every function takes the signed-in
// user's session client, never an admin client, so the bucket's policies and
// RLS limit it to the household's own files and rows (AD-4). A file is never
// overwritten (`upsert: false`), never given a public or signed URL, and never
// deleted with SQL: remove() goes through the Storage API. Errors carry only
// a fixed reason and a status or Postgres code, never a path or an address.

/** The status of a Storage error, without its message (which may name the path). */
function statusOf(error: { status?: number; statusCode?: string }): string {
  return String(error.statusCode ?? error.status ?? "unknown");
}

/** RecipeDataError's detail for an upload that Storage refused by a policy (401, 403): not the household's, or the cap. */
export const imageUploadRefusedDetail = "image_upload_refused";

/** What a recipe's image needs to be stored: its household, its address on the other site and where its own copy is. */
export type RecipeImageState = { householdId: string; imageUrl: string | null; imagePath: string | null };

/** The household's recipe `id`, or `null` when it is not the household's (RLS). Throws RecipeDataError. */
export async function getImageStateIn(db: RecipesDb, id: string): Promise<RecipeImageState | null> {
  const { data, error } = await db.from("recipe").select("household_id, image_url, image_path").eq("id", id).maybeSingle();
  if (error) throw new RecipeDataError(`image_state_failed ${error.code}`);
  return data ? { householdId: data.household_id, imageUrl: data.image_url, imagePath: data.image_path } : null;
}

/**
 * Whether the household has room for another file (recipe_image_room_in_my_household):
 * `false` at the cap, where Storage refuses an upload. `null` when it cannot be read. Never throws.
 */
export async function imageRoomIn(db: RecipesDb): Promise<boolean | null> {
  try {
    const { data, error } = await db.rpc("recipe_image_room_in_my_household");
    return error ? null : data === true;
  } catch {
    return null;
  }
}

/** Uploads WebP bytes to `path`, never over an existing file. Throws RecipeDataError. */
export async function uploadImageIn(db: RecipesDb, path: string, bytes: Uint8Array): Promise<void> {
  try {
    const { error } = await db.storage.from(recipeImageBucket).upload(path, bytes, { contentType: "image/webp", upsert: false });
    if (!error) return;
    const status = statusOf(error);
    if (status === "401" || status === "403") throw new RecipeDataError(imageUploadRefusedDetail);
    throw new RecipeDataError(`image_upload_failed ${status}`);
  } catch (error) {
    if (error instanceof RecipeDataError) throw error;
    throw new RecipeDataError("image_upload_threw");
  }
}

/** Removes the files at `paths` with the Storage API; a path that is not there is not an error. Throws RecipeDataError. */
export async function removeImagesIn(db: RecipesDb, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    const { error } = await db.storage.from(recipeImageBucket).remove([...paths]);
    if (error) throw new RecipeDataError(`image_remove_failed ${statusOf(error)}`);
  } catch (error) {
    if (error instanceof RecipeDataError) throw error;
    throw new RecipeDataError("image_remove_threw");
  }
}

/** Sets the recipe's own picture (its folder), once: a recipe that has one is left as it is. `false` when nothing was set. Throws RecipeDataError. */
export async function setImagePathIn(db: RecipesDb, id: string, folder: string): Promise<boolean> {
  const { data, error } = await db.from("recipe").update({ image_path: folder }).eq("id", id).is("image_path", null).select("id");
  if (error) throw new RecipeDataError(`image_path_failed ${error.code}`);
  return data.length > 0;
}

/** One stored file, or `null` when there is none or it cannot be read (RLS and the bucket's policies give only the household's own). Never throws. */
export async function downloadImageIn(db: RecipesDb, folder: string, size: RecipeImageSize): Promise<Blob | null> {
  try {
    const { data, error } = await db.storage.from(recipeImageBucket).download(recipeImageFile(folder, size));
    return error ? null : data;
  } catch {
    return null;
  }
}

/** The recipe's stored folder (image_path) for a route, or `null` (not the household's, or no copy). Throws RecipeDataError. */
export async function imageFolderOf(db: RecipesDb, id: string): Promise<string | null> {
  const { data, error } = await db.from("recipe").select("image_path").eq("id", id).maybeSingle();
  if (error) throw new RecipeDataError(`image_folder_failed ${error.code}`);
  return data?.image_path ?? null;
}

/** The recipes that have an image address and no copy of their own yet, newest first, not those in `exclude`. Throws RecipeDataError. */
export async function recipesWithoutImageIn(db: RecipesDb, exclude: readonly string[], limit: number): Promise<string[]> {
  let query = db.from("recipe").select("id").is("image_path", null).not("image_url", "is", null);
  if (exclude.length > 0) query = query.not("id", "in", `(${exclude.join(",")})`);
  const { data, error } = await query.order("created_at", { ascending: false }).order("id").limit(limit);
  if (error) throw new RecipeDataError(`images_missing_failed ${error.code}`);
  return data.map((row) => row.id);
}

/** How many recipes have an image address and no copy of their own. Throws RecipeDataError. */
export async function countWithoutImageIn(db: RecipesDb): Promise<number> {
  const { count, error } = await db.from("recipe").select("id", { count: "exact", head: true }).is("image_path", null).not("image_url", "is", null);
  if (error) throw new RecipeDataError(`images_count_failed ${error.code}`);
  return count ?? 0;
}

/** How many recipes have a copy of their own. Throws RecipeDataError. */
export async function countWithImageIn(db: RecipesDb): Promise<number> {
  const { count, error } = await db.from("recipe").select("id", { count: "exact", head: true }).not("image_path", "is", null);
  if (error) throw new RecipeDataError(`images_count_failed ${error.code}`);
  return count ?? 0;
}

/** The household's files no recipe points at, uploaded more than 10 minutes ago (recipe_image_orphans); at most 100. Throws RecipeDataError. */
export async function orphanImagesIn(db: RecipesDb): Promise<string[]> {
  const { data, error } = await db.rpc("recipe_image_orphans", { min_age: "10 minutes" });
  if (error) throw new RecipeDataError(`images_orphans_failed ${error.code}`);
  return data ?? [];
}
