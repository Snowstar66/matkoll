import { z } from "zod";
import { thingCategories, thingTiles, type ThingCategory } from "./thing";
import { shortDateText } from "./thing-photo";
import { seenOnText } from "./thing-merge";
import { inBoxText } from "./thing-place";

// Sök (Stories 18.4 and 18.14): the things are found by the database, with
// typos tolerated (search_things), never by loading every thing to the
// browser. A hit is a thing with the place and the card it is on, or the box
// it was written into. Pure.

/** A thing found by the search, with where it is. Plain data: it crosses from the server to the browser. */
export type ThingHit = {
  id: string;
  name: string;
  category: ThingCategory;
  whereHint: string | null;
  /** On how many cards of the room it is seen (Story 18.6): 1 for a thing on one card. */
  seenOn: number;
  placeId: string;
  siteId: string;
  siteName: string;
  room: string;
  roomKey: string;
  part: string | null;
  /** A box: `part` is its name, and its things are "i Blå backen". */
  isBox: boolean;
  /** The card the thing is on; null for a thing written into a box (Story 18.13). */
  photoId: string | null;
  /** When the card was taken, or the thing written (ISO). */
  takenAt: string;
  written: boolean;
  /** 1 for a name that holds a search word, less for a close one. */
  score: number;
};

/** The rows of search_things, checked. */
export const searchRowsSchema = z.array(
  z.object({
    id: z.uuid(),
    name: z.string().min(1),
    category: z.enum(thingCategories),
    where_hint: z.string().nullable(),
    photo_id: z.uuid().nullable(),
    place_id: z.uuid(),
    site_id: z.uuid(),
    site_name: z.string(),
    room: z.string(),
    room_key: z.string(),
    part: z.string().nullable(),
    kind: z.enum(["part", "box"]),
    taken_at: z.string(),
    source: z.enum(["photo", "manual"]),
    score: z.number(),
    seen_on: z.number().int(),
  }),
);

/** A row of search_things as a hit. */
export function toHit(row: z.output<typeof searchRowsSchema>[number]): ThingHit {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    whereHint: row.where_hint,
    seenOn: row.seen_on,
    placeId: row.place_id,
    siteId: row.site_id,
    siteName: row.site_name,
    room: row.room,
    roomKey: row.room_key,
    part: row.part,
    isBox: row.kind === "box",
    photoId: row.photo_id,
    takenAt: new Date(row.taken_at).toISOString(),
    written: row.source === "manual",
    score: row.score,
  };
}

/** The most hits the list shows, and the most the database gives. */
export const maxHits = 100;

/** The most words of a search sent to the database (the whole text counts as one more). */
const maxSearchWords = 6;

/** Text for comparing: Unicode NFC, lower case as Swedish has it, single spaces. */
export function searchKey(text: string): string {
  return text.normalize("NFC").toLocaleLowerCase("sv").replace(/\s+/g, " ").trim();
}

/**
 * What the plain search field looks for: the text as typed (a name with
 * several words) and each word of two letters or more. Nothing for an empty
 * text. The database does the rest: a name that holds a term, or is close to it.
 */
export function searchTerms(query: string): string[] {
  const key = searchKey(query);
  if (key === "") return [];
  const words = key.split(/[^\p{L}\p{N}]+/u).filter((word) => [...word].length >= 2);
  return [...new Set([key, ...words])].filter((term) => [...term].length <= 40).slice(0, maxSearchWords + 1);
}

/** Where a thing is: the room, the part and where on the card ("Skräpförrådet, Översta hyllan, på väggen, mitten"). */
export function hitWhere(hit: Pick<ThingHit, "room" | "part" | "isBox" | "whereHint">): string {
  return [hit.room, hit.isBox && hit.part ? inBoxText(hit.part) : hit.part, hit.whereHint].filter(Boolean).join(", ");
}

/** The date a hit says: "31 okt", and "skrivet 31 okt" for a thing written into a box. */
export function hitDateText(hit: Pick<ThingHit, "takenAt" | "written">): string {
  const date = shortDateText(new Date(hit.takenAt));
  return hit.written ? `skrivet ${date}` : date;
}

/** The line under a hit's name: "Skräpförrådet, i Black box · Hemma · skrivet 31 okt", with "syns på 2 kort" last for a thing the room's cards overlap on. */
export function hitMeta(hit: ThingHit): string {
  return [hitWhere(hit), hit.siteName, hitDateText(hit), seenOnText(hit.seenOn)].filter(Boolean).join(" · ");
}

/** The tile of a hit's category, as everywhere. */
export function hitTile(hit: Pick<ThingHit, "category">): { icon: string; tile: string } {
  return thingTiles[hit.category];
}

/** Where a hit opens: the box's page for a written thing, otherwise the place's room (/prylar/<place> redirects to it). */
export function hitHref(hit: Pick<ThingHit, "placeId" | "written">): string {
  return hit.written ? `/prylar/lada/${hit.placeId}` : `/prylar/${hit.placeId}`;
}

export const searchLabel = "Sök bland prylar";
export const searchPlaceholder = "Till exempel hammare";
export const searchingText = "Söker …";
export const searchFailedText = "Sökningen gick inte. Försök igen.";

/** "Inga prylar matchar "hammare"." */
export function noHitsText(query: string): string {
  return `Inga prylar matchar "${query.trim()}".`;
}

/** "Visar de 100 bästa träffarna. Skriv mer för att begränsa." */
export function topHitsText(shown: number): string {
  return `Visar de ${shown} bästa träffarna. Skriv mer för att begränsa.`;
}

/** The count of hits for screen readers: "3 prylar". */
export function hitCountText(count: number): string {
  return count === 1 ? "1 pryl" : `${count} prylar`;
}
