"use server";

import { requireUser } from "@/features/auth/server";
import { recipeFits } from "@/features/menu-advisor";
import { getFoodFitPeople } from "@/features/menu-advisor/server";
import { CatalogDataError, getIngredientNames } from "@/features/catalog/server";
import { getPantryForStatus, listOldPantryItems, PantryDataError } from "@/features/pantry/server";
import { listRecipeRows, RecipeDataError } from "@/features/recipes/server";
import { fail, ok, type Result } from "@/lib/errors";
import { cookNowLists, cookNowNameIds, type CookNowLists } from "../domain/cook-now";

// "Vad kan jag laga nu?" (Story 25.2): the library's side of the sheet "Kan
// lagas nu", a read that never calls the model and writes nothing, so the rows
// show at once while the AI dishes are on their way.

/** What the sheet shows at once: the recipes, and the item that has lain longest, if any. */
export type CookNowRead = CookNowLists & {
  /** The item that has lain longest at home, for the tip line; `null` for none. */
  tip: { name: string; days: number } | null;
  /** The place the lists are counted against, so a saved result is not shown for another one. */
  siteId: string | null;
};

/**
 * The user's library counted against the whole place's pantry (Kyl, Frys and
 * Skafferi, with the household's Basvaror as at home): the recipes with
 * nothing missing and those with one thing missing, the ones with the oldest
 * item first. `pantry_unavailable` when the pantry cannot be read, and
 * `catalog_unavailable` for the names; only codes are logged.
 */
export async function readCookNow(): Promise<Result<CookNowRead>> {
  const user = await requireUser();
  if (!user.ok) return user;
  try {
    const [rows, { snapshot, site, staples }, people] = await Promise.all([listRecipeRows(), getPantryForStatus(), getFoodFitPeople()]);
    if (!snapshot) return fail("pantry_unavailable");
    const old = site ? await oldItemsOf(site.id) : [];
    const ids = cookNowNameIds(rows, snapshot, staples);
    const names = ids.length > 0 ? await getIngredientNames(ids) : {};
    // Hushållets preferenser: the recipes' ingredient lines held against them (nothing filled in = no notes, same order).
    const lists = cookNowLists(rows, snapshot, names, staples, old.map((item) => item.ingredientId), recipeFits(rows, people));
    return ok({ ...lists, tip: old[0] ? { name: old[0].name, days: old[0].days } : null, siteId: site?.id ?? null });
  } catch (error) {
    if (!(error instanceof RecipeDataError || error instanceof CatalogDataError)) throw error;
    console.error("cook_now_unavailable", { reason: error.name });
    return fail("catalog_unavailable");
  }
}

/** What has lain long on the place, oldest first; a help, not the read: when it fails (logged) there is no tip. */
async function oldItemsOf(siteId: string) {
  try {
    return await listOldPantryItems(siteId);
  } catch (error) {
    if (!(error instanceof PantryDataError || error instanceof CatalogDataError)) throw error;
    console.error("old_items_unavailable", { reason: error instanceof PantryDataError ? error.detail : error.code });
    return [];
  }
}
