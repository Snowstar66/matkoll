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

const definite: Record<Location, string> = { Kyl: "kylen", Frys: "frysen", Skafferi: "skafferiet" };

/** "Inget i kylen än.", "Inget i frysen än." or "Inget i skafferiet än." */
export function emptyPlaceText(location: Location): string {
  return `Inget i ${definite[location]} än.`;
}
