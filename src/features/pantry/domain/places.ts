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
