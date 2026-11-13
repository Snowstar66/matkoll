import type { Person } from "./profile";
import type { MenuCategory, MenuDish } from "./types";

// Free-text food preferences ("Undviker" / "Älskar"): the tag lists as stored, and matching a tag against a dish.
// Pure. A tag is matched on whole words, or as the START of a longer word, so "vitlök" finds "vitlökssås" but "ris"
// never finds "grisfötter". Small two-way synonym groups (sv/en/es) let "koriander" find "cilantro".

export const maxTags = 30;
export const maxTagLength = 40;

/** One list of tags from storage (never trusted): strings only, trimmed, no markup, display spelling kept, no repeats by lowercase. */
export function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    const tag = cleanTag(entry);
    if (tag === null || out.some((other) => sameTag(other, tag))) continue;
    out.push(tag);
    if (out.length >= maxTags) break;
  }
  return out;
}

export const sameTag = (a: string, b: string) => a.toLocaleLowerCase("sv-SE") === b.toLocaleLowerCase("sv-SE");

/** The tag trimmed and with inner spaces collapsed, or null when it is empty, too long or looks like code/markup. */
export function cleanTag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const tag = value.replace(/\s+/g, " ").trim();
  if (tag === "" || tag.length > maxTagLength || /[<>{}[\]\\`]|https?:/i.test(tag)) return null;
  return tag;
}

/** Adds one typed tag; the same list comes back with an error when it is empty, too long, a repeat or the list is full. */
export function addTag(tags: readonly string[], text: string): { tags: string[]; error: string | null } {
  const tag = text.replace(/\s+/g, " ").trim();
  const same = [...tags];
  if (tag === "") return { tags: same, error: null };
  if (tag.length > maxTagLength) return { tags: same, error: `Max ${maxTagLength} tecken.` };
  if (cleanTag(tag) === null) return { tags: same, error: "Skriv bara ord, inga tecken som < eller {." };
  if (tags.some((other) => sameTag(other, tag))) return { tags: same, error: "Det finns redan i listan." };
  if (tags.length >= maxTags) return { tags: same, error: `Max ${maxTags} stycken.` };
  return { tags: [...tags, tag], error: null };
}

// The same ingredient lines and tags are normalised again and again (every line against every allergen, every tag
// against every recipe), so the results are remembered; the memory is dropped when it grows past `memoLimit`.
const memoLimit = 4000;
const normalized = new Map<string, string>();
const tokenized = new Map<string, readonly string[]>();

function remember<T>(memo: Map<string, T>, key: string, make: () => T): T {
  const known = memo.get(key);
  if (known !== undefined) return known;
  if (memo.size >= memoLimit) memo.clear();
  const made = make();
  memo.set(key, made);
  return made;
}

/** Lower case; accents removed except å, ä, ö (Swedish letters stay, so "é" and "e" meet but "å" and "a" do not). */
export function normalizeText(text: string): string {
  return remember(normalized, text, () =>
    [...text.toLocaleLowerCase("sv-SE").normalize("NFC")].map((char) => ("åäö".includes(char) ? char : char.normalize("NFD").replace(/\p{M}/gu, ""))).join(""),
  );
}

/** The words of a text, normalised. The list is shared between calls: do not change it. */
export function tokens(text: string): readonly string[] {
  return remember(tokenized, text, () => normalizeText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
}

type Group = {
  terms: readonly string[];
  not?: readonly string[];
  category?: MenuCategory | readonly MenuCategory[];
  /** The dish's category only counts when none of these words is in the dish (a "kött" dish with kyckling is not red meat). */
  categoryUnless?: readonly string[];
};

// Meat, in three groups since "Kött" was split (2026-11-13): rött kött (the preset key stays "kott", so what is saved
// keeps its meaning for beef, lamb and game), fläskkött ("flask") and kyckling ("kyckling", poultry: kalkon too).
// Köttbullar and plain "kött"/"köttfärs" are red meat; blandfärs is both red meat and pork (it is both). Korv, bacon,
// skinka and the cured Spanish and Italian kinds are pork only, so whoever avoids red meat still gets Korv stroganoff
// and Pasta med bacon. A menu dish the reading put in the category "kott" counts as red meat unless it names pork or
// poultry.
const redMeat = [
  "rött kött", "kött", "meat", "carne", "nötkött", "nötfärs", "nötfilé", "nötbiff", "nötstek", "nötgryta", "nötkorv", "biff", "beef",
  "rostbiff", "oxfilé", "oxbringa", "entrecôte", "högrev", "flankstek", "bringa", "lamm", "lamb", "cordero", "kalv", "veal", "ternera",
  "vilt", "hjort", "rådjur", "älg", "renskav", "renstek", "vildsvin", "köttfärs", "köttbull", "blandfärs",
];
const pork = [
  "fläskkött", "fläsk", "sidfläsk", "stekfläsk", "pork", "cerdo", "bacon", "skink", "julskinka", "jamón", "serrano", "prosciutto", "pancetta",
  "guanciale", "karré", "kassler", "kotlett", "flintastek", "revben", "spareribs", "ribs", "porchetta", "carnitas", "korv", "falukorv",
  "prinskorv", "isterband", "chorizo", "salami", "mortadella", "salsiccia", "bratwurst", "blandfärs",
];
const poultry = ["kyckling", "majskyckling", "chicken", "pollo", "kalkon", "turkey", "pavo", "fågel", "höns", "broiler"];

const groups: readonly Group[] = [
  { terms: ["koriander", "cilantro", "coriander", "culantro"] },
  { terms: ["vitlök", "garlic", "ajo", "ajillo", "ail"] },
  { terms: ["lök", "rödlök", "salladslök", "schalottenlök", "silverlök", "vårlök", "onion", "cebolla", "cebolleta"] },
  { terms: ["paprika", "bell pepper", "pimiento"] },
  { terms: ["ost", "cheese", "queso", "parmesan", "mozzarella", "gorgonzola", "cheddar"], not: ["ostron"] },
  { terms: ["svamp", "mushroom", "champiñón", "seta", "hongo", "kantarell", "shiitake", "portobello"] },
  { terms: ["tomat", "tomato", "pomodoro"] },
  { terms: ["chili", "chilli", "chile", "jalapeño", "peperoncino"] },
  { terms: ["kryddstarkt", "stark", "starkt", "spicy", "picante", "chili", "chile", "jalapeño", "sriracha", "harissa", "habanero"] },
  { terms: ["ingefära", "ginger", "jengibre"] },
  { terms: ["räkor", "räka", "shrimp", "prawn", "gambas", "camarones"] },
  { terms: ["skaldjur", "shellfish", "mariscos", "räk", "hummer", "lobster", "krabba", "crab", "musslor", "mussels", "mejillones", "bläckfisk", "calamar", "pulpo", "ostron", "oyster"], category: "skaldjur" },
  { terms: ["fisk", "fish", "pescado", "lax", "salmon", "torsk", "cod", "bacalao", "pescatore"], category: "fisk" },
  { terms: redMeat, not: ["köttfri", "köttbuljong", "köttfond"], category: "kott", categoryUnless: [...pork.filter((term) => term !== "blandfärs"), ...poultry] },
  { terms: pork, not: ["korvbröd"] },
  { terms: poultry, not: ["pollock", "fågelbo"] },
  { terms: ["vegetariskt", "vegetarisk", "vegetarian", "vegetariano", "veggie", "veganskt", "vegansk", "vegan"], category: ["vegetariskt", "veganskt"] },
  { terms: ["ris", "rice", "arroz", "risotto", "paella"] },
  { terms: ["soppa", "soup", "sopa", "gazpacho", "bisque"] },
  { terms: ["sallad", "salad", "ensalada"], not: ["salladslök"] },
  { terms: ["burgare", "hamburgare", "burger", "hamburger", "cheeseburger", "hamburguesa"] },
  { terms: ["sött", "söt", "sweet", "dulce", "dessert", "efterrätt", "choklad", "chocolate", "glass", "tårta", "pannacotta", "tiramisu", "brownie", "kladdkaka", "karamell", "caramel"], not: ["sötpotatis"] },
  { terms: ["oliver", "olive", "olives", "aceituna", "aceitunas"] },
  { terms: ["ägg", "egg", "huevo"], not: ["äggplanta", "eggplant"] },
  { terms: ["nötter", "nuts", "nueces", "valnöt", "hasselnöt", "jordnöt", "cashew", "mandel", "almond", "peanut", "walnut", "hazelnut"] },
  { terms: ["oliv", "olive", "aceituna"] },
  { terms: ["ananas", "pineapple", "piña"] },
  { terms: ["lamm", "lamb", "cordero"] },
  { terms: ["pasta", "spaghetti", "penne", "tagliatelle", "fettuccine", "lasagne", "lasagna", "ravioli", "tortellini", "gnocchi", "carbonara", "macarrones"] },
  { terms: ["pizza", "calzone"] },
  { terms: ["taco", "tacos"] },
  { terms: ["sushi", "maki", "nigiri", "sashimi"] },
  { terms: ["grillat", "grillad", "grill", "grilled", "parrilla", "bbq", "barbecue"] },
  { terms: ["nasi goreng"] },
];

const prepared = groups.map((group) => ({
  ...group,
  terms: group.terms.map(normalizeText),
  not: (group.not ?? []).map(normalizeText),
  categoryUnless: (group.categoryUnless ?? []).map(normalizeText),
}));

/** The words a tag stands for: its synonym group(s) when it is one of their words, else just itself. */
type TagTerms = { terms: string[]; not: string[]; categories: MenuCategory[]; categoryUnless: string[] };
const termsOfTag = new Map<string, TagTerms>();

function termsFor(tag: string): TagTerms {
  return remember(termsOfTag, tag, () => buildTermsFor(tag));
}

function buildTermsFor(tag: string): TagTerms {
  const wanted = tokens(tag).join(" ");
  // The group the tag heads wins (chili is not "kryddstarkt"); else every group that has the word.
  const heads = prepared.filter((group) => group.terms[0] === wanted);
  const found = heads.length > 0 ? heads : prepared.filter((group) => group.terms.includes(wanted));
  if (found.length === 0) return { terms: wanted === "" ? [] : [wanted], not: [], categories: [], categoryUnless: [] };
  const heading = found.filter((group) => group.category && group.terms[0] === wanted);
  return {
    terms: [...new Set(found.flatMap((group) => group.terms))],
    not: found.flatMap((group) => group.not),
    categories: heading.flatMap((group) => [group.category!].flat()),
    categoryUnless: heading.flatMap((group) => group.categoryUnless),
  };
}

/** Whether the words of the term (all whole, the last one may only begin a compound word) are found in the tokens. */
export function hasTerm(textTokens: readonly string[], term: string, not: readonly string[]): boolean {
  if (!term.includes(" ")) {
    // The usual case, one word: no need to split the term and slice it for every position.
    const whole = term.length < 3;
    for (const token of textTokens) {
      if ((whole ? token === term : token.startsWith(term)) && !not.some((word) => token.startsWith(word))) return true;
    }
    return false;
  }
  const parts = term.split(" ");
  const last = parts[parts.length - 1];
  for (let i = 0; i + parts.length <= textTokens.length; i += 1) {
    if (!parts.slice(0, -1).every((part, k) => textTokens[i + k] === part)) continue;
    const token = textTokens[i + parts.length - 1];
    const hit = last.length < 3 ? token === last : token.startsWith(last);
    if (hit && !not.some((word) => token.startsWith(word))) return true;
  }
  return false;
}

/**
 * Whether the dish is what the tag names: its printed name, main ingredients or explanation has the tag (or a
 * synonym) as a word or the start of a compound word. A soft match: "paprika" also finds "paprikapulver". The
 * broad groups (fisk, skaldjur, rött kött) also count the dish's own category; rött kött only when the dish names no
 * pork or poultry.
 */
export function matchPreference(tag: string, dish: Pick<MenuDish, "originalnamn" | "huvudingredienser" | "forklaring" | "kategori">): boolean {
  return matchPreferenceTokens(tag, dishTokens(dish), dish.kategori);
}

/** The words of a dish's name, main ingredients and explanation, for matchPreferenceTokens (worked out once for many tags). */
export function dishTokens(dish: Pick<MenuDish, "originalnamn" | "huvudingredienser" | "forklaring">): string[] {
  return [dish.originalnamn, ...dish.huvudingredienser, dish.forklaring].flatMap(tokens);
}

/** matchPreference for a dish whose words are already known (dishTokens), so a list of tags does not read the dish again. */
export function matchPreferenceTokens(tag: string, textTokens: readonly string[], kategori: MenuDish["kategori"]): boolean {
  const { terms, not, categories, categoryUnless } = termsFor(tag);
  if (categories.includes(kategori) && !categoryUnless.some((term) => hasTerm(textTokens, term, []))) return true;
  return terms.some((term) => hasTerm(textTokens, term, not));
}

/** "Anna" or "du" for the one holding the phone. */
export const whoName = (person: Pick<Person, "id" | "name">) => (person.id === "me" ? "du" : person.name);
