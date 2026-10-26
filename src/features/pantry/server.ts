import "server-only";
import { cache } from "react";
import type { Location } from "@/features/catalog";
import { getIngredientNames } from "@/features/catalog/server";
import { createClient } from "@/lib/supabase/server";
import { countPantryIn, listPantryIn, loadPantrySnapshot } from "./data/queries";
import { setPantryItemsIn, type SetPantryRow } from "./data/set";
import type { PantryItem, PantrySnapshot } from "./domain/pantry-item";
import type { PantryItemSet } from "./domain/pantry-item-form";

// Server-only entry (AD-1). The functions use the signed-in user's session
// client, so RLS limits them to the user's own rows. They are for pages,
// after requireUserOrRedirect, inside <Suspense> (AD-18), and for other
// modules' server code. setPantryItems is for saving actions only, after
// requireUser (AD-2). Removing an item and "Ångra" are the Server Actions
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
