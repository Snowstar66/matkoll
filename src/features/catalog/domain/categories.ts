import { z } from "zod";
import { normalizeIngredientText } from "./normalize";
import { type Section, simplifyLabel, toSection } from "./sections";

// Display categories (Epic 11, AD-12): how Matvaror and Inköpslista group
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
 * name is one of them, its first word is one ("Senap grov", "Peppar svart
 * hel"), or its last word ends with one ("sojasås" on "sås", "dijonsenap" on
 * "senap", "flingsalt" on "salt"). Only the end of the last word counts, so
 * "saltgurka" and "pepparkakor" stay in Skafferi. The list may grow; each
 * word is in the table test. See `displayCategory` for the full rule.
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
  // Review of Story 11.1:
  "såser",
  "pepparkorn",
  "svartpepparkorn",
  "gurkmeja",
  "kurkuma",
  "koriander",
  "anis",
  "stjärnanis",
  "mirin",
  "miso",
  "teriyaki",
  "vanilj",
  "chiliflingor",
  "kanelstänger",
  "fondkoncentrat",
  "buljongkoncentrat",
  "fänkålsfrö",
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

/** Text without diacritics, so "Sojasas" matches "sås"; å, ä and ö become a, a and o on both sides. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").normalize("NFC");
}

const sauceWords: ReadonlySet<string> = new Set(SAUCE_WORDS.map(fold));

/** Compound seasonings matched on the (folded) last word: "vitlökspulver", "currypulver", but never "bakpulver". */
const saucePatterns: readonly RegExp[] = [/(?:lok|vitlok|curry|ingefara?|buljong|chili|paprika)s?pulver$/];

/** Words that join a dish's parts: "Makrill i tomatsås" is fish, not a sauce. */
const connectives: ReadonlySet<string> = new Set(["i", "med", "och", "&", "con"]);

/** First words of snacks, whose flavour comes last: "Chips dill", "Jordnötter chili", "Nötmix salt". */
const snackWords = ["chips", "notter", "notmix", "popcorn", "ostbagar", "kex", "crackers", "mandlar", "pinnar", "snacks"];

/** A package size: "150", "1,5", "250g", "33cl", "4x125g", "36%". */
const sizeToken = /^\d+(?:[.,]\d+)?(?:x\d+(?:[.,]\d+)?)?(?:g|kg|mg|ml|cl|dl|l|st|p|pack|%)?$/;
/** A unit written after a size: "150 ml", "36 %". */
const sizeUnits: ReadonlySet<string> = new Set(["g", "kg", "mg", "ml", "cl", "dl", "l", "st", "p", "pack", "%", "forp"]);

/** The folded, normalised words of a name, without package sizes ("Sojasås 150 ml" → ["sojasas"]). */
function nameWords(name: string): string[] {
  const words: string[] = [];
  let afterSize = false;
  for (const word of fold(normalizeIngredientText(name)).split(" ")) {
    if (word === "") continue;
    if (sizeToken.test(word)) {
      afterSize = true;
      continue;
    }
    if (afterSize && sizeUnits.has(word)) continue;
    afterSize = false;
    words.push(word);
  }
  return words;
}

const endsWithSauce = (word: string) =>
  [...sauceWords].some((sauce) => word.endsWith(sauce)) || saucePatterns.some((pattern) => pattern.test(word));

/** Whether one name (or the part before its comma) is a sauce or seasoning. */
function isSauceText(name: string): boolean {
  const words = nameWords(name);
  if (words.length === 0) return false;
  if (sauceWords.has(words.join(" "))) return true;
  const [first] = words;
  if (snackWords.some((snack) => first.endsWith(snack))) return false;
  // "Chili con carne" is a dish; "Senap med honung" is still mustard.
  if (words.length > 1 && sauceWords.has(first) && !words.includes("con")) return true;
  if (words.slice(1, -1).some((word) => connectives.has(word))) return false;
  return endsWithSauce(words[words.length - 1]);
}

/** Whether a name is a sauce or seasoning by `SAUCE_WORDS`, whatever its section. */
function isSauceName(name: string | null | undefined): boolean {
  const text = name ?? "";
  const head = text.split(",")[0];
  return isSauceText(text) || (head !== text && isSauceText(head));
}

/**
 * Written section texts that already name a category: a category's own name
 * ("Mejeri & ägg", "Såser & smaksättare"), or "kryddor" and "såser". They win
 * over `toSection`, which knows only the store sections. Skafferi is left out,
 * so its items are still checked for sauces by name.
 */
const sauces: Category = "Såser & smaksättare";
const writtenCategories = new Map<string, Category>([
  ...CATEGORIES.filter((category) => category !== "Skafferi").map(
    (category) => [simplifyLabel(category), category] as const,
  ),
  ...["krydda", "kryddor", "sås", "såser", "smaksättare", "kryddor och såser", "såser och kryddor"].map(
    (text) => [text, sauces] as const,
  ),
]);

/**
 * The one rule for the category an item is shown under: its section's
 * category, except that an item in Skafferi whose name is a sauce or
 * seasoning is Såser & smaksättare. The section may be written text (an AI
 * hint, an old row): a category's own name, "kryddor" or "såser" give that
 * category; otherwise it goes through `toSection`, and an unknown one is
 * Övrigt.
 *
 * A name is a sauce or seasoning when, after package sizes ("150 ml") are
 * dropped and diacritics folded, it is a word in `SAUCE_WORDS`; its first
 * word is one ("Senap grov"); or its last word ends with one ("Sojasås") or
 * is a compound powder ("Vitlökspulver"). The last word does not count after
 * a connective ("Makrill i tomatsås", "Krossade tomater med basilika") or in
 * a snack ("Chips dill", "Nötmix salt"). The part before a comma is checked
 * too ("Senap, söt").
 */
export function displayCategory(section: string | null | undefined, name: string | null | undefined): Category {
  const written = writtenCategories.get(simplifyLabel(section));
  if (written) return written;
  const category = sectionCategory[toSection(section)];
  return category === "Skafferi" && isSauceName(name) ? "Såser & smaksättare" : category;
}

/** The place of a category in the store's order; an unknown text comes after Övrigt. */
function categoryRank(category: string): number {
  const index = (CATEGORIES as readonly string[]).indexOf(category);
  return index < 0 ? CATEGORIES.length : index;
}

/** Sorts categories in the store's order (`CATEGORIES`); an unknown one sorts last. */
export function compareCategories(a: Category | string, b: Category | string): number {
  return categoryRank(a) - categoryRank(b);
}
