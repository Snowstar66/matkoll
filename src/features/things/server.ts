import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "./data/client";
import { loadThingsIn } from "./data/items";
import { downloadCardFile, loadCardIn, loadCardsIn, loadSiteCardFilesIn, removeCardFiles } from "./data/photos";
import { loadThingIndexIn } from "./data/index";
import { loadPlaceIn, loadPlacesIn } from "./data/places";
import type { Thing } from "./domain/thing";
import { shownStatus, type ThingCard } from "./domain/thing-photo";
import type { ThingPlace } from "./domain/thing-place";
import type { IndexedPlace } from "./domain/thing-search";

// Server-only entry (AD-1). The functions use the signed-in user's session
// client, so RLS limits them to the user's own rows. They are for pages, after
// requireUserOrRedirect, inside <Suspense> (AD-18), and for the Route
// Handlers. Things never touch food (Epic 18).

/** What the functions below throw when Supabase fails; never user data. */
export { ThingsDataError };

/**
 * The cards and the AI's jobs behind a photo: for the Route Handlers
 * POST /api/things/photo and POST /api/things/retry (not Server Actions: the
 * photo may be 1.5 MB). The only things that write a card.
 */
export { retryCardReading, startCardReading } from "./actions/start-reading";

/** The places of the boende `siteId`, with their things counted. Throws ThingsDataError. */
export async function listThingPlaces(siteId: string): Promise<ThingPlace[]> {
  return loadPlacesIn(await createClient(), siteId);
}

/** One place, or `null` when it is gone or not the user's. Throws ThingsDataError. */
export async function getThingPlace(id: string): Promise<ThingPlace | null> {
  return loadPlaceIn(await createClient(), id);
}

/**
 * Every place with the things of its newest finished card, across all the
 * user's boenden, for the search of Prylar and the question (Story 18.4).
 * Throws ThingsDataError.
 */
export async function getThingIndex(): Promise<IndexedPlace[]> {
  return loadThingIndexIn(await createClient());
}

/** What the place page shows: the card whose things are listed, the card being read or failed, and the things. */
export type PlaceView = {
  /** The newest card that is done, with its things. */
  card: ThingCard | null;
  things: Thing[];
  /** The newest card when it is being read or failed (shown over the older one), else `null`. */
  pending: ThingCard | null;
};

/** The cards and things of a place. Throws ThingsDataError. */
export async function getPlaceView(placeId: string, now: Date = new Date()): Promise<PlaceView> {
  const db = await createClient();
  const cards = await loadCardsIn(db, placeId);
  const card = cards.find((candidate) => candidate.status === "done") ?? null;
  const newest = cards[0];
  const state = newest ? shownStatus(newest, now) : null;
  const pending = newest && newest.id !== card?.id && state !== "done" ? { ...newest, status: state ?? newest.status } : null;
  return { card, things: card ? await loadThingsIn(db, card.id) : [], pending };
}

/**
 * The image of the user's card `id`, for the Route Handler GET
 * /api/things/photo/[id] (which has checked the user): `null` when the card or its file is gone, or not the
 * user's. Never a public or signed URL (AD-26).
 */
export async function readCardImage(id: string): Promise<{ data: Blob; mediaType: string } | null> {
  const db = await createClient();
  const card = await loadCardIn(db, id);
  if (!card) return null;
  const data = await downloadCardFile(db, card.objectPath);
  return data ? { data, mediaType: card.mediaType } : null;
}

/** Whether the user's card `id` and its file are there (HEAD). */
export async function hasCardImage(id: string): Promise<boolean> {
  return (await readCardImage(id)) !== null;
}

/**
 * The card files of a boende that is about to be deleted (Story 18.2, AD-26):
 * its cards' files and anything else in its places' folders. The cascade takes
 * the rows, not the files, so a caller reads them first and removes them with
 * removeSiteCardFiles once the boende is gone. When they cannot be read that
 * is logged (`things_photo_remove_failed`, a reason only) and none are given:
 * the sweep takes them later, once they have no row.
 */
export async function loadSiteCardFiles(siteId: string, userId: string): Promise<string[]> {
  try {
    return await loadSiteCardFilesIn(await createClient(), userId, siteId);
  } catch (error) {
    if (!(error instanceof ThingsDataError)) throw error;
    console.error("things_photo_remove_failed", { reason: error.detail });
    return [];
  }
}

/** Removes the files loadSiteCardFiles gave, with the Storage API (once more on a failure); a failure is only logged. */
export async function removeSiteCardFiles(paths: readonly string[]): Promise<void> {
  const { failed } = await removeCardFiles(await createClient(), paths);
  if (failed !== null) console.error("things_photo_remove_failed", { reason: failed });
}
