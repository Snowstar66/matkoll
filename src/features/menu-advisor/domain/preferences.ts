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

const sameTag = (a: string, b: string) => a.toLocaleLowerCase("sv-SE") === b.toLocaleLowerCase("sv-SE");

/** The tag trimmed and with inner spaces collapsed, or null when it is empty, too long or looks like code/markup. */
function cleanTag(value: unknown): string | null {
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

/** Lower case; accents removed except å, ä, ö (Swedish letters stay, so "é" and "e" meet but "å" and "a" do not). */
export function normalizeText(text: string): string {
  return [...text.toLocaleLowerCase("sv-SE").normalize("NFC")].map((char) => ("åäö".includes(char) ? char : char.normalize("NFD").replace(/\p{M}/gu, ""))).join("");
}

export function tokens(text: string): string[] {
  return normalizeText(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

type Group = { terms: readonly string[]; not?: readonly string[]; category?: MenuCategory };

const groups: readonly Group[] = [
  { terms: ["koriander", "cilantro", "coriander", "culantro"] },
  { terms: ["vitlök", "garlic", "ajo", "ail"] },
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
  { terms: ["kött", "meat", "carne", "biff", "beef", "fläsk", "pork", "cerdo", "kyckling", "chicken", "pollo"], category: "kott" },
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

const prepared = groups.map((group) => ({ ...group, terms: group.terms.map(normalizeText), not: (group.not ?? []).map(normalizeText) }));

/** The words a tag stands for: its synonym group(s) when it is one of their words, else just itself. */
function termsFor(tag: string): { terms: string[]; not: string[]; categories: MenuCategory[] } {
  const wanted = tokens(tag).join(" ");
  // The group the tag heads wins (chili is not "kryddstarkt"); else every group that has the word.
  const heads = prepared.filter((group) => group.terms[0] === wanted);
  const found = heads.length > 0 ? heads : prepared.filter((group) => group.terms.includes(wanted));
  if (found.length === 0) return { terms: wanted === "" ? [] : [wanted], not: [], categories: [] };
  return {
    terms: [...new Set(found.flatMap((group) => group.terms))],
    not: found.flatMap((group) => group.not),
    categories: found.flatMap((group) => (group.category && group.terms[0] === wanted ? [group.category] : [])),
  };
}

/** Whether the words of the term (all whole, the last one may only begin a compound word) are found in the tokens. */
export function hasTerm(textTokens: readonly string[], term: string, not: readonly string[]): boolean {
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
 * broad groups (fisk, skaldjur, kött) also count the dish's own category.
 */
export function matchPreference(tag: string, dish: Pick<MenuDish, "originalnamn" | "huvudingredienser" | "forklaring" | "kategori">): boolean {
  const { terms, not, categories } = termsFor(tag);
  if (categories.includes(dish.kategori)) return true;
  const textTokens = [dish.originalnamn, ...dish.huvudingredienser, dish.forklaring].flatMap(tokens);
  return terms.some((term) => hasTerm(textTokens, term, not));
}

/** The tags (display spelling) of the list the dish matches. */
export function preferenceHits(tags: readonly string[], dish: Parameters<typeof matchPreference>[1]): string[] {
  return tags.filter((tag) => matchPreference(tag, dish));
}

/** What a dish says about one person's free-text preferences. */
export type SoftFit = { person: Person; dislikes: string[]; likes: string[] };

/** For each person with a match, the tags they avoid and the tags they love that the dish has. */
export function softFitFor(dish: Parameters<typeof matchPreference>[1], company: readonly Person[]): SoftFit[] {
  return company.flatMap((person) => {
    const dislikes = preferenceHits(person.dislikes, dish);
    const likes = preferenceHits(person.likes, dish).filter((tag) => !dislikes.some((other) => sameTag(other, tag)));
    return dislikes.length > 0 || likes.length > 0 ? [{ person, dislikes, likes }] : [];
  });
}

/** "Anna" or "du" for the one holding the phone. */
export const whoName = (person: Pick<Person, "id" | "name">) => (person.id === "me" ? "du" : person.name);
