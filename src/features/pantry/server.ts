import "server-only";
import { cache } from "react";
import { requireUser } from "@/features/auth/server";
import type { Location } from "@/features/catalog";
import { CatalogDataError, getIngredientDefaults, getIngredientNames } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { addToPantryIn, findPantryAdditionsIn, forgetPantryAdditionsIn } from "./data/add";
import { PantryDataError } from "./data/client";
import { insertPantryDefaults } from "./data/defaults";
import { checkedSiteId, countPantryIn, listPantryIn, loadPantrySnapshot, zeroCounts } from "./data/queries";
import { setPantryItemsIn, type SetPantryRow } from "./data/set";
import { loadPantrySitesIn } from "./data/sites";
import { addToPantryItemsSchema, type AddToPantryItem } from "./domain/add-to-pantry";
import { toSnapshot, type PantryItem, type PantrySnapshot } from "./domain/pantry-item";
import type { PantryItemSet } from "./domain/pantry-item-form";
import type { PantrySite, SelectedSite } from "./domain/site";

// Server-only entry (AD-1). The functions use the signed-in user's session
// client, so RLS limits them to the user's own rows. They are for pages,
// after requireUserOrRedirect, inside <Suspense> (AD-18), and for other
// modules' server code. setPantryItems is for saving actions only, after
// requireUser (AD-2). analyzePlace only reads, for /api/ai/analyze.
// addToPantry is for "Lägg i lagret" in the shopping module (AD-19). Removing an item and "Ångra" are the Server Actions
// removePantryItem and restorePantryItem in ./actions (AD-19, AD-20).
//
// Places (AD-24): every read is of one place, `siteId` or, without it, the
// selected place. Nothing here sums the pantry over places. The reads are
// memoised per request with React `cache`, so a page reads the selected place
// once and every part of it shows the same place. A user without places
// (before ensurePantryDefaults) has no selected place and an empty pantry.

/** What the functions below throw when Supabase fails; never user data. */
export { PantryDataError } from "./data/client";

/**
 * Lagerförslag from a photo of a place (FR-24), for the Route Handler
 * /api/ai/analyze (not a Server Action). Never writes (AD-2).
 */
export { analyzePlace } from "./actions/analyze-place";

/**
 * The signed-in user's places, in the order they were created. Memoised per
 * request. Throws PantryDataError.
 */
export const listPantrySites = cache(async (): Promise<PantrySite[]> => {
  return loadPantrySitesIn(await createClient());
});

/**
 * The signed-in user's selected place, with how many places the user has, or
 * `null` when the user has none (before ensurePantryDefaults). Read from
 * listPantrySites, so a page asks the database once. Memoised per request.
 * Throws PantryDataError.
 */
export const getSelectedSite = cache(async (): Promise<SelectedSite | null> => {
  const sites = await listPantrySites();
  const selected = sites.find((site) => site.isSelected);
  return selected ? { id: selected.id, name: selected.name, siteCount: sites.length } : null;
});

/**
 * The place a read is of: `siteId` (checked as a uuid, PantryDataError
 * `invalid_site` otherwise), or the selected place; null when the user has
 * none. Resolved before the memoised reads below, so a read without
 * `siteId` and one with the selected place's id share one query.
 */
async function placeToRead(siteId: string | undefined): Promise<string | null> {
  return siteId === undefined ? ((await getSelectedSite())?.id ?? null) : checkedSiteId(siteId);
}

const listPantryOn = cache(async (location: Location, siteId: string): Promise<PantryItem[]> => {
  return listPantryIn(await createClient(), location, getIngredientNames, siteId);
});

const countPantryOn = cache(async (siteId: string): Promise<Record<Location, number>> => {
  return countPantryIn(await createClient(), siteId);
});

const snapshotOn = cache(async (siteId: string): Promise<PantrySnapshot> => {
  return loadPantrySnapshot(await createClient(), siteId);
});

/**
 * The signed-in user's pantry items in `location` on one place (`siteId`, or
 * the selected place), with the catalog ingredients' names, sorted by name.
 * For Hemma. Memoised per request and place. Throws PantryDataError.
 */
export async function listPantry(location: Location, siteId?: string): Promise<PantryItem[]> {
  const place = await placeToRead(siteId);
  return place === null ? [] : listPantryOn(location, place);
}

/**
 * The number of the signed-in user's pantry items in each location of one
 * place (`siteId`, or the selected place), for Hemma's location cards.
 * Memoised per request and place. Throws PantryDataError.
 */
export async function countPantryItems(siteId?: string): Promise<Record<Location, number>> {
  const place = await placeToRead(siteId);
  return place === null ? zeroCounts() : countPantryOn(place);
}

/**
 * The signed-in user's pantry on one place (`siteId`, or the selected place)
 * per catalog ingredient id, summed over the place's locations and never over
 * places: `{ unlimited, amounts: { unit, amount }[] }` (AD-19, AD-24). The
 * only form of the pantry `coverage` takes. Memoised per request and place,
 * so a page that shows the status of many recipes reads the pantry once.
 * Throws PantryDataError.
 */
export async function getPantrySnapshot(siteId?: string): Promise<PantrySnapshot> {
  const place = await placeToRead(siteId);
  return place === null ? toSnapshot([]) : snapshotOn(place);
}

/**
 * The pantry's start data for the signed-in user (AD-21, AD-24): Hemma as the
 * selected place when the user has no places. Called by auth/confirm after
 * ensureUserDefaults; idempotent, so every sign-in may call it. Throws
 * PantryDataError.
 */
export async function ensurePantryDefaults(): Promise<void> {
  await insertPantryDefaults(await createClient());
}

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
