import "server-only";
import { createClient } from "@/lib/supabase/server";
import { loadThingsIn } from "./data/items";
import { downloadCardFile, loadCardIn, loadCardsIn } from "./data/photos";
import { loadPlaceIn, loadPlacesIn } from "./data/places";
import type { Thing } from "./domain/thing";
import { shownStatus, type ThingCard } from "./domain/thing-photo";
import type { ThingPlace } from "./domain/thing-place";

// Server-only entry (AD-1). The functions use the signed-in user's session
// client, so RLS limits them to the user's own rows. They are for pages, after
// requireUserOrRedirect, inside <Suspense> (AD-18), and for the Route
// Handlers. Things never touch food (Epic 18).

/** What the functions below throw when Supabase fails; never user data. */
export { ThingsDataError } from "./data/client";

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
