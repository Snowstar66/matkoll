import "server-only";
import { fetchRecipeImage } from "@/server/fetch";
import { makeRecipePictures } from "@/server/images";
import { RecipeDataError, type RecipesDb } from "../data/client";
import {
  downloadImageIn,
  getImageStateIn,
  imageRoomIn,
  imageUploadRefusedDetail,
  orphanImagesIn,
  removeImagesIn,
  setImagePathIn,
  uploadImageIn,
} from "../data/image";
import { recipeImageFile, recipeImageFolder, type StoreImageOutcome } from "../domain/recipe-image";

// Keeps a recipe's picture in the app's own storage (recipe-images,
// 20261112100000_recipe_images.sql). Not a Server Action: saveRecipe,
// saveSharedRecipe and the backfill call it after the recipe is saved. It
// never changes the recipe's text, and it never fails the save: when the
// picture cannot be fetched or kept, the recipe keeps its image address (and
// is shown from it, as before) and the reason is logged (a fixed reason, never
// the address or what the other site sent).

function note(reason: string): void {
  console.warn("recipe_image_not_stored", { reason });
}

/**
 * Fetches the picture of the household's recipe `recipeId` from its image
 * address and keeps a full size and a thumbnail in the household's folder of
 * the bucket, then points recipe.image_path at them. Does nothing for a recipe
 * that has no image address or already has its own copy (so it can run again,
 * and never makes two). `signal` stops the fetch. Gives `stored`, `skipped`
 * (nothing to do), `cap` (the household's files are at the cap) or `failed`.
 * Never throws.
 */
export async function storeRecipeImage(
  db: RecipesDb,
  recipeId: string,
  options: { signal?: AbortSignal } = {},
): Promise<StoreImageOutcome> {
  let uploaded: string[] = [];
  try {
    const state = await getImageStateIn(db, recipeId);
    if (!state || state.imagePath || !state.imageUrl) return "skipped";

    if ((await imageRoomIn(db)) === false) {
      note("cap");
      return "cap";
    }

    const fetched = await fetchRecipeImage(state.imageUrl, options);
    if (!fetched.ok) {
      note(`fetch_${fetched.reason}`);
      return "failed";
    }
    const pictures = await makeRecipePictures(fetched.bytes);
    if (!pictures.ok) {
      note(`picture_${pictures.reason}`);
      return "failed";
    }

    const folder = recipeImageFolder(state.householdId, recipeId);
    const files = [
      { path: recipeImageFile(folder, "full"), bytes: pictures.full.bytes },
      { path: recipeImageFile(folder, "thumb"), bytes: pictures.thumb.bytes },
    ];
    // Files left by an earlier attempt that was cut off between its upload and its row.
    await removeImagesIn(db, files.map((file) => file.path));
    for (const file of files) {
      await uploadImageIn(db, file.path, file.bytes);
      uploaded.push(file.path);
    }
    await setImagePathIn(db, recipeId, folder);
    uploaded = [];
    return "stored";
  } catch (error) {
    const detail = error instanceof RecipeDataError ? error.detail : "unexpected";
    note(detail);
    // Whatever was uploaded without a row pointing at it is removed now; the orphan sweep takes what this misses.
    if (uploaded.length > 0) await removeImagesIn(db, uploaded).catch(() => {});
    return detail === imageUploadRefusedDetail ? "cap" : "failed";
  }
}

/**
 * Startrecept: copies the stored picture of a pack recipe (`sourceFolder`, the owner's folder,
 * which every signed-in member may read: recipe_images_starter_select) into the household's own
 * folder for its copy `recipeId`, both sizes as they are (they were made by this server), and points
 * the copy's image_path at them. Without a stored picture to copy, or when it cannot be read, the
 * picture is fetched from the copy's image address instead (storeRecipeImage). Never throws, and
 * never fails the copy: at worst the copy shows its image address or a drawing.
 */
export async function copyStarterImage(db: RecipesDb, recipeId: string, sourceFolder: string | null): Promise<StoreImageOutcome> {
  let uploaded: string[] = [];
  try {
    if (sourceFolder) {
      const state = await getImageStateIn(db, recipeId);
      if (!state || state.imagePath) return "skipped";
      if ((await imageRoomIn(db)) === false) {
        note("cap");
        return "cap";
      }
      const [full, thumb] = await Promise.all([downloadImageIn(db, sourceFolder, "full"), downloadImageIn(db, sourceFolder, "thumb")]);
      // Only what this server wrote (WebP) is copied as it is; anything else is fetched and made again below.
      if (full && thumb && full.type === "image/webp" && thumb.type === "image/webp") {
        const folder = recipeImageFolder(state.householdId, recipeId);
        const files = [
          { path: recipeImageFile(folder, "full"), bytes: new Uint8Array(await full.arrayBuffer()) },
          { path: recipeImageFile(folder, "thumb"), bytes: new Uint8Array(await thumb.arrayBuffer()) },
        ];
        await removeImagesIn(db, files.map((file) => file.path));
        for (const file of files) {
          await uploadImageIn(db, file.path, file.bytes);
          uploaded.push(file.path);
        }
        await setImagePathIn(db, recipeId, folder);
        uploaded = [];
        return "stored";
      }
      note("starter_source_unreadable");
    }
  } catch (error) {
    const detail = error instanceof RecipeDataError ? error.detail : "unexpected";
    note(`starter_${detail}`);
    if (uploaded.length > 0) await removeImagesIn(db, uploaded).catch(() => {});
    if (detail === imageUploadRefusedDetail) return "cap";
  }
  return storeRecipeImage(db, recipeId);
}

/**
 * The folder of the household's recipe `recipeId`'s own copy (image_path), read
 * before the recipe is deleted; `null` when there is none or it cannot be read.
 * Never throws.
 */
export async function recipeImageFolderOf(db: RecipesDb, recipeId: string): Promise<string | null> {
  try {
    return (await getImageStateIn(db, recipeId))?.imagePath ?? null;
  } catch {
    return null;
  }
}

/**
 * Removes the files in a recipe's folder with the Storage API, after the
 * recipe's row is deleted (SQL never deletes files). Never throws: a file that
 * stays is found by the orphan sweep.
 */
export async function removeRecipeImages(db: RecipesDb, folder: string | null): Promise<void> {
  if (!folder) return;
  try {
    await removeImagesIn(db, [recipeImageFile(folder, "full"), recipeImageFile(folder, "thumb")]);
  } catch (error) {
    note(`remove_${error instanceof RecipeDataError ? error.detail : "unexpected"}`);
  }
}

/** Removes the household's files that no recipe points at (a cut-off save, a recipe removed some other way). Never throws. */
export async function sweepRecipeImages(db: RecipesDb): Promise<void> {
  try {
    await removeImagesIn(db, await orphanImagesIn(db));
  } catch (error) {
    note(`sweep_${error instanceof RecipeDataError ? error.detail : "unexpected"}`);
  }
}
