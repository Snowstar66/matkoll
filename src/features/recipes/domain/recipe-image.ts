// Recipe pictures in the app's own storage (AD-15 changed for recipe images,
// docs/beslutslogg.md; 20261112100000_recipe_images.sql). When a recipe is
// saved the server fetches the picture its image_url points at once and keeps
// a full size and a thumbnail in the private bucket recipe-images. Pure.

export const recipeImageBucket = "recipe-images";

/**
 * The most files a household keeps in the bucket (recipe_image_household_cap in
 * 20261112100000_recipe_images.sql): a full size and a thumbnail per recipe, so
 * 400 recipes. At the cap a recipe is still saved, with its image address only.
 */
export const recipeImageHouseholdCap = 800;

/** The bucket's size limit per file, as in the migration (1.5 MB). */
export const recipeImageMaxFileBytes = 1.5 * 1024 * 1024;

/** What the server stores: WebP (the bucket also lets JPEG through). */
export const recipeImageMediaTypes = ["image/jpeg", "image/webp"] as const;

export const recipeImageSizes = ["full", "thumb"] as const;
export type RecipeImageSize = (typeof recipeImageSizes)[number];

/** The longest side of each stored size, in pixels. */
export const recipeImageSides: Record<RecipeImageSize, number> = { full: 1200, thumb: 640 };

/** The folder of a recipe's files, as recipe_image_path_check has it: <household id>/<recipe id>. */
export function recipeImageFolder(householdId: string, recipeId: string): string {
  return `${householdId}/${recipeId}`;
}

/** The path of one stored file in the bucket. */
export function recipeImageFile(folder: string, size: RecipeImageSize): string {
  return `${folder}/${size}`;
}

/** The app's own route for a stored picture (src/app/api/recipe-image), signed-in members only. */
export function recipeImageRoute(recipeId: string, size: RecipeImageSize): string {
  return `/api/recipe-image/${recipeId}/${size}`;
}

/**
 * The address to show a recipe's picture from: the app's own copy when the
 * recipe has one (`imagePath` set), otherwise the address on the other site as
 * before, otherwise none. Lists use the thumbnail, the recipe view the full size.
 */
export function recipeImageSrc(
  recipe: { id: string; imagePath?: string | null; imageUrl: string | null },
  size: RecipeImageSize,
): string | null {
  return recipe.imagePath ? recipeImageRoute(recipe.id, size) : recipe.imageUrl;
}

/** The status of a stored picture's attempt, for the backfill's counts. */
export type StoreImageOutcome = "stored" | "skipped" | "failed" | "cap";
