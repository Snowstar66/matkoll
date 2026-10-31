import { thingTiles, type ThingCategory } from "./thing";
import { shortDateText } from "./thing-photo";
import { seenOnText } from "./thing-merge";
import { inBoxText } from "./thing-place";

// Sök och fråga (Story 18.4): the things of every place and boende as one
// list the page searches in the browser, with no AI and no request. Pure.

/** A thing in the index, with the place, boende and card it is on. */
export type IndexedThing = {
  id: string;
  name: string;
  category: ThingCategory;
  whereHint: string | null;
  /** On how many cards of the room it is seen (Story 18.6): 1 for a thing on one card. */
  seenOn: number;
};

/** A place with the things of its latest finished card, as the search and the question see it. */
export type IndexedPlace = {
  id: string;
  siteId: string;
  siteName: string;
  room: string;
  part: string | null;
  /** A box: `part` is its name, and its things are "i Blå backen". */
  isBox: boolean;
  /** When the card was taken. */
  cardTakenAt: Date;
  /** How many closed containers the card could not see into. */
  hidden: number;
  things: IndexedThing[];
};

/** The most things the index holds; a sane limit for the page, not a rule of the table. */
export const maxIndexedThings = 3_000;
/** The most hits the list shows. */
export const maxHits = 100;

/** Text for comparing: Unicode NFC, lower case as Swedish has it, single spaces. */
export function searchKey(text: string): string {
  return text.normalize("NFC").toLocaleLowerCase("sv").replace(/\s+/g, " ").trim();
}

export type ThingHit = {
  thing: IndexedThing;
  place: IndexedPlace;
};

/**
 * The things whose name or category holds every word of `query`, best first:
 * a name that starts with the first word, then the others by name. Nothing
 * for an empty query. At most maxHits; `total` is how many matched.
 */
export function searchThings(places: readonly IndexedPlace[], query: string): { hits: ThingHit[]; total: number } {
  const words = searchKey(query).split(" ").filter(Boolean);
  if (words.length === 0) return { hits: [], total: 0 };
  const matches: { hit: ThingHit; key: string; starts: boolean }[] = [];
  for (const place of places) {
    for (const thing of place.things) {
      const key = searchKey(thing.name);
      const haystack = `${key} ${searchKey(thing.category)}`;
      if (words.every((word) => haystack.includes(word))) matches.push({ hit: { thing, place }, key, starts: key.startsWith(words[0]) });
    }
  }
  matches.sort((a, b) => Number(b.starts) - Number(a.starts) || a.key.localeCompare(b.key, "sv"));
  return { hits: matches.slice(0, maxHits).map(({ hit }) => hit), total: matches.length };
}

/** Where a thing is: the room, the part and where on the card ("Skräpförrådet, Översta hyllan, på väggen, mitten"). */
export function hitWhere({ thing, place }: ThingHit): string {
  return [place.room, place.isBox && place.part ? inBoxText(place.part) : place.part, thing.whereHint].filter(Boolean).join(", ");
}

/** The line under a hit's name: "Skräpförrådet, väggen · Hemma · 31 okt", with "syns på 2 kort" last for a thing the room's cards overlap on. With the name first it reads "Hammare · Skräpförrådet, väggen · Hemma · 31 okt". */
export function hitMeta(hit: ThingHit): string {
  return [hitWhere(hit), hit.place.siteName, shortDateText(hit.place.cardTakenAt), seenOnText(hit.thing.seenOn)].filter(Boolean).join(" · ");
}

/** The tile of a hit's category, as everywhere. */
export function hitTile(hit: ThingHit): { icon: string; tile: string } {
  return thingTiles[hit.thing.category];
}

export const searchLabel = "Sök bland prylar";
export const searchPlaceholder = "Till exempel hammare";

/** "Inga prylar matchar "hammare"." */
export function noHitsText(query: string): string {
  return `Inga prylar matchar "${query.trim()}".`;
}

/** "Visar 100 av 240. Skriv mer för att begränsa." */
export function moreHitsText(shown: number, total: number): string {
  return `Visar ${shown} av ${total}. Skriv mer för att begränsa.`;
}

/** The count of hits for screen readers: "3 prylar". */
export function hitCountText(count: number): string {
  return count === 1 ? "1 pryl" : `${count} prylar`;
}
