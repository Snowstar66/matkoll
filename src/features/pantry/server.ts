import "server-only";
import { cache } from "react";
import { requireUser } from "@/features/auth/server";
import type { Location } from "@/features/catalog";
import { CatalogDataError, getIngredientDefaults, getIngredientNames } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { addToPantryIn, findPantryAdditionsIn, forgetPantryAdditionsIn } from "./data/add";
import { PantryDataError } from "./data/client";
import { countPantryIn, listPantryIn, loadPantrySnapshot } from "./data/queries";
import { setPantryItemsIn, type SetPantryRow } from "./data/set";
import { addToPantryItemsSchema, type AddToPantryItem } from "./domain/add-to-pantry";
import type { PantryItem, PantrySnapshot } from "./domain/pantry-item";
import type { PantryItemSet } from "./domain/pantry-item-form";

// Server-only entry (AD-1). The functions use the signed-in user's session
// client, so RLS limits them to the user's own rows. They are for pages,
// after requireUserOrRedirect, inside <Suspense> (AD-18), and for other
// modules' server code. setPantryItems is for saving actions only, after
// requireUser (AD-2). addToPantry is for "Lägg i lagret" in the shopping
// module (AD-19). Removing an item and "Ångra" are the Server Actions
// removePantryItem and restorePantryItem in ./actions (AD-19, AD-20).

/** What the functions below throw when Supabase fails; never user data. */
export { PantryDataError } from "./data/client";

/**
 * The signed-in user's pantry items in `location`, with the catalog
 * ingredients' names, sorted by name. For Hemma. Throws PantryDataError.
 */
export async function listPantry(location: Location): Promise<PantryItem[]> {
  return listPantryIn(await createClient(), location, getIngredientNames);
}

/** The number of the signed-in user's pantry items in each location, for Hemma's location cards. */
export async function countPantryItems(): Promise<Record<Location, number>> {
  return countPantryIn(await createClient());
}

/**
 * The signed-in user's whole pantry per catalog ingredient id, summed over
 * locations: `{ unlimited, amounts: { unit, amount }[] }` (AD-19). The only
 * form of the pantry `coverage` takes. Memoised per request, so a page that
 * shows the status of many recipes reads the pantry once. Throws
 * PantryDataError.
 */
export const getPantrySnapshot = cache(async (): Promise<PantrySnapshot> => {
  return loadPantrySnapshot(await createClient());
});

/**
 * Sets each item's amount exactly for its ingredient, location and unit,
 * creating the row when needed (AD-19); see setPantryItemsIn. Not a Server
 * Action: only for saving actions, which check the user first (AD-2). The
 * sheet Lagervara saves through savePantryItem; confirmed pantry suggestions
 * (Epic 6) will use this. Throws PantryDataError.
 */
export async function setPantryItems(
  items: readonly PantryItemSet[],
  replaceId: string | null = null,
): Promise<SetPantryRow[]> {
  return setPantryItemsIn(await createClient(), items, replaceId);
}

/**
 * "Lägg i lagret" (FR-19, AD-19): adds what was bought to the signed-in
 * user's pantry, in one transaction (see addToPantryIn): each item increases
 * the row with the same ingredient, location and unit, or creates it; an
 * ingredient that is unlimited already is left as it is; an item without
 * amount (a vague line) makes the ingredient unlimited. An item without
 * location goes to its catalog ingredient's location (catalog.getIngredientDefaults).
 * Idempotent per item `key`: an item added before is skipped, so a second
 * run after an interruption never adds it twice (AD-1). Not a Server Action:
 * for shopping's putCheckedInPantry, which revalidates (AD-18).
 *
 * Returns the number of items handled (without those skipped for their key).
 * Fails with `unauthorized`, `validation` or `pantry_add_failed` (logged);
 * nothing is added then.
 */
export async function addToPantry(items: readonly AddToPantryItem[]): Promise<Result<{ added: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = addToPantryItemsSchema.safeParse(items);
  if (!parsed.success) return fail("validation");
  try {
    const added = await addToPantryIn(await createClient(), parsed.data, getIngredientDefaults);
    return ok({ added });
  } catch (error) {
    if (error instanceof PantryDataError) {
      console.error("pantry_add_failed", { reason: error.detail });
    } else if (error instanceof CatalogDataError) {
      console.error("pantry_add_failed", { reason: `catalog_${error.code}`, detail: error.detail });
    } else {
      throw error;
    }
    return fail("pantry_add_failed");
  }
}

/**
 * The keys among `keys` that addToPantry has added in the last 30 days, so
 * "Lägg i lagret" can clear a check whose item an interrupted run already
 * put in the pantry. Throws PantryDataError.
 */
export async function findPantryAdditions(keys: readonly string[]): Promise<string[]> {
  return findPantryAdditionsIn(await createClient(), keys);
}

/**
 * Deletes the receipts of `keys` (see forgetPantryAdditionsIn): "Lägg i
 * lagret" calls it for the checks it has cleared. Throws PantryDataError.
 */
export async function forgetPantryAdditions(keys: readonly string[]): Promise<void> {
  return forgetPantryAdditionsIn(await createClient(), keys);
}
