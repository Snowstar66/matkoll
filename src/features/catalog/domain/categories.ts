import { z } from "zod";
import { normalizeIngredientText } from "./normalize";
import { type Section, toSection } from "./sections";

// Display categories (Epic 11, AD-12): how Lagersaldo and Inköpslista group
// items under a heading with an icon. A category is worked out from the
// item's store section and name every time it is shown and is never stored;
// AI schemas, prompts and the export still use the sections.

/** The nine categories, in the store's order. */
export const CATEGORIES = [
  "Frukt & grönt",
  "Bröd",
  "Mejeri & ägg",
  "Kött, fisk & chark",
  "Frys",
  "Skafferi",
  "Såser & smaksättare",
  "Dryck",
  "Övrigt",
] as const;

export const categorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof categorySchema>;

/**
 * Words that make an item in Skafferi a sauce or seasoning: its normalised
 * name is one of them, or its last word ends with one ("sojasås" on "sås",
 * "dijonsenap" on "senap", "flingsalt" on "salt"). Only the end counts, so
 * "saltgurka" and "pepparkakor" stay in Skafferi. The list may grow; each
 * word is in the table test.
 */
export const SAUCE_WORDS = [
  "sås",
  "sauce",
  "senap",
  "ketchup",
  "majonnäs",
  "aioli",
  "dressing",
  "vinäger",
  "ättika",
  "soja",
  "buljong",
  "buljongtärning",
  "buljongtärningar",
  "fond",
  "sambal",
  "oelek",
  "sriracha",
  "tabasco",
  "harissa",
  "wasabi",
  "chutney",
  "pesto",
  "salsa",
  "salt",
  "peppar",
  "krydda",
  "kryddor",
  "kryddmix",
  "curry",
  "masala",
  "paprikapulver",
  "chilipulver",
  "lökpulver",
  "chili",
  "chiliflakes",
  "kanel",
  "kardemumma",
  "muskot",
  "muskotnöt",
  "nejlika",
  "nejlikor",
  "ingefära",
  "lagerblad",
  "saffran",
  "oregano",
  "timjan",
  "basilika",
  "rosmarin",
  "mejram",
  "dragon",
  "dill",
  "spiskummin",
  "kummin",
] as const;

/** The category of each section; Skafferi may still become Såser & smaksättare by name. */
const sectionCategory: Record<Section, Category> = {
  "Frukt och grönt": "Frukt & grönt",
  Bröd: "Bröd",
  Mejeri: "Mejeri & ägg",
  "Kött och fisk": "Kött, fisk & chark",
  Chark: "Kött, fisk & chark",
  Frys: "Frys",
  Skafferi: "Skafferi",
  Dryck: "Dryck",
  Övrigt: "Övrigt",
};

const sauceWords: ReadonlySet<string> = new Set(SAUCE_WORDS);

/** Whether a name is a sauce or seasoning by `SAUCE_WORDS`, whatever its section. */
function isSauceName(name: string | null | undefined): boolean {
  const normalized = normalizeIngredientText(name);
  if (normalized === "") return false;
  if (sauceWords.has(normalized)) return true;
  const lastWord = normalized.split(" ").at(-1) ?? "";
  return SAUCE_WORDS.some((word) => lastWord.endsWith(word));
}

/**
 * The one rule for the category an item is shown under: its section's
 * category, except that an item in Skafferi whose name is a sauce or
 * seasoning is Såser & smaksättare. The section may be written text (an AI
 * hint, an old row); an unknown one is Övrigt, as in `toSection`.
 */
export function displayCategory(section: string | null | undefined, name: string | null | undefined): Category {
  const category = sectionCategory[toSection(section)];
  return category === "Skafferi" && isSauceName(name) ? "Såser & smaksättare" : category;
}

/** Sorts categories in the store's order (`CATEGORIES`). */
export function compareCategories(a: Category, b: Category): number {
  return CATEGORIES.indexOf(a) - CATEGORIES.indexOf(b);
}
