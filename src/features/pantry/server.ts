import "server-only";
import { cache } from "react";
import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import type { Location } from "@/features/catalog";
import { CatalogDataError, getIngredientDefaults, getIngredientSummaries } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { placePhotosNeedSweepIn } from "./actions/photo-sweep";
import { addToPantryIn, findPantryAdditionsIn, forgetPantryAdditionsIn } from "./data/add";
import { isSiteGone, PantryDataError, siteGoneCode, siteGoneDetail } from "./data/client";
import { insertPantryDefaults } from "./data/defaults";
import { downloadPlacePhoto, loadPlacePhotoIn, loadPlacePhotosIn, placePhotoFileExists } from "./data/photos";
import { checkedSiteId, countPantryIn, listPantryIn, loadPantrySnapshot, zeroCounts } from "./data/queries";
import { removePantryItemIn } from "./data/remove";
import { setPantryItemsIn, type SetPantryRow } from "./data/set";
import { planMove, type MovedItem } from "./domain/move-amount";
import { loadPantrySitesIn, loadSiteItemCountsIn } from "./data/sites";
import { addToPantryItemsSchema, type AddToPantryItem } from "./domain/add-to-pantry";
import { oldPantryItems, type OldPantryItem } from "./domain/old-items";
import { toSnapshot, type PantryItem, type PantrySnapshot } from "./domain/pantry-item";
import type { PantryItemSet } from "./domain/pantry-item-form";
import type { PlacePhoto, PlacePhotoMediaType } from "./domain/place-photo";
import type { PantrySite, PantrySiteWithCount, SelectedSite } from "./domain/site";

// Server-only entry (AD-1). The functions use the signed-in user's session
// client, so RLS limits them to the user's own rows. They are for pages,
// after requireUserOrRedirect, inside <Suspense> (AD-18), and for other
// modules' server code. setPantryItems is for saving actions only, after
// requireUser (AD-2). readPhoto and compareStoredReading only read, for the photo jobs (Story 12.5).
// addToPantry is for "Lägg till i Matvaror" in the shopping module (AD-19). Removing an item and "Ångra" are the Server Actions
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
 * The steps of a photo's AI job (Story 12.5): the reading of a photo of a
 * place (FR-24), the place the photo is for, and the comparison with the
 * place's items when the result is fetched, for the Route Handlers under
 * /api/ai/jobs (not Server Actions). Never writes (AD-2).
 */
export { compareStoredReading, lookUpSite, readPhoto } from "./actions/analyze-place";
export { storedReadingSchema, type StoredReading } from "./domain/photo-job";

/**
 * The points of the items on the photo of a place (Story 6.6), the second
 * step of a photo's job. Never writes (AD-2).
 */
export { locatePlaceItems } from "./actions/locate-place-items";

/**
 * The latest photo of a place (Story 10.1, AD-26), for the Route Handler
 * POST /api/pantry/photo (not a Server Action: the photo may be 1.5 MB). The
 * only Route Handler that writes (AD-2). Never asks the AI port.
 */
export { savePlacePhoto } from "./actions/save-place-photo";

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
 * none. A `siteId` that is not one of the user's places (another user's, or
 * deleted) is PantryDataError `site_gone`, which callers show as
 * `pantry_site_gone` (Story 8.2), never as an empty pantry. Resolved before
 * the memoised reads below, so a read without `siteId` and one with the
 * selected place's id share one query.
 */
async function placeToRead(siteId: string | undefined): Promise<string | null> {
  if (siteId === undefined) return (await getSelectedSite())?.id ?? null;
  const place = checkedSiteId(siteId);
  if (!(await listPantrySites()).some((site) => site.id === place)) throw new PantryDataError(siteGoneDetail);
  return place;
}

const listPantryOn = cache(async (location: Location, siteId: string): Promise<PantryItem[]> => {
  return listPantryIn(await createClient(), location, getIngredientSummaries, siteId);
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
 * Story 16.13 ("Ät det här först"): the items on one place (`siteId`, or the
 * selected place) that have lain longer than the limit of their location
 * (Kyl, Frys), one per ingredient, the oldest first. Reads the same memoised
 * lists as Matvaror. Throws PantryDataError.
 */
export async function listOldPantryItems(siteId?: string, now: Date = new Date()): Promise<OldPantryItem[]> {
  const [fridge, freezer] = await Promise.all([listPantry("Kyl", siteId), listPantry("Frys", siteId)]);
  return oldPantryItems([...fridge, ...freezer], now);
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
 * The signed-in user's places, in the order they were created, each with the
 * number of items on it over its three locations: for the sheet Boenden in
 * Hemma (Story 8.2). The places are read first, then the counts in one
 * grouped query. The counts are a help, not the page: when they cannot be
 * read (logged as `pantry_site_counts_unavailable`), every place has
 * `itemCount: null`, and Hemma works without them. Memoised per request.
 * Throws PantryDataError only when the places cannot be read.
 */
export const listPantrySitesWithCounts = cache(async (): Promise<PantrySiteWithCount[]> => {
  const sites = await listPantrySites();
  let counts: Record<string, number> | null;
  try {
    counts = await loadSiteItemCountsIn(await createClient());
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_site_counts_unavailable", { reason: error.detail });
    counts = null;
  }
  return sites.map((site) => ({ ...site, itemCount: counts ? (counts[site.id] ?? 0) : null }));
});

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

const placePhotosOn = cache(async (siteId: string): Promise<PlacePhoto[]> => {
  return loadPlacePhotosIn(await createClient(), siteId, new Date());
});

/** The latest photos of a place, as Matvaror shows them; see listPlacePhotos. */
export type PlacePhotos = { photos: PlacePhoto[] };

/**
 * The signed-in user's latest photo of each location on one place (`siteId`,
 * or the selected place) that was taken within the last 30 days (Story 10.2,
 * FR-38, AD-26): the rows only, never the images, for the line "Senaste
 * foto" in Matvaror. The photos are a help, not the page: when they cannot be
 * read, for any reason, also a bug (logged as `pantry_photos_unavailable`,
 * with the reason only), there are none, and Matvaror works without them.
 * Memoised per request and place.
 */
export async function listPlacePhotos(siteId?: string): Promise<PlacePhotos> {
  try {
    const place = await placeToRead(siteId);
    return { photos: place === null ? [] : await placePhotosOn(place) };
  } catch (error) {
    // Never the message, which may hold an id or a path.
    const reason = error instanceof PantryDataError ? error.detail : `unexpected ${error instanceof Error ? error.name : typeof error}`;
    console.error("pantry_photos_unavailable", { reason });
    return { photos: [] };
  }
}

/** A saved photo's image as GET /api/pantry/photo/[id] sends it. */
export type PlacePhotoImage = { data: Blob; mediaType: PlacePhotoMediaType };

/**
 * The image of the signed-in user's photo `id` (a uuid, checked by the
 * caller) and its type, for the Route Handler GET /api/pantry/photo/[id]
 * (Story 10.2, AD-26), after it has checked the user. Read with the session
 * client, so RLS and the bucket's policies give only the user's own. `null`
 * for a photo that is gone, taken more than 30 days ago, or not the user's.
 * Never sent to the AI port. Throws PantryDataError.
 */
export async function readPlacePhotoImage(id: string): Promise<PlacePhotoImage | null> {
  const db = await createClient();
  const file = await loadPlacePhotoIn(db, id, new Date());
  if (!file) return null;
  const data = await downloadPlacePhoto(db, file.objectPath);
  return data ? { data, mediaType: file.mediaType } : null;
}

/**
 * Whether the signed-in user's photo `id` (a uuid, checked by the caller)
 * can be sent: its row, younger than 30 days, and its file, checked without
 * downloading it. For HEAD /api/pantry/photo/[id] (Story 10.2), which the
 * photo sheet asks when the image cannot be shown. Throws PantryDataError.
 */
export async function hasPlacePhoto(id: string): Promise<boolean> {
  const db = await createClient();
  const file = await loadPlacePhotoIn(db, id, new Date());
  return file ? placePhotoFileExists(db, file.objectPath) : false;
}

/** The pantry a view counts its status against, and the place it is of; see getPantryForStatus. */
export type PantryForStatus = { site: SelectedSite | null; snapshot: PantrySnapshot | null };

/**
 * The selected place and its pantry, for the cooking status and the line
 * "Boende: Stugan" (AD-7, AD-24): the place is read once, and then the pantry
 * of exactly that place's id, so the line always names the place the status
 * was counted against. The two reads follow each other rather than relying
 * on React `cache`, so it holds in a Server Action too, where nothing is
 * memoised. A user without places has `site: null` and an empty pantry.
 * When the place or the pantry cannot be read (logged as
 * `pantry_unavailable`, with the reason only), both are `null`: no status
 * and no line. Other errors are bugs and are thrown.
 */
export async function getPantryForStatus(): Promise<PantryForStatus> {
  try {
    const site = await getSelectedSite();
    // The place is one of the user's, just read, so its pantry is read without
    // placeToRead's second read of the places (Story 8.2).
    return { site, snapshot: site ? await snapshotOn(site.id) : toSnapshot([]) };
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_unavailable", { reason: error.detail });
    return { site: null, snapshot: null };
  }
}

/**
 * Whether the signed-in user has photos to sweep (Story 10.3, FR-39): a photo
 * older than 30 days. Matvaror then renders PhotoSweep, which calls the
 * Server Action sweepPlacePhotos; the sweep also looks for files without a
 * row, which this cheap read leaves out. Only reads (AD-2); memoised per
 * request. Over all the user's places, since the sweep is. When it cannot be read
 * (logged as `pantry_photo_sweep_unavailable`, with the reason only), it is
 * `false`, and Hemma works without it.
 */
export const needsPlacePhotoSweep = cache(async (): Promise<boolean> => {
  try {
    return await placePhotosNeedSweepIn(await createClient());
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("pantry_photo_sweep_unavailable", { reason: error.detail });
    return false;
  }
});

/** Whether `error` says a place is removed, or not the user's (MK410): the caller gives `pantry_site_gone`. */
export function isPantrySiteGone(error: unknown): boolean {
  return isSiteGone(error);
}

/** The place addToPantry takes: a place's id, or `null` for the selected place. */
const addSiteSchema = z.uuid().nullable();

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
 * "Lägg till i Matvaror" (FR-19, AD-19): adds what was bought to the signed-in
 * user's pantry, in one transaction (see addToPantryIn): each item increases
 * the row with the same ingredient, location and unit, or creates it; an
 * ingredient that is unlimited already is left as it is; an item without
 * amount (a vague line) makes the ingredient unlimited. An item without
 * location goes to its catalog ingredient's location (catalog.getIngredientDefaults).
 * Idempotent per item `key`: an item added before is skipped, so a second
 * run after an interruption never adds it twice (AD-1). Not a Server Action:
 * for shopping's putCheckedInPantry, which revalidates (AD-18).
 *
 * Everything goes to the place `siteId`, the one the list was counted
 * against (FR-33, AD-24), or the selected place when it is `null` (a list
 * read without a place). The receipts are per user, so a second run never
 * adds an item twice, also with another place.
 *
 * Returns the number of items handled (without those skipped for their key).
 * Fails with `unauthorized`, `validation`, `pantry_site_gone` (the place is
 * removed or not the user's; logged with its code) or `pantry_add_failed`
 * (logged); nothing is added then.
 */
export async function addToPantry(
  items: readonly AddToPantryItem[],
  siteId: string | null,
): Promise<Result<{ added: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = addToPantryItemsSchema.safeParse(items);
  const site = addSiteSchema.safeParse(siteId);
  if (!parsed.success || !site.success) return fail("validation");
  try {
    const added = await addToPantryIn(await createClient(), parsed.data, getIngredientDefaults, site.data);
    return ok({ added });
  } catch (error) {
    if (isPantrySiteGone(error)) {
      console.error("pantry_site_gone", { reason: siteGoneCode });
      return fail("pantry_site_gone");
    }
    // A place that is not a uuid is refused before anything is written.
    if (error instanceof PantryDataError && error.detail === "invalid_site") return fail("validation");
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
 * "Lägg till i Matvaror" can clear a check whose item an interrupted run already
 * put in the pantry. Throws PantryDataError.
 */
export async function findPantryAdditions(keys: readonly string[]): Promise<string[]> {
  return findPantryAdditionsIn(await createClient(), keys);
}

/**
 * Deletes the receipts of `keys` (see forgetPantryAdditionsIn): "Lägg i
 * förrådet" calls it for the checks it has cleared. Throws PantryDataError.
 */
export async function forgetPantryAdditions(keys: readonly string[]): Promise<void> {
  return forgetPantryAdditionsIn(await createClient(), keys);
}

/**
 * Story 16.18 ("Packa upp kassarna"): moves what was just bought (`item`)
 * from the location `from` to `to` on the place `siteId`: only the bought
 * amount moves, what was at home stays (see planMove). Reads the place's rows
 * fresh, not through the request's memoised lists. A whole row moves in one
 * transaction (set_pantry_items with `replaceId`); a part is two writes, the
 * destination first. Not a Server Action: shopping's moveUnpackedItem checks
 * the user and revalidates. Returns false when the place has no such row
 * (removed or moved already); nothing is written then. Throws
 * PantryDataError (`site_gone` for a place that is gone).
 */
export async function movePantryAmount(
  userId: string,
  siteId: string,
  item: MovedItem,
  from: Location,
  to: Location,
): Promise<boolean> {
  if (from === to) return true;
  const db = await createClient();
  const place = await placeToRead(siteId);
  if (place === null) return false;
  const [source, destination] = await Promise.all([
    listPantryIn(db, from, getIngredientSummaries, place),
    listPantryIn(db, to, getIngredientSummaries, place),
  ]);
  const plan = planMove(source, destination, item, to, from);
  if (!plan) return false;
  const [first, ...rest] = plan.sets;
  if (first) await setPantryItemsIn(db, [first], plan.replaceId, place);
  else if (plan.replaceId) await removePantryItemIn(db, plan.replaceId);
  for (const set of rest) await setPantryItemsIn(db, [set], null, place);
  return true;
}
