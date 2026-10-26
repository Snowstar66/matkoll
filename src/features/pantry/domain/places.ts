import { LOCATIONS, type Location } from "@/features/catalog";

// The locations as Hemma names them (UX: Platskort): the address
// (`/hemma?plats=frys`), the count on a card and the empty state.

const slugs: Record<Location, string> = { Kyl: "kyl", Frys: "frys", Skafferi: "skafferi" };

/** The location's value in `?plats=`: "kyl", "frys" or "skafferi". */
export function placeSlug(location: Location): string {
  return slugs[location];
}

/** The location for `?plats=`; anything else, several values or none is Kyl. */
export function placeFromSlug(value: string | string[] | undefined): Location {
  return LOCATIONS.find((location) => slugs[location] === value) ?? "Kyl";
}

/** "1 vara", "3 varor", "0 varor". */
export function itemCountText(count: number): string {
  return `${count} ${count === 1 ? "vara" : "varor"}`;
}

/** The location in definite form: "kylen", "frysen", "skafferiet". */
export const definite: Record<Location, string> = { Kyl: "kylen", Frys: "frysen", Skafferi: "skafferiet" };

/** "Inget i kylen än.", "Inget i frysen än." or "Inget i skafferiet än." */
export function emptyPlaceText(location: Location): string {
  return `Inget i ${definite[location]} än.`;
}

/** The short confirmation after saving an item: "Mjölk är sparad i kylen." */
export function savedItemText(name: string, location: Location): string {
  return `${name} är sparad i ${definite[location]}.`;
}

/**
 * The short confirmation, with "Ångra", for every item removed while the same
 * confirmation has shown: "Mjölk är borttagen.", "Mjölk och Smör är
 * borttagna." or "3 varor är borttagna."
 */
export function removedItemsText(names: readonly string[]): string {
  if (names.length === 1) return `${names[0]} är borttagen.`;
  if (names.length === 2) return `${names[0]} och ${names[1]} är borttagna.`;
  return `${names.length} varor är borttagna.`;
}

/** The short confirmation after confirming several lagerförslag at once: "Lagt 1 vara i lagret.", "Lagt 4 varor i lagret." */
export function confirmedItemsText(count: number): string {
  return `Lagt ${itemCountText(count)} i lagret.`;
}

/** The short confirmation, with "Ångra", after rejecting a lagerförslag: "ketchup är avvisad." */
export function rejectedItemText(name: string): string {
  return `${name} är avvisad.`;
}

// "Töm en plats" (Story 6.3).

/** The text button under the list, and the sheet's title and button: "Töm kylen", "Töm frysen", "Töm skafferiet". */
export function emptyPlaceButtonText(location: Location): string {
  return `Töm ${definite[location]}`;
}

/** The sheet's question: "Ta bort alla 14 varor i kylen?" or "Ta bort 1 vara i kylen?" */
export function emptyPlaceQuestion(location: Location, count: number): string {
  const what = count === 1 ? "1 vara" : `alla ${itemCountText(count)}`;
  return `Ta bort ${what} i ${definite[location]}?`;
}

/** Under the question: emptying can be undone, so no "Det går inte att ångra." */
export const emptyPlaceUndoHint = "Du kan ångra direkt efteråt.";

/** The short confirmation, with "Ångra": "Tog bort 14 varor ur kylen." or "Tog bort 1 vara ur kylen." */
export function emptiedPlaceText(location: Location, count: number): string {
  return `Tog bort ${itemCountText(count)} ur ${definite[location]}.`;
}

const alreadyEmpty: Record<Location, string> = {
  Kyl: "Kylen är redan tom.",
  Frys: "Frysen är redan tom.",
  Skafferi: "Skafferiet är redan tomt.",
};

/** The short confirmation, without "Ångra", when another tab had emptied the location: "Kylen är redan tom." */
export function alreadyEmptyText(location: Location): string {
  return alreadyEmpty[location];
}

/** After "Ångra", for the rows the location has again: "1 vara gick inte att ångra." or "2 varor gick inte att ångra." */
export function notRestoredText(count: number): string {
  return `${itemCountText(count)} gick inte att ångra.`;
}

/**
 * The short confirmation, with "Ångra", for removals undone together: an
 * emptied location with single items removed meanwhile, or several
 * locations. "Tog bort 15 varor ur kylen." when they are all from one
 * location, else "Tog bort 17 varor."
 */
export function removedCountText(count: number, locations: readonly Location[]): string {
  const [only, ...others] = new Set(locations);
  return only !== undefined && others.length === 0 ? emptiedPlaceText(only, count) : `Tog bort ${itemCountText(count)}.`;
}

const maybeEmptied: Record<Location, string> = {
  Kyl: "Kylen kan ha tömts.",
  Frys: "Frysen kan ha tömts.",
  Skafferi: "Skafferiet kan ha tömts.",
};

/**
 * The short confirmation, with "Ångra", when "Töm kylen" got no answer but
 * the location looks empty when the page is read again: "Kylen kan ha tömts."
 */
export function maybeEmptiedText(location: Location): string {
  return maybeEmptied[location];
}
