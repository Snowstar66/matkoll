import type { NotePerson, PreferenceNote } from "@/components/preference-notes";
import { allergenLabels } from "./labels";
import { hasTerm, matchPreference, normalizeText, tokens } from "./preferences";
import type { MenuAllergen, MenuDish } from "./types";

// What a dish or recipe says about the household's food preferences, for any dish that is not a menu line: a name and a
// list of ingredient lines (a library recipe, an AI suggestion). Pure. Allergies are matched by keywords in the
// ingredient text, so they only ever say "kan innehålla"; they never claim a dish is safe. "Undviker" and "Älskar" use
// the same matching as the menu advisor (matchPreference).

/** A dish as text: its name and its ingredient lines ("2 dl grädde", or just names). */
export type FoodText = { name: string; ingredients: readonly string[] };

/** One person's preferences, as the notes need them. A household person (HouseholdFoodPerson) fits as it is. */
export type FitPerson = {
  /** The stable person key where there is one (HouseholdFoodPerson.personKey); the name stands in otherwise. */
  personKey?: string;
  name: string;
  allergies: readonly MenuAllergen[];
  dislikes: readonly string[];
  likes: readonly string[];
  /** Optional: the words of `dislikes` / `likes` that are the strong end (Ogillar / Älskar), which weigh more in a ranking. */
  strongDislikes?: readonly string[];
  strongLikes?: readonly string[];
};

/** One short sentence about a dish, ready to show: the kind sets the colour (allergy red, dislike calm, like positive). */
export type FitNote = PreferenceNote & {
  /** Set for a dislike or like at the strong end (Ogillar, Älskar); only the ranking looks at it. */
  strong?: boolean;
};

/** What goes to the model: the household's lists without names. */
export type FoodPrefs = { allergies: string[]; avoid: string[]; love: string[] };

type AllergenWords = { terms: readonly string[]; not?: readonly string[]; free?: string; ends?: readonly string[] };

// Keywords per allergen, whole words or the start of a compound ("mjölk" finds "mjölkchoklad"). Deliberately plain:
// a miss is possible (a hidden ingredient), so a note is a hint, never a guarantee.
const allergenWords: Readonly<Record<MenuAllergen, AllergenWords>> = {
  gluten: {
    terms: ["vete", "vetemjöl", "mjöl", "råg", "korn", "dinkel", "pasta", "spaghetti", "penne", "makaroner", "tagliatelle", "lasagne", "nudlar", "bröd", "ströbröd", "panko", "tortilla", "wrap", "couscous", "bulgur", "naan", "knäcke", "semolina", "pizzadeg", "filodeg"],
    not: ["mjölk"],
    ends: ["bröd"],
    free: "glutenfri",
  },
  laktos: {
    terms: ["mjölk", "grädde", "smör", "ost", "yoghurt", "yogurt", "filmjölk", "gräddfil", "kvarg", "creme fraiche", "fraiche", "mascarpone", "ricotta", "mozzarella", "parmesan", "feta", "halloumi", "cheddar", "keso", "vassle", "smetana"],
    not: ["ostron", "smörgås"],
    free: "laktosfri",
  },
  notter: {
    terms: ["nötter", "nötmix", "valnöt", "hasselnöt", "jordnöt", "pekannöt", "paranöt", "cashew", "mandel", "pistage", "macadamia", "nutella"],
    not: ["mandelpotatis"],
  },
  skaldjur: { terms: ["skaldjur", "räk", "räkor", "krabba", "hummer", "kräft", "mussla", "musslor", "scampi", "bläckfisk", "ostron", "pilgrimsmussla"], not: ["räkn"] },
  agg: { terms: ["ägg", "äggula", "äggvita", "majonnäs", "aioli"], not: ["äggplanta"] },
  fisk: { terms: ["fisk", "lax", "torsk", "sej", "sill", "makrill", "tonfisk", "ansjovis", "sardin", "rödspätta", "röding", "gös", "abborre", "strömming", "kolja", "hälleflundra"] },
  soja: { terms: ["soja", "sojasås", "tofu", "edamame", "tamari", "miso", "tempeh"] },
  sesam: { terms: ["sesam", "tahini"] },
};

const prepared = Object.fromEntries(
  (Object.keys(allergenWords) as MenuAllergen[]).map((key) => {
    const { terms, not = [], free, ends = [] } = allergenWords[key];
    return [key, { terms: terms.map(normalizeText), not: not.map(normalizeText), free: free ? normalizeText(free) : null, ends: ends.map(normalizeText) }];
  }),
) as Record<MenuAllergen, { terms: string[]; not: string[]; free: string | null; ends: string[] }>;

/** Whether one line of text names something the allergen is in ("2 dl grädde" and laktos; "glutenfri pasta" is not gluten). */
export function lineHasAllergen(allergen: MenuAllergen, line: string): boolean {
  const { terms, not, free, ends } = prepared[allergen];
  const found = tokens(line);
  if (free && found.some((token) => token.startsWith(free))) return false;
  // Words that END in the allergen are hits too for the few that are safe to read that way ("surdegsbröd").
  return terms.some((term) => hasTerm(found, term, not)) || ends.some((end) => found.some((token) => token.endsWith(end)));
}

const sameText = (a: string, b: string) => normalizeText(a) === normalizeText(b);

const lower = (text: string) => text.toLocaleLowerCase("sv-SE");

/** "gluten", "gluten och laktos", "a, b och c". */
function listWords(words: readonly string[]): string {
  return words.length <= 1 ? words.join("") : `${words.slice(0, -1).join(", ")} och ${words[words.length - 1]}`;
}

/** Longest list in one note; "Anna undviker lök, vitlök och koriander" is enough, more is cut. */
const maxWordsInNote = 3;

/**
 * The notes for a dish: the allergens its ingredients may hold (allergy, with who), then for each person the "Undviker"
 * tags it has (dislike) and the "Älskar" tags it has (like). Empty when nobody has anything filled in or nothing
 * matches: a dish nobody has an opinion on has no note.
 */
export function foodFit(food: FoodText, people: readonly FitPerson[]): FitNote[] {
  const lines = [food.name, ...food.ingredients];
  const asDish: Pick<MenuDish, "originalnamn" | "huvudingredienser" | "forklaring" | "kategori"> = {
    originalnamn: food.name,
    huvudingredienser: [...food.ingredients],
    forklaring: "",
    kategori: "ej_tillampligt",
  };
  const allergy = new Map<MenuAllergen, NotePerson[]>();
  const dislike: FitNote[] = [];
  const like: FitNote[] = [];
  for (const person of people) {
    const who: NotePerson = { id: person.personKey ?? person.name, name: person.name };
    for (const allergen of new Set(person.allergies)) {
      if (lines.some((line) => lineHasAllergen(allergen, line))) allergy.set(allergen, [...(allergy.get(allergen) ?? []), who]);
    }
    const avoids = person.dislikes.filter((tag) => matchPreference(tag, asDish));
    const loves = person.likes.filter((tag) => matchPreference(tag, asDish) && !avoids.some((other) => sameText(other, tag)));
    const strong = (words: readonly string[], of: readonly string[] | undefined) => words.some((word) => (of ?? []).some((other) => sameText(other, word)));
    if (avoids.length > 0) {
      const terms = avoids.slice(0, maxWordsInNote).map(lower);
      dislike.push({ kind: "dislike", text: `${person.name} undviker ${listWords(terms)}`, people: [who], terms, ...(strong(avoids, person.strongDislikes) ? { strong: true } : {}) });
    }
    const loved = loves.slice(0, maxWordsInNote).map(lower);
    if (loves.length > 0) like.push({ kind: "like", text: `${person.name} älskar ${listWords(loved)}`, people: [who], terms: loved, ...(strong(loves, person.strongLikes) ? { strong: true } : {}) });
  }
  const allergyNotes = [...allergy].map(([allergen, who]): FitNote => {
    const term = lower(allergenLabels[allergen]);
    return { kind: "allergy", text: `Kan innehålla ${term} (${who.map((person) => person.name).join(", ")})`, people: who, terms: [term] };
  });
  return [...allergyNotes, ...dislike, ...like];
}

/** Whether a dish may hold something a person is allergic to: such a dish is never suggested. */
export const hasAllergyNote = (notes: readonly FitNote[]) => notes.some((note) => note.kind === "allergy");

/**
 * -3 allergy, -2 a strong dislike (Ogillar), -1 a dislike, +1 only loved things, +2 only strongly loved (Älskar), 0 no
 * opinion: the order of a light ranking (higher first).
 */
export function fitRank(notes: readonly FitNote[]): number {
  if (hasAllergyNote(notes)) return -3;
  const dislikes = notes.filter((note) => note.kind === "dislike");
  if (dislikes.length > 0) return dislikes.some((note) => note.strong) ? -2 : -1;
  const likes = notes.filter((note) => note.kind === "like");
  if (likes.length === 0) return 0;
  return likes.some((note) => note.strong) ? 2 : 1;
}

/** The items sorted by fitRank (best first), the given order kept among equals. Without any note the list is returned as it is. */
export function rankByFit<T>(items: readonly T[], notesOf: (item: T) => readonly FitNote[]): T[] {
  const ranked = items.map((item, index) => ({ item, index, rank: fitRank(notesOf(item)) }));
  if (ranked.every((entry) => entry.rank === 0)) return [...items];
  return ranked.sort((a, b) => b.rank - a.rank || a.index - b.index).map((entry) => entry.item);
}

/**
 * The notes of every recipe that has any, by id (a recipe with none is left out, so a household without preferences
 * gets `{}`): each recipe as its title and its ingredient lines as written.
 */
export function recipeFits(
  recipes: readonly { id: string; title: string; lines: readonly { originalText: string }[] }[],
  people: readonly FitPerson[],
): Record<string, FitNote[]> {
  if (!hasFitPreferences(people)) return {};
  const out: Record<string, FitNote[]> = {};
  for (const recipe of recipes) {
    const notes = foodFit({ name: recipe.title, ingredients: recipe.lines.map((line) => line.originalText) }, people);
    if (notes.length > 0) out[recipe.id] = notes;
  }
  return out;
}

/** Whether anyone has anything filled in that a dish could be held against. */
export const hasFitPreferences = (people: readonly FitPerson[]) => people.some((person) => person.allergies.length + person.dislikes.length + person.likes.length > 0);

const maxPromptItems = 12;

function uniqueTags(lists: readonly (readonly string[])[]): string[] {
  const out: string[] = [];
  for (const tag of lists.flat()) if (!out.some((other) => sameText(other, tag))) out.push(lower(tag));
  return out.slice(0, maxPromptItems);
}

/**
 * The household's lists for the model, without names, e-mail or ids: the allergies, the "Undviker" tags and the
 * "Älskar" tags, each once; null when all are empty (the prompt then has no section).
 */
export function foodPrefsOf(people: readonly FitPerson[]): FoodPrefs | null {
  const allergies = uniqueTags([people.flatMap((person) => person.allergies.map((allergen) => allergenLabels[allergen]))]);
  const avoid = uniqueTags(people.map((person) => person.dislikes));
  const love = uniqueTags(people.map((person) => person.likes)).filter((tag) => !avoid.some((other) => sameText(other, tag)));
  return allergies.length + avoid.length + love.length === 0 ? null : { allergies, avoid, love };
}
