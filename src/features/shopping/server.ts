import "server-only";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientDefaults, getIngredientNames } from "@/features/catalog/server";
import { getCurrentPlan, MealPlanDataError } from "@/features/mealplan/server";
import type { PantrySnapshot } from "@/features/pantry";
import { getPantrySnapshot, PantryDataError } from "@/features/pantry/server";
import { getRecipesByIds, RecipeDataError } from "@/features/recipes/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { listChecksIn } from "./data/checks";
import { ShoppingDataError } from "./data/client";
import { listCustomItemsIn } from "./data/custom-items";
import { listOverridesIn } from "./data/overrides";
import { loadShoppingList, type ShoppingList } from "./data/queries";

// Server-only entry (AD-1). The list is counted when it is read and never
// stored (AD-8): from the current meal plan (mealplan), its recipes
// (recipes), the pantry (pantry) and the catalog's names and sections
// (catalog), each through that module's server.ts, and the plan's checks
// (Story 3.4), own items (Story 3.5) and overrides (Story 3.6), with the
// signed-in user's session client, so RLS limits every read to the user's own
// rows. Checking a line off, adding, changing or removing an own item, and
// correcting, hiding or restoring a line are the Server Actions in ./actions,
// used by this module's own ui.

export type { ShoppingList } from "./data/queries";

/**
 * The pantry for the list, or `null` when it cannot be read (logged as
 * `pantry_unavailable`): the list is then shown with nothing taken off and
 * says so, rather than not at all. Other errors are bugs and are thrown.
 */
async function pantrySnapshotOrNull(): Promise<PantrySnapshot | null> {
  try {
    return await getPantrySnapshot();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_unavailable", { reason: error.detail });
    return null;
  }
}

/**
 * The plan's checks, or `null` when they cannot be read (logged as
 * `shopping_checks_unavailable`): the list is then shown without checks,
 * and checking is off, rather than no list at all. Other errors are thrown.
 */
async function checksOrNull(planId: string): Promise<string[] | null> {
  try {
    return await listChecksIn(await createClient(), planId);
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_checks_unavailable", { reason: error.detail });
    return null;
  }
}

/**
 * Inköpslista's data (FR-15): the current plan's name and number of dishes,
 * each dish's title, and the list's lines from computeList, sorted by section
 * and name. For the page, inside <Suspense> (AD-18). `unauthorized` without a
 * signed-in user; `shopping_unavailable` (logged) when the plan, the recipes,
 * the own items, the overrides or the catalog cannot be read. Checks that cannot be read give the list
 * without them and `checksUnavailable`. A pantry that cannot be read gives the list
 * with nothing taken off and `pantryUnavailable`. Other errors are thrown.
 */
export async function getShoppingList(): Promise<Result<ShoppingList>> {
  const user = await requireUser();
  if (!user.ok) return fail("unauthorized");
  try {
    return ok(
      await loadShoppingList({
        currentPlan: getCurrentPlan,
        recipesByIds: getRecipesByIds,
        pantry: pantrySnapshotOrNull,
        ingredientNames: getIngredientNames,
        ingredientDefaults: getIngredientDefaults,
        checks: checksOrNull,
        customItems: async (planId) => listCustomItemsIn(await createClient(), planId),
        overrides: async (planId) => listOverridesIn(await createClient(), planId),
      }),
    );
  } catch (error) {
    if (error instanceof MealPlanDataError || error instanceof RecipeDataError || error instanceof ShoppingDataError) {
      console.error("shopping_unavailable", { reason: error.detail });
    } else if (error instanceof CatalogDataError) {
      console.error("shopping_unavailable", { reason: error.code, detail: error.detail });
    } else {
      throw error;
    }
    return fail("shopping_unavailable");
  }
}
