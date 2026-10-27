import { compareCategories, displayCategory, type Category, type Location } from "@/features/catalog";
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

/** The calendar day of `date` in Stockholm as "2026-10-27": two times on the same day give the same key. */
export function stockholmDayKey(date: Date): string {
  const { year, month, day } = stockholmDay(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * How long until the next midnight in Stockholm, at least a second. On the
 * days the clocks change it may be an hour off; the caller checks the day
 * again when it fires.
 */
export function msUntilStockholmMidnight(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: pantryTimeZone,
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hourCycle: "h23",
  })
    .formatToParts(now)
    .reduce<Record<string, number>>((all, part) => ({ ...all, [part.type]: Number(part.value) }), {});
  const passed = ((parts.hour * 60 + parts.minute) * 60 + parts.second) * 1000 + now.getMilliseconds();
  return Math.max(1000, dayMs - passed);
}

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
  // A brand of only spaces is none.
  const label = item.label?.trim();
  if (label) return label;
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

/** The letters that keep their marks: in Swedish they are letters of their own. */
const ownLetters = new Set(["å", "ä", "ö"]);

/**
 * Text as the search compares it: composed (NFC), in Swedish lower case,
 * with single spaces, curly apostrophes as "'" and the marks taken off every
 * letter but å, ä and ö ("Crème" is "creme", "jalapeño" "jalapeno").
 */
export function pantrySearchText(text: string): string {
  const folded = [...text.normalize("NFC").toLocaleLowerCase("sv-SE")]
    .map((char) => (ownLetters.has(char) ? char : char.normalize("NFD").replace(/\p{M}/gu, "")))
    .join("");
  return folded.replace(/[\u2018\u2019\u02BC]/g, "'").replace(/\s+/g, " ").trim();
}

/**
 * The items whose name and brand hold every word of `query`, in any order
 * ("mjölk arla"), compared with pantrySearchText: without regard to case or
 * marks, but å, ä and ö are letters of their own. An empty query (or only
 * spaces) keeps every item.
 */
export function filterPantry(items: readonly PantryItem[], query: string): readonly PantryItem[] {
  const text = pantrySearchText(query);
  if (text === "") return items;
  const words = text.split(" ");
  return items.filter((item) => {
    const haystack = pantrySearchText(`${item.name} ${item.label ?? ""}`);
    return words.every((word) => haystack.includes(word));
  });
}

/** The search field's name and placeholder: "Sök i kylen", "Sök i frysen" or "Sök i skafferiet". */
export function pantrySearchLabel(location: Location): string {
  return `Sök i ${definite[location]}`;
}

/** When the search matches nothing: "Inget i kylen matchar." */
export function noMatchText(location: Location): string {
  return `Inget i ${definite[location]} matchar.`;
}
