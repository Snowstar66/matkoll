import { compareCategories, displayCategory, searchText, type Category, type Location } from "@/features/catalog";
import { comparePantryItems, type PantryItem } from "./pantry-item";
import { definite } from "./places";

// Lagersaldo in the new look (Story 11.3, FR-40, FR-41): the items of one
// location under their display categories, one row per item without its
// amount, the line under the name (the brand, else when the item was added)
// and a search within the location. Pure, so it is tested with a fixed `now`.

/** Days are counted in Swedish time, wherever the page is rendered. */
const pantryTimeZone = "Europe/Stockholm";

/** The month abbreviations, fixed so the server and every browser write the same (as planDateText). */
const shortMonths = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

/** The calendar day of `date` in Stockholm. */
function stockholmDay(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: pantryTimeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  })
    .formatToParts(date)
    .reduce<Record<string, number>>((all, part) => ({ ...all, [part.type]: Number(part.value) }), {});
  return { year: parts.year, month: parts.month, day: parts.day };
}

const dayMs = 24 * 60 * 60 * 1000;

/**
 * When an item was added, from `createdAt` (ISO 8601) and `now`, by calendar
 * days in Stockholm: "Tillagd idag", "Tillagd igår", "Tillagd för 6 dagar
 * sedan" (2–13 days), "Tillagd 24 okt" (14 days or more, the same year) or
 * "Tillagd 24 okt 2025" (another year). A time after `now` (another clock)
 * is today. `null` for a time that cannot be read.
 */
export function addedText(createdAt: string, now: Date): string | null {
  const added = new Date(createdAt);
  if (!Number.isFinite(added.getTime()) || !Number.isFinite(now.getTime())) return null;
  const then = stockholmDay(added);
  const today = stockholmDay(now);
  const days = Math.round(
    (Date.UTC(today.year, today.month - 1, today.day) - Date.UTC(then.year, then.month - 1, then.day)) / dayMs,
  );
  if (days <= 0) return "Tillagd idag";
  if (days === 1) return "Tillagd igår";
  if (days < 14) return `Tillagd för ${days} dagar sedan`;
  const date = `${then.day} ${shortMonths[then.month - 1]}`;
  return then.year === today.year ? `Tillagd ${date}` : `Tillagd ${date} ${then.year}`;
}

/**
 * The line under an item's name in Lagersaldo (FR-42): its brand when it has
 * one ("Arla laktosfri"), else when it was added (addedText); `null` for
 * neither, as a placeholder row without a time.
 */
export function pantryMetaText(item: Pick<PantryItem, "label" | "createdAt">, now: Date): string | null {
  if (item.label) return item.label;
  return item.createdAt ? addedText(item.createdAt, now) : null;
}

/** The items of one category, as Lagersaldo shows them. */
export type PantryCategoryGroup = { category: Category; items: PantryItem[] };

/**
 * The items under their display categories (`displayCategory(section,
 * name)`, AD-12): the categories in the store's order (`CATEGORIES`), the
 * items within one in Swedish alphabetical order (comparePantryItems). A
 * category without items is left out.
 */
export function groupPantryByCategory(items: readonly PantryItem[]): PantryCategoryGroup[] {
  const groups = new Map<Category, PantryItem[]>();
  for (const item of items) {
    const category = displayCategory(item.section, item.name);
    const group = groups.get(category);
    if (group) group.push(item);
    else groups.set(category, [item]);
  }
  return [...groups]
    .sort(([a], [b]) => compareCategories(a, b))
    .map(([category, grouped]) => ({ category, items: grouped.sort(comparePantryItems) }));
}

/**
 * The items whose name or brand holds `query`, without regard to upper and
 * lower case; å, ä and ö are letters of their own, as in Swedish. An empty
 * query (or only spaces) keeps every item.
 */
export function filterPantry(items: readonly PantryItem[], query: string): readonly PantryItem[] {
  const text = searchText(query);
  if (text === "") return items;
  return items.filter((item) => searchText(item.name).includes(text) || searchText(item.label ?? "").includes(text));
}

/** The search field's name and placeholder: "Sök i kylen", "Sök i frysen" or "Sök i skafferiet". */
export function pantrySearchLabel(location: Location): string {
  return `Sök i ${definite[location]}`;
}

/** When the search matches nothing: "Inget i kylen matchar." */
export function noMatchText(location: Location): string {
  return `Inget i ${definite[location]} matchar.`;
}
