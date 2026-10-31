import { LOCATIONS, nameInText, type Location, type NameInText } from "@/features/catalog";
import { siteSuffix, type SelectedSite } from "./site";

/** What the texts for "Töm kylen" need of a place (Story 8.4). */
type NamedSite = Pick<SelectedSite, "name" | "siteCount">;

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
 * confirmation has shown: "Mjölk är borttagen.", "Mjölk och smör är
 * borttagna." or "3 varor är borttagna." Story 10.4: the first name starts
 * the sentence with a capital; the second is inside it, so a catalog name
 * starts in lower case and the user's own text stays as written (NameInText).
 */
export function removedItemsText(names: readonly NameInText[]): string {
  if (names.length === 1) return `${nameInText(names[0], "start")} är borttagen.`;
  if (names.length === 2) return `${nameInText(names[0], "start")} och ${nameInText(names[1], "inside")} är borttagna.`;
  return `${names.length} varor är borttagna.`;
}

/**
 * The short confirmation, with "Ångra", for the items removed one by one in
 * Förråd while it shows (Story 11.3, EXPERIENCE.md, Soptunna): "Tog bort
 * Gräddfil.", "Tog bort Gräddfil och Mjölk." or "Tog bort 3 varor." The names
 * are written as the list shows them.
 */
export function removedItemText(names: readonly string[]): string {
  if (names.length === 1) return `Tog bort ${names[0]}.`;
  if (names.length === 2) return `Tog bort ${names[0]} och ${names[1]}.`;
  return `Tog bort ${itemCountText(names.length)}.`;
}

/** The short confirmation after confirming several lagerförslag at once: "Lagt 1 vara i förrådet.", "Lagt 4 varor i förrådet." */
export function confirmedItemsText(count: number): string {
  return `Lagt ${itemCountText(count)} i förrådet.`;
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

/**
 * The sheet's question: "Ta bort alla 14 varor i kylen?" or "Ta bort 1 vara
 * i kylen?"; with more than one place (Story 8.4) "Ta bort alla 14 varor i
 * kylen för Stugan?" (siteSuffix).
 */
export function emptyPlaceQuestion(location: Location, count: number, site: NamedSite | null): string {
  const what = count === 1 ? "1 vara" : `alla ${itemCountText(count)}`;
  return `Ta bort ${what} i ${definite[location]}${siteSuffix(site)}?`;
}

/** Under the question: emptying can be undone, so no "Det går inte att ångra." */
export const emptyPlaceUndoHint = "Du kan ångra direkt efteråt.";

/**
 * The short confirmation, with "Ångra": "Tog bort 14 varor ur kylen." or
 * "Tog bort 1 vara ur kylen."; with more than one place (Story 8.4) "Tog
 * bort 14 varor ur kylen för Stugan." (siteSuffix).
 */
export function emptiedPlaceText(location: Location, count: number, site: NamedSite | null): string {
  return `Tog bort ${itemCountText(count)} ur ${definite[location]}${siteSuffix(site)}.`;
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
 * locations. "Tog bort 15 varor ur kylen." (with " för Stugan" from two
 * places, Story 8.4) when they are all from one location of one place
 * (`site`), else "Tog bort 17 varor." `site` is `null` when they are from
 * more than one place.
 */
export function removedCountText(count: number, locations: readonly Location[], site: NamedSite | null): string {
  const [only, ...others] = new Set(locations);
  return only !== undefined && others.length === 0 && site !== null
    ? emptiedPlaceText(only, count, site)
    : `Tog bort ${itemCountText(count)}.`;
}

/**
 * After "Ångra" put rows back on another place than the one Hemma shows
 * (Story 8.4), so the list does not show them: "Lade tillbaka 14 varor i
 * kylen för Stugan." With more than one location, or more than one place
 * (`site` null), "Lade tillbaka 15 varor.".
 */
export function restoredElsewhereText(count: number, locations: readonly Location[], site: NamedSite | null): string {
  const [only, ...others] = new Set(locations);
  const where = only !== undefined && others.length === 0 && site !== null ? ` i ${definite[only]}${siteSuffix(site)}` : "";
  return `Lade tillbaka ${itemCountText(count)}${where}.`;
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

// "Inventera en plats med foto" (Story 6.4).

/** The short confirmation, with "Ångra", after "Behåll" on a "Syns inte längre" card: "senap står kvar i kylen." */
export function keptItemText(name: string, location: Location): string {
  return `${name} står kvar i ${definite[location]}.`;
}

/** The short confirmation, without "Ångra", when the item's rows were gone already: "yoghurt är redan borttagen." */
export function alreadyRemovedText(name: string): string {
  return `${name} är redan borttagen.`;
}

const updated: Record<Location, string> = {
  Kyl: "Kylen är uppdaterad",
  Frys: "Frysen är uppdaterad",
  Skafferi: "Skafferiet är uppdaterat",
};

/** "1 ny", "3 nya": counts of the parts of an inventory, singular and plural. */
function countWord(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The short confirmation after "Bekräfta alla" on a compared photo: "Kylen
 * är uppdaterad: 3 nya, 1 ändrad och 2 borttagna." A part that is 0 is left
 * out, and with none left it is "Kylen är uppdaterad."
 */
export function inventoryAppliedText(
  location: Location,
  { added, changed, removed }: { added: number; changed: number; removed: number },
): string {
  const parts = [
    added > 0 ? countWord(added, "ny", "nya") : null,
    changed > 0 ? countWord(changed, "ändrad", "ändrade") : null,
    removed > 0 ? countWord(removed, "borttagen", "borttagna") : null,
  ].filter((part) => part !== null);
  if (parts.length === 0) return `${updated[location]}.`;
  const listed = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} och ${parts.at(-1)}`;
  return `${updated[location]}: ${listed}.`;
}
