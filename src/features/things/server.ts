import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ThingsDataError } from "./data/client";
import { downloadCardFile, loadCardIn, loadSiteCardFilesIn, removeCardFiles } from "./data/photos";
import { loadPlaceIn, loadPlacesIn } from "./data/places";
import { loadRoomCardsIn, loadRoomCategoriesIn, loadRoomIn, loadRoomPlacesIn, loadRoomsIn, type RoomPlace } from "./data/rooms";
import type { ThingCategory } from "./domain/thing";
import { cardLabel, type RoomCard, type RoomSummary } from "./domain/thing-room";
import type { ThingPlace } from "./domain/thing-place";
import { loadRoomWrittenIn, loadWrittenIn } from "./data/written";
import type { WrittenBox } from "./domain/thing-written";

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

/** The rooms of the boende `siteId`, each counted by the database (Story 18.11). Throws ThingsDataError. */
export async function listRooms(siteId: string): Promise<RoomSummary[]> {
  return loadRoomsIn(await createClient(), siteId);
}

/** What a room's page shows (Story 18.12): its counts, the categories with their counts, the cards and the places. */
export type RoomPageData = {
  summary: RoomSummary;
  categories: { category: ThingCategory; things: number }[];
  cards: RoomCard[];
  places: RoomPlace[];
  /** The boxes of the room with things written into them (Story 18.13). */
  written: WrittenBox[];
};

/** A room of a boende, or `null` when it has no such room. Throws ThingsDataError. */
export async function getRoomPage(siteId: string, key: string, now: Date = new Date()): Promise<RoomPageData | null> {
  const db = await createClient();
  const summary = await loadRoomIn(db, siteId, key);
  if (!summary) return null;
  const [categories, cards, places, written] = await Promise.all([
    loadRoomCategoriesIn(db, siteId, key),
    loadRoomCardsIn(db, siteId, key, now),
    loadRoomPlacesIn(db, siteId, key),
    loadRoomWrittenIn(db, siteId, key),
  ]);
  return {
    summary,
    categories,
    places,
    written,
    cards: cards.map((card) => ({ ...card, label: cardLabel(card) })),
  };
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

/** What a box's page shows (Story 18.13): the box, the things written into it and how many things its cards show. */
export type BoxPageData = {
  place: ThingPlace;
  written: { name: string }[];
  /** The things the box's cards show (the rest of `place.itemCount`). */
  photographed: number;
};

/** A box, or `null` when the place is gone, not the user's, or not a box. Throws ThingsDataError. */
export async function getBoxPage(id: string): Promise<BoxPageData | null> {
  const db = await createClient();
  const place = await loadPlaceIn(db, id);
  if (!place || !place.isBox) return null;
  const written = await loadWrittenIn(db, id);
  return { place, written, photographed: Math.max(0, place.itemCount - written.length) };
}
