import "server-only";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientDefaults, getIngredientNames } from "@/features/catalog/server";
import { currentWeekStart } from "@/features/mealplan";
import { getCurrentPlan, getPlanForWeek, MealPlanDataError } from "@/features/mealplan/server";
import type { SelectedSite } from "@/features/pantry";
import { findPantryAdditions, getPantryForStatus, PantryDataError } from "@/features/pantry/server";
import { getRecipesByIds, RecipeDataError } from "@/features/recipes/server";
import { getSelectedStore, SettingsDataError } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { listCheckRowsIn } from "./data/checks";
import { ShoppingDataError } from "./data/client";
import { listCustomItemsIn } from "./data/custom-items";
import { listOverridesIn } from "./data/overrides";
import { listProductChoicesIn } from "./data/product-choices";
import { receiptedChecks } from "./data/put-in-pantry";
import { loadShoppingList, type ShoppingList as CountedList } from "./data/queries";
import { keyedItemId } from "./data/keyed-item-id";
import type { ProductChoiceContext } from "./domain/product-choice";
import type { CheckRow } from "./domain/put-in-pantry";

// Server-only entry (AD-1). The list is counted when it is read and never
// stored (AD-8): from the current meal plan (mealplan), its recipes
// (recipes), the pantry (pantry) and the catalog's names and sections
// (catalog), each through that module's server.ts, and the plan's checks
// (Story 3.4), own items (Story 3.5) and overrides (Story 3.6), with the
// signed-in user's session client, so RLS limits every read to the user's own
// rows. Beside the list, never in it, come the selected store (settings) and
// its product choices (Story 7.2), and the place the list is counted against
// (pantry, AD-24), which "Lägg i förrådet" sends back. Checking a line off, adding, changing or
// removing an own item, correcting, hiding or restoring a line, and saving or
// removing a product choice are the Server Actions in ./actions, used by this
// module's own ui.

/**
 * Inköpslista as getShoppingList gives it: the counted list, and
 * `pendingClear`, the checks of lines no longer on the list that an
 * interrupted "Lägg i förrådet" already put in the pantry (Story 3.7), so the
 * button stays reachable to clear them; beside it, the selected store and its
 * product choices by catalog ingredient (Story 7.2), which never change how
 * the list is counted; and `site`, the place whose pantry the list is counted
 * against (pantry.getSelectedSite, AD-24), or `null` when the user has none
 * or it cannot be read. "Lägg i förrådet" sends its id, so the items go to the
 * place the list showed (FR-33). The place never changes a line's key, a
 * check, an override, an own item, a product choice or the export.
 */
export type ShoppingList = CountedList & { pendingClear: number } & ProductChoiceContext & { site: SelectedSite | null };

/**
 * The selected store (settings.getSelectedStore) and then its product
 * choices. When the store cannot be read (logged as
 * `settings_store_unavailable`), or its choices cannot (logged as
 * `shopping_product_choices_unavailable`), the list is shown all the same and
 * only the detail's section Produktval says so. No store selected: no choices.
 * Other errors are bugs and are thrown.
 */
async function storeAndChoices(): Promise<ProductChoiceContext> {
  const none: ProductChoiceContext = {
    store: null,
    storeUnavailable: false,
    productChoices: {},
    productChoicesUnavailable: false,
    unreadableChoices: [],
  };
  let store;
  try {
    store = await getSelectedStore();
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_store_unavailable", { reason: error.detail });
    return { ...none, storeUnavailable: true };
  }
  if (!store) return none;
  try {
    const { choices, unreadable } = await listProductChoicesIn(await createClient(), store.id);
    return { ...none, store, productChoices: choices, unreadableChoices: unreadable };
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_product_choices_unavailable", { reason: error.detail });
    return { ...none, store, productChoicesUnavailable: true };
  }
}

/**
 * The plan's checks (and the own items', which belong to no plan; `planId` is
 * null in a week without a plan), or `null` when they cannot be read (logged as
 * `shopping_checks_unavailable`): the list is then shown without checks,
 * and checking is off, rather than no list at all. Other errors are thrown.
 */
async function checksOrNull(planId: string | null): Promise<CheckRow[] | null> {
  try {
    return await listCheckRowsIn(await createClient(), planId);
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_checks_unavailable", { reason: error.detail });
    return null;
  }
}

/**
 * The checks of lines no longer on the list (covered by the pantry now, or
 * hidden) whose items an interrupted "Lägg i förrådet" put in the pantry (Story
 * 3.7). 0 when the receipts cannot be read (logged as
 * `shopping_pending_clear_unavailable`): the list is shown all the same.
 */
async function pendingClearOf(list: CountedList, checks: readonly CheckRow[] | null): Promise<number> {
  if (!checks || checks.length === 0) return 0;
  const listed = new Set(list.lines.map((line) => line.key));
  try {
    return (
      await receiptedChecks(
        checks.filter((check) => !listed.has(check.key)),
        findPantryAdditions,
      )
    ).length;
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("shopping_pending_clear_unavailable", { reason: error.detail });
    return 0;
  }
}

/**
 * Inköpslista's data (FR-15): the name and number of dishes of the plan of
 * `weekStart` (default this week; Story 13.7), 
 * each dish's title, and the list's lines from computeList, sorted by section
 * and name. For the page, inside <Suspense> (AD-18). `unauthorized` without a
 * signed-in user; `shopping_unavailable` (logged) when the plan, the recipes,
 * the own items (all of the user's, whichever week; Story 17.10), the overrides or the catalog cannot be read. Checks that cannot be read give the list
 * without them and `checksUnavailable`. The list is counted against the
 * selected place's pantry, read once with the place (pantry.getPantryForStatus,
 * AD-24), so `site` is always the place the list was counted against. A place
 * or pantry that cannot be read gives the list with nothing taken off,
 * `pantryUnavailable` (when there was something to count) and `site: null`.
 * `pendingClear` counts the
 * checks an interrupted "Lägg i förrådet" left behind. The selected store and
 * its product choices are read alongside (storeAndChoices); when they cannot
 * be read, the list is given all the same. Other errors are thrown.
 */
export async function getShoppingList(weekStart?: string): Promise<Result<ShoppingList>> {
  const user = await requireUser();
  if (!user.ok) return fail("unauthorized");
  let checks: CheckRow[] | null = null;
  // The place and its pantry, read once; the list takes the pantry from it.
  const forStatus = getPantryForStatus();
  // The store and its choices are read alongside the list; all settle
  // before any is used, so none is left running unobserved.
  const [counted, choices, status] = await Promise.allSettled([
    loadShoppingList({
      currentPlan: weekStart && weekStart !== currentWeekStart() ? () => getPlanForWeek(weekStart) : getCurrentPlan,
      recipesByIds: getRecipesByIds,
      pantry: async () => (await forStatus).snapshot,
      ingredientNames: getIngredientNames,
      ingredientDefaults: getIngredientDefaults,
      checks: async (planId) => {
        checks = await checksOrNull(planId);
        return checks && checks.map((check) => check.key);
      },
      // The household's own items, whichever week is shown (Story 17.10); one checked in an earlier week is left out.
      customItems: async () => listCustomItemsIn(await createClient(), weekStart ?? currentWeekStart()),
      overrides: async (planId) => listOverridesIn(await createClient(), planId),
    }),
    storeAndChoices(),
    forStatus,
  ]);
  // storeAndChoices and getPantryForStatus handle every expected error: what they throw is a bug.
  if (choices.status === "rejected") throw choices.reason;
  if (status.status === "rejected") throw status.reason;
  try {
    if (counted.status === "rejected") throw counted.reason;
    const list = counted.value;
    return ok({ ...list, pendingClear: await pendingClearOf(list, checks), ...choices.value, site: status.value.site });
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

/**
 * What Veckans erbjudanden needs from the list (Story 9.12): the current plan
 * (`null` without one; own items need none since Story 17.10) and the keys
 * (the offers' ids) of the items added by addKeyedItems that are on the list
 * now, among `keys`. Throws ShoppingDataError or MealPlanDataError.
 */
export async function getKeyedItemsOnList(keys: readonly string[]): Promise<{ planId: string | null; onList: string[] }> {
  const plan = await getCurrentPlan();
  const items = await listCustomItemsIn(await createClient());
  const ids = new Set(items.map((item) => item.id));
  return { planId: plan?.id ?? null, onList: keys.filter((key) => ids.has(keyedItemId(key))) };
}

export { ShoppingDataError } from "./data/client";
export { addKeyedItems } from "./actions/add-keyed-items";
