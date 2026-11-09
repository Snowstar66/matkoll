import { allergenHits, type AllergenHit } from "./allergens";
import { toSek } from "./currency";
import { menuGroups, type MenuAllergen, type MenuDish, type MenuGroup } from "./types";

/** "Hjälp mig välja" marks dishes against what you avoid; "Bara förklara menyn" only explains. */
export type MenuMode = "help" | "explain";

// What the menu page shows: the dishes in groups, filtered, with their price text and what to warn about.

/** The dishes of each group that has any, in the order of menuGroups; the dishes keep their order within a group. */
export function groupDishes<T extends Pick<MenuDish, "grupp">>(dishes: readonly T[]): { group: MenuGroup; dishes: T[] }[] {
  return menuGroups
    .map((group) => ({ group, dishes: dishes.filter((dish) => dish.grupp === group) }))
    .filter((entry) => entry.dishes.length > 0);
}

const symbols: Readonly<Record<string, string>> = { EUR: "€", GBP: "£", USD: "$", SEK: "kr" };

function amountText(amount: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** "185 kr" for kronor; "14,50 € · ca 165 kr" for another currency; "" when the dish has no price. */
export function priceText(dish: Pick<MenuDish, "pris" | "valuta">): string {
  if (dish.pris === null || !Number.isFinite(dish.pris)) return "";
  const currency = dish.valuta?.trim().toUpperCase() ?? null;
  const own = `${amountText(dish.pris)} ${currency ? (symbols[currency] ?? currency) : ""}`.trim();
  if (currency === "SEK" || currency === null) return own;
  const sek = toSek(dish.pris, currency);
  return sek === null ? own : `${own} · ca ${sek} kr`;
}

/** The price in kronor (the dish's own for SEK, else at the approximate rates), or null without a price or a known currency. */
export function dishSek(dish: Pick<MenuDish, "pris" | "valuta">): number | null {
  return toSek(dish.pris, dish.valuta);
}

/** The currencies the menu's prices are in, as symbols, in order of first appearance: ["€"]. */
export function currencySymbols(dishes: readonly Pick<MenuDish, "pris" | "valuta">[]): string[] {
  const seen = new Set<string>();
  for (const dish of dishes) {
    const currency = dish.pris === null ? null : (dish.valuta?.trim().toUpperCase() ?? null);
    if (currency) seen.add(symbols[currency] ?? currency);
  }
  return [...seen];
}

export type DishFilter = {
  query: string;
  vegetarian: boolean;
  noShellfish: boolean;
  /** Only dishes with a known price under this many kronor. */
  underSek: number | null;
};

export const noFilter: DishFilter = { query: "", vegetarian: false, noShellfish: false, underSek: null };

export const underSekLimit = 200;

function includesText(haystack: string, needle: string): boolean {
  return haystack.toLocaleLowerCase("sv-SE").includes(needle.toLocaleLowerCase("sv-SE"));
}

/** The dishes that match the search text (name, explanation, ingredients) and every chosen filter. */
export function filterDishes<T extends MenuDish>(dishes: readonly T[], filter: DishFilter): T[] {
  const query = filter.query.trim();
  return dishes.filter((dish) => {
    if (query && ![dish.originalnamn, dish.forklaring, ...dish.huvudingredienser].some((text) => includesText(text, query))) return false;
    if (filter.vegetarian && dish.kategori !== "vegetariskt" && dish.kategori !== "veganskt") return false;
    if (filter.noShellfish && (dish.kategori === "skaldjur" || allergenHits(dish, ["skaldjur"]).length > 0)) return false;
    if (filter.underSek !== null) {
      const sek = dishSek(dish);
      if (sek === null || sek >= filter.underSek) return false;
    }
    return true;
  });
}

/** What "Hjälp mig välja" marks a dish with: its allergen hits and the disliked words found in it. */
export type DishMatch = { hits: AllergenHit[]; disliked: string[] };

/** The disliked words as typed: split on commas and line breaks, trimmed, no empties, no repeats. */
export function parseDislikes(text: string): string[] {
  return [...new Set(text.split(/[,\n;]/).map((word) => word.trim()).filter((word) => word !== ""))];
}

/** The allergens to avoid that the dish has or may have, and the disliked words that appear in its name, explanation or ingredients. */
export function matchDish(dish: MenuDish, avoid: readonly MenuAllergen[], dislikes: readonly string[]): DishMatch {
  const texts = [dish.originalnamn, dish.forklaring, ...dish.huvudingredienser];
  return {
    hits: allergenHits(dish, avoid),
    disliked: dislikes.filter((word) => texts.some((text) => includesText(text, word))),
  };
}
