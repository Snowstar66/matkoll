import { z } from "zod";
import { thingCategories, thingTiles, type ThingCategory } from "./thing";
import { shortDateText } from "./thing-photo";
import { seenOnText } from "./thing-merge";
import { inBoxText } from "./thing-place";
import { noMatchText } from "@/components/empty-state";
import { thingCountText } from "./thing-noun";
import { cardViewHref } from "./thing-card";

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
  /** Story 18.19: Pontus wrote in himself where it is (no card); `takenAt` is when. */
  noted: boolean;
  /** 1 for a name that holds a search word, less for a close one. */
  score: number;
  /** Story 18.23: how many there are ("5 st"); null when it is not counted. */
  quantity: number | null;
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
    // Story 18.19; a database before its migration has no such column.
    noted: z.boolean().optional(),
    // Story 18.23; a database before its migration has no such column.
    quantity: z.number().int().nullable().optional(),
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
    noted: row.noted === true,
    score: row.score,
    quantity: row.quantity ?? null,
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

/** The date a hit says: "31 okt", and "skrivet 31 okt" for a thing written into a box or written in with where it is. */
export function hitDateText(hit: Pick<ThingHit, "takenAt" | "written"> & { noted?: boolean }): string {
  const date = shortDateText(new Date(hit.takenAt));
  return hit.written || hit.noted ? `skrivet ${date}` : date;
}

/** The line under a hit's name: "Skräpförrådet, i Black box · Hemma · skrivet 31 okt", with "syns på 2 kort" last for a thing the room's cards overlap on. */
export function hitMeta(hit: ThingHit): string {
  return [hitWhere(hit), hit.siteName, hitDateText(hit), seenOnText(hit.seenOn)].filter(Boolean).join(" · ");
}

/** The tile of a hit's category, as everywhere. */
export function hitTile(hit: Pick<ThingHit, "category">): { icon: string; tile: string } {
  return thingTiles[hit.category];
}

/**
 * Where a hit opens: the box's page for a written thing, the room for a noted
 * thing (Story 18.19, no card; /prylar/<place> redirects to it), otherwise its
 * card big with the thing marked (Story 18.7).
 */
export function hitHref(hit: Pick<ThingHit, "id" | "placeId" | "written" | "photoId"> & { noted?: boolean }): string {
  if (hit.written) return `/prylar/lada/${hit.placeId}`;
  return hit.photoId && !hit.noted ? cardViewHref(hit.photoId, hit.id) : `/prylar/${hit.placeId}`;
}

/** The thumbnail of a hit (Story 18.7): its card's photo, or none for a thing written into a box or noted (their icons show then). */
export function hitThumbnail(hit: Pick<ThingHit, "photoId" | "written"> & { noted?: boolean }): string | null {
  return !hit.written && !hit.noted && hit.photoId ? `/api/things/photo/${hit.photoId}` : null;
}

/** Story 18.19: under "Inga föremål matchar …", what ↑ does with the text. */
export const noHitsAskText = "Tryck ↑ för att fråga, eller för att spara var det ligger.";

/** The fewest characters that start the instant search (Story 18.17). */
export const minSearchChars = 2;
export const searchingText = "Söker …";
export const searchFailedText = "Sökningen gick inte. Försök igen.";

/** "Inget matchar ”hammare”." (the same sentence as every search without a hit, Story 19.7) */
export function noHitsText(query: string): string {
  return noMatchText(query);
}

/** "Visar de 100 bästa träffarna. Skriv mer för att begränsa." */
export function topHitsText(shown: number): string {
  return `Visar de ${shown} bästa träffarna. Skriv mer för att begränsa.`;
}

/** The count of hits for screen readers: "3 prylar". */
export function hitCountText(count: number): string {
  return thingCountText(count);
}

// Story 18.19 (Pontus 2026-10-31, "jag ville veta var det jag sökte fanns"):
// a short text is a search, answered by the database without AI; the hits
// whose name holds what was written come first as the answer, and the close
// (typo or category) matches are "Liknande", shown only when there is no
// answer or folded in.

/** Words that make a short text a question, not a search ("var är passen", "har vi tejp"). */
const questionWords = new Set(["var", "vart", "vad", "vem", "när", "hur", "har", "finns", "vilken", "vilket", "vilka", "kan", "ska", "är", "ligger", "och", "minns", "vet", "hittar", "hittade", "letar", "söker", "ja", "nej", "japp", "nä", "okej", "ok"]);
/** Words that make a text a statement of where something is ("passen ligger här"). */
const statementWords = new Set(["ligger", "står", "hänger", "förvaras", "lade", "lagt", "la", "satte", "ställde"]);

/** The most words of a plain search. */
export const maxPlainSearchWords = 3;

/** Whether `text` is a plain search: one to three words, no question mark, no question or answer word ("vart", "ja") and no statement of where something is. */
export function isPlainSearch(text: string): boolean {
  const key = searchKey(text);
  if (key === "" || key.includes("?")) return false;
  const words = key.split(" ").filter((word) => /[\p{L}\p{N}]/u.test(word));
  if (words.length === 0 || words.length > maxPlainSearchWords) return false;
  return !words.some((word) => questionWords.has(word) || statementWords.has(word));
}

// Story 18.23: "har vi gravljus" is a search too. The question's frame is taken
// off first; what is left, one to three words, is looked up by the database
// without AI, and the answer says yes or no from what it finds.

/** The frames a short question starts with, longest first: "har vi", "finns det några", "var ligger". */
const leadingFrames = [
  "finns det några",
  "finns det något",
  "finns det någon",
  "har vi några",
  "har vi något",
  "har vi någon",
  "har ni några",
  "har jag några",
  "var har vi",
  "var har jag",
  "finns det",
  "har vi",
  "har ni",
  "har jag",
  "var är",
  "var ligger",
  "var finns",
  "vart är",
  "hittar du",
  "hittar vi",
  "hittar jag",
  "hittar",
].map((frame) => frame.split(" "));
/** The words a short question may end with: "hemma", "kvar". */
const trailingFrameWords = new Set(["hemma", "kvar"]);

/**
 * What a short question asks about, without its frame: "har vi gravljus" →
 * "gravljus", "finns det gravljus hemma?" → "gravljus", "var är gravljusen" →
 * "gravljusen". `null` when the text has no such frame, or when what is left
 * is not a plain search (none or more than three words, or a question of its own).
 */
export function stripQuestionFrame(text: string): string | null {
  const words = searchKey(text).replace(/[?!.]+/g, " ").split(" ").filter((word) => word !== "");
  const frame = leadingFrames.find((lead) => lead.every((word, index) => words[index] === word));
  if (!frame) return null;
  const rest = words.slice(frame.length);
  while (rest.length > 0 && trailingFrameWords.has(rest[rest.length - 1])) rest.pop();
  // "har vi något att måla med" asks for a use, not a name: the AI's.
  if (rest[0] === "att") return null;
  const left = rest.join(" ");
  return isPlainSearch(left) ? left : null;
}

/** Letters and digits only, so "coca cola" finds "Coca-Cola". */
function compact(text: string): string {
  return searchKey(text).replace(/[^\p{L}\p{N}]/gu, "");
}

/** A word without a Swedish definite or plural ending, so "passen" and "Pass", "hallen" and "Hall" are the same. */
function stemmed(word: string): string {
  return word.replace(/(?:arna|orna|erna|na|en|et|ar|or|er|n)$/u, "");
}

/**
 * How well a name answers the query: 3 the same (also in another form: "passen"
 * for "Pass"), 2 it starts with it (or the query starts with the whole name of
 * three letters or more), 1 it holds it or a word of it holds each word, 0 a close match only.
 */
export function hitRank(query: string, name: string): number {
  const wanted = compact(query);
  const have = compact(name);
  if (wanted === "") return 0;
  if (have === wanted || (stemmed(have).length >= 3 && stemmed(have) === stemmed(wanted))) return 3;
  if (have.startsWith(wanted) || ([...have].length >= 3 && wanted.startsWith(have))) return 2;
  if ([...wanted].length >= 2 && have.includes(wanted)) return 1;
  const nameWords = searchKey(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const queryWords = searchKey(query).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  return queryWords.length > 0 && queryWords.every((word) => [...word].length >= 2 && nameWords.some((part) => part.includes(word))) ? 1 : 0;
}

/** The hits that answer the query (best first, then as the database had them) and the ones that are only close. */
export function rankHits<T extends Pick<ThingHit, "name">>(query: string, hits: readonly T[]): { best: T[]; similar: T[] } {
  const ranked = hits.map((hit, index) => ({ hit, index, rank: hitRank(query, hit.name) }));
  const best = ranked.filter((entry) => entry.rank > 0).sort((a, b) => b.rank - a.rank || a.index - b.index).map((entry) => entry.hit);
  return { best, similar: ranked.filter((entry) => entry.rank === 0).map((entry) => entry.hit) };
}

/** Where a hit is, for its row: "Boden · Nedersta hyllan · mitten", "Garaget · i Black box". */
export function hitPlaceText(hit: Pick<ThingHit, "room" | "part" | "isBox" | "whereHint">): string {
  return [hit.room, hit.isBox && hit.part ? inBoxText(hit.part) : hit.part, hit.whereHint].filter(Boolean).join(" · ");
}

/** Where a counted föremål is, for its answer (Story 18.23): the room and the part or box, "Förrådet · Översta hyllan". */
export function hitRoomText(hit: Pick<ThingHit, "room" | "part" | "isBox">): string {
  return [hit.room, hit.isBox && hit.part ? inBoxText(hit.part) : hit.part].filter(Boolean).join(" · ");
}

/**
 * The line under a hit's name (Story 18.19): where it is, the boende when it is
 * not the page's, and the day for a thing written in by hand ("skrivet 31 okt");
 * a card's day is on its thumbnail's card.
 */
export function hitLine(hit: ThingHit, pageSiteId?: string): string {
  return [hitPlaceText(hit), pageSiteId && hit.siteId !== pageSiteId ? hit.siteName : null, hit.written || hit.noted ? hitDateText(hit) : null, seenOnText(hit.seenOn)]
    .filter(Boolean)
    .join(" · ");
}

export const similarLabelText = "Liknande";

/** "Visa 5 liknande". */
export function showSimilarText(count: number): string {
  return `Visa ${count} liknande`;
}

/**
 * The answer of a plain search, first and short: "Pass finns i Sovrummet · Översta byrålådan.", "Hittade 3 föremål.", or
 * "Ingen ”coca-cola” hittad." The close matches come right under it with their own heading Liknande, so the answer
 * does not say it too (sista varvet).
 */
export function plainSearchAnswer(query: string, best: readonly ThingHit[]): string {
  if (best.length === 1) return `${best[0].name} finns i ${hitPlaceText(best[0])}.`;
  if (best.length > 1) return `Hittade ${thingCountText(best.length)}.`;
  return `Ingen \u201D${query.trim()}\u201D hittad.`;
}
