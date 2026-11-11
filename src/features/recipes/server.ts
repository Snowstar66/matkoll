import "server-only";
import { cache } from "react";
import { z } from "zod";
import { CatalogDataError, getIngredientNames, matchIngredients } from "@/features/catalog/server";
import { snapshotFor, type PantrySnapshot, type SelectedSite, type StapleRules } from "@/features/pantry";
import { getPantryForStatus } from "@/features/pantry/server";
import { createClient } from "@/lib/supabase/server";
import {
  getRecipe as getRecipeIn,
  getRecipesByIdsIn,
  listRecipeTitlesIn,
  listRecipes as listRecipesIn,
  type ListOptions,
} from "./data/queries";
import { countWithImageIn, countWithoutImageIn, downloadImageIn, imageFolderOf } from "./data/image";
import type { RecipeImageSize } from "./domain/recipe-image";
import { missingNames } from "./data/missing-names";
import { getSharedIn, listSharedIn, saversIn, sharingIn } from "./data/shared";
import {
  toLibrary,
  withStatus,
  type RecipeLibrary,
  type RecipeListItem,
  type RecipeListRow,
} from "./domain/recipe-list";
import type { SavedRecipe } from "./domain/saved-recipe";
import { sharedMatchItems, toSharedListItems, toSharedView, type SharedListItem } from "./domain/shared-recipe";

// Server-only entry (AD-1): read functions and server functions for AI flows.
export { saveRecipe } from "./actions/save-recipe";
export { importRecipe, prepareImport, type ImportContext } from "./actions/import-recipe";

/**
 * Server Action for searching the library while typing. A page passes it to a
 * client component of another module (Lägg till rätt in Matsedel), which
 * cannot import this module's actions (AD-1).
 */
export { searchRecipes } from "./actions/search-recipes";

/** What getRecipe throws when Supabase fails; never user data. */
export { RecipeDataError } from "./data/client";

const recipeIdSchema = z.guid();

/**
 * The signed-in user's recipe with steps, lines and ingredient names, or
 * `null` for an id that is not a uuid or not one of the user's recipes. For
 * pages, after requireUserOrRedirect, inside <Suspense> (AD-18). Memoised per
 * request, so the page and its metadata read the recipe once.
 */
export const getRecipe = cache(async (id: string): Promise<SavedRecipe | null> => {
  if (!recipeIdSchema.safeParse(id).success) return null;
  return getRecipeIn(await createClient(), id, getIngredientNames);
});

/**
 * The signed-in user's recipes as library rows, newest first, each with its
 * status against the pantry for its own servings ("Kan lagas nu" or "Saknar N
 * varor", AD-7), or without a status when the pantry cannot be read; only
 * favourites with `favoritesOnly`. For pages, after requireUserOrRedirect,
 * inside <Suspense> (AD-18). Throws RecipeDataError.
 */
export async function listRecipes(options?: ListOptions): Promise<RecipeListItem[]> {
  const [rows, { snapshot, staples }] = await Promise.all([listRecipesIn(await createClient(), options), getPantryForStatus()]);
  return withStatus(rows, snapshot, await missingNames(rows, snapshot, staples), staples);
}

/**
 * The library for the Recept page: listRecipes' rows, whether the pantry
 * could not be read, so Kan lagas nu can say why it does not rank them, and
 * the place the status was counted against, for the line "Boende: Stugan"
 * (AD-24). For pages, after requireUserOrRedirect, inside <Suspense>
 * (AD-18). Throws RecipeDataError.
 */
export async function listLibrary(): Promise<RecipeLibrary> {
  return (await listLibraryWithRows()).library;
}

/**
 * listLibrary and the rows with their lines it was made from, so a page that needs the lines too
 * (the nutrition filter) does not read the library a second time. Throws RecipeDataError.
 */
export async function listLibraryWithRows(): Promise<{ library: RecipeLibrary; rows: RecipeListRow[] }> {
  const [rows, { snapshot, site, staples }] = await Promise.all([listRecipesIn(await createClient()), getPantryForStatus()]);
  return { library: toLibrary(rows, snapshot, site, await missingNames(rows, snapshot, staples), staples), rows };
}

/**
 * The recipe (as getRecipe) and the signed-in user's pantry for its
 * ingredients, for the recipe view, which counts the status for the chosen
 * servings in the browser (AD-7); only the recipe's own ingredients go to the
 * browser. An id that is not a uuid is `null` at once, without reading
 * anything; for a uuid the recipe and the pantry are read in parallel.
 * `snapshot` is `null` when the pantry cannot be read (logged as
 * `pantry_unavailable`), and then `site` is `null` too: the recipe is shown
 * without status and without the line. `site` is the place the pantry is of
 * (pantry.getPantryForStatus), for "Boende: Stugan" under "X av Y hemma"
 * (AD-24). `staples` are the household's Basvaror, which count as at home
 * (pantry.isStaple). `null` for a
 * recipe getRecipe does not find. Throws RecipeDataError.
 */
export async function getRecipeWithPantry(
  id: string,
): Promise<{
  recipe: SavedRecipe;
  snapshot: PantrySnapshot | null;
  site: SelectedSite | null;
  staples: StapleRules;
} | null> {
  if (!recipeIdSchema.safeParse(id).success) return null;
  const [recipe, { snapshot, site, staples }] = await Promise.all([getRecipe(id), getPantryForStatus()]);
  if (!recipe) return null;
  return {
    recipe,
    snapshot: snapshot ? snapshotFor(snapshot, recipe.lines.map((line) => line.ingredientId)) : null,
    site,
    staples,
  };
}

/**
 * The signed-in user's recipes among `ids`, each with its title, image, time,
 * own servings and the lines its status is counted from (`ingredientId`,
 * `amount`, `unit`, `isVague`), for the meal plan and the shopping list
 * (AD-1). Ids that are not the user's recipes are left out; the order is not
 * kept. Throws RecipeDataError.
 */
export async function getRecipesByIds(ids: readonly string[]): Promise<RecipeListRow[]> {
  return getRecipesByIdsIn(await createClient(), ids);
}

/**
 * How many of the signed-in user's recipes use each catalog ingredient (by
 * id), for "Veckans bästa butik" (Story 9.14). One read of the library's
 * rows, which the library page reads anyway. Throws RecipeDataError.
 */
export async function getIngredientRecipeCounts(): Promise<Map<string, number>> {
  const rows = await listRecipesIn(await createClient());
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const id of new Set(row.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])))) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * The signed-in user's whole library as rows with their lines, newest first,
 * for the ranking of own recipes against offers (Story 16.3). For server
 * code after requireUser. Throws RecipeDataError.
 */
export async function listRecipeRows(): Promise<RecipeListRow[]> {
  return listRecipesIn(await createClient());
}

/**
 * The household's recipes as id and title only, newest first, for the rules
 * that find a dish named in a note (Story 24.1). Throws RecipeDataError.
 */
export async function listRecipeTitles(): Promise<{ id: string; title: string }[]> {
  return listRecipeTitlesIn(await createClient());
}

/**
 * Delade: the recipes other households share, newest first, as library items with whose they are
 * and whether the household has saved a copy. Never the household's own. Throws RecipeDataError.
 */
export async function listSharedRecipes(): Promise<SharedListItem[]> {
  return toSharedListItems(await listSharedIn(await createClient()));
}

/**
 * A shared recipe opened (/recept/delade/[id]): the recipe as the recipe view shows it, matched by
 * ingredient name against the signed-in household's own catalog and pantry (an ingredient the
 * catalog lacks counts as missing), the sharing household's name and the household's own copy,
 * if saved. `null` for an id that is not a uuid, a recipe that is not shared, or the household's
 * own. Throws RecipeDataError.
 */
export async function getSharedRecipeWithPantry(id: string): Promise<{
  recipe: SavedRecipe;
  householdName: string;
  savedCopyId: string | null;
  version: string;
  snapshot: PantrySnapshot | null;
  site: SelectedSite | null;
  staples: StapleRules;
} | null> {
  if (!recipeIdSchema.safeParse(id).success) return null;
  const [shared, { snapshot, site, staples }] = await Promise.all([getSharedIn(await createClient(), id), getPantryForStatus()]);
  if (!shared) return null;
  // Without the catalog the recipe is shown as it is, without status (as when the pantry cannot be read).
  const matches = await matchIngredients(sharedMatchItems(shared.lines)).catch((error: unknown) => {
    if (!(error instanceof CatalogDataError)) throw error;
    console.error("pantry_unavailable", { reason: `catalog_${error.code}` });
    return null;
  });
  const recipe = toSharedView(shared, matches ?? shared.lines.map(() => ({ kind: "unmatched" as const })));
  const shownSnapshot = matches && snapshot ? snapshotFor(snapshot, recipe.lines.map((line) => line.ingredientId)) : null;
  return {
    recipe,
    householdName: shared.householdName,
    savedCopyId: shared.savedCopyId,
    version: shared.version,
    snapshot: shownSnapshot,
    site: shownSnapshot ? site : null,
    staples,
  };
}

/** The names of the other households that saved a copy of the household's recipe `id` ("Sparat av …"). Throws RecipeDataError. */
export async function getRecipeSavers(id: string): Promise<string[]> {
  if (!recipeIdSchema.safeParse(id).success) return [];
  return saversIn(await createClient(), id);
}

/** Tillval, Delade recept: whether the household shares all its recipes, how many are shared and whether it still has its default name. Throws RecipeDataError. */
export async function getRecipeSharing(): Promise<{ shareAll: boolean; sharedCount: number; nameIsDefault: boolean }> {
  return sharingIn(await createClient());
}

/**
 * A stored picture of the household's recipe `id` for the route src/app/api/recipe-image: the file and its
 * media type, or `null` for an id that is not a uuid, a recipe that is not the household's, a recipe without
 * a copy of its own or a file that is missing (all the same answer). Read with the session client, so RLS and
 * the bucket's policies give only the household's own. Throws RecipeDataError when the recipe cannot be read.
 */
export async function readRecipeImage(id: string, size: RecipeImageSize): Promise<{ data: Blob; mediaType: string } | null> {
  if (!recipeIdSchema.safeParse(id).success) return null;
  const db = await createClient();
  const folder = await imageFolderOf(db, id);
  if (!folder) return null;
  const data = await downloadImageIn(db, folder, size);
  // The bucket only holds WebP and JPEG (its allowed types); the type is the file's own, never the request's.
  return data ? { data, mediaType: data.type === "image/jpeg" ? "image/jpeg" : "image/webp" } : null;
}

/**
 * Inställningar, "Spara receptbilder hos oss": how many of the household's recipes have a picture
 * in the app's own storage, and how many still have only an image address on another site.
 * Throws RecipeDataError.
 */
export async function getRecipeImageStatus(): Promise<{ withCopy: number; missing: number }> {
  const db = await createClient();
  const [withCopy, missing] = await Promise.all([countWithImageIn(db), countWithoutImageIn(db)]);
  return { withCopy, missing };
}
