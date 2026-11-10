import type { NotePerson, PreferenceNote } from "@/components/preference-notes";
import { allergenLabels } from "./labels";
import { dishTokens, hasTerm, matchPreferenceTokens, normalizeText, tokens } from "./preferences";
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

/**
 * Keywords per allergen. Swedish builds compounds, so a keyword can sit at the start ("mjölkchoklad"), at the end
 * ("matlagningsgrädde", "getost") or inside ("jordnötssmör") of a word. Taste matching (preferences.ts) stays
 * word-start only ("ost" must not find "kostrad"); for an ALLERGY a silent miss is worse than a "kan innehålla" that
 * turns out wrong, so the allergen words are also read at the end of a compound, and for a curated list of long,
 * unambiguous stems anywhere inside it.
 */
type AllergenWords = {
  /** Whole word or start of a word ("mjölk" finds "mjölkchoklad"); a term under three letters only as a whole word; a term with a space is a phrase. */
  terms: readonly string[];
  /** Also a hit as the END of a compound word ("grädde" finds "vispgrädde"). */
  ends?: readonly string[];
  /** Also a hit anywhere in a word: only for long stems that mean nothing else ("sesam" finds "svartsesam"). */
  inside?: readonly string[];
  /** A word that has any of these in it is no hit (known false positives: "ostron", "muskotnöt"). */
  not?: readonly string[];
  /** A word that is exactly one of these is no hit (short words an ending would catch: "kost" ends in "ost"). */
  notWords?: readonly string[];
  /** A word that fits this is no hit (plant "milk": "kokosmjölk", "havregrädde", "mandelsmör"). */
  notPattern?: RegExp;
  /** A word that starts with one of these makes the whole line safe ("glutenfri pasta"). */
  free?: readonly string[];
};

const plantBase = "(?:kokos|havre|soja|mandel|ris|ärt|cashew|nöt|jordnöt|hasselnöt|kakao|shea|solros|hampa|potatis|lin)";

const allergenWords: Readonly<Record<MenuAllergen, AllergenWords>> = {
  gluten: {
    terms: ["vete", "mjöl", "råg", "korn", "dinkel", "havre", "malt", "seitan", "pasta", "spaghetti", "penne", "makaroner", "tagliatelle", "lasagne", "nudlar", "bröd", "ströbröd", "paner", "panko", "tortilla", "wrap", "couscous", "kuskus", "bulgur", "naan", "knäcke", "semolina", "pizzadeg", "filodeg", "köttbull", "sojasås", "soyasås", "teriyaki", "hoisin"],
    ends: ["bröd", "mjöl", "pasta", "nudlar", "korv"],
    inside: ["vete", "dinkel"],
    // Flours of other grains, and "bovete" (buckwheat), hold no gluten; "rågad" is a heaped spoon, not rye.
    not: ["mjölk", "bovete", "majsmjöl", "rismjöl", "potatismjöl", "kikärtsmjöl", "kokosmjöl", "mandelmjöl", "quinoamjöl", "ärtmjöl", "sojamjöl", "tapiokamjöl", "hirsmjöl", "kastanjmjöl", "teffmjöl", "linsmjöl", "lupinmjöl", "bananmjöl", "rågad"],
    free: ["glutenfri"],
  },
  laktos: {
    terms: ["mjölk", "grädde", "smör", "ost", "yoghurt", "yogurt", "filmjölk", "gräddfil", "kvarg", "creme fraiche", "fraiche", "mascarpone", "ricotta", "mozzarella", "parmesan", "feta", "halloumi", "cheddar", "keso", "vassle", "smetana", "margarin", "kefir", "ghee", "glass"],
    ends: ["mjölk", "grädde", "yoghurt", "yogurt", "smör", "ost", "fraiche", "kvarg"],
    not: ["ostron", "smörgås", "grillrost", "ugnsrost"],
    notWords: ["kost", "rost", "most", "post", "frost", "tost", "host", "prost", "bost", "lost"],
    // Plant "dairy" ("kokosmjölk", "havregrädde", "mandelsmör", "jordnötssmör", "kakaosmör"): no lactose.
    notPattern: new RegExp(`^${plantBase}s?(?:mjölk|grädde|yoghurt|yogurt|smör|fraiche|kvarg|glass|ost|dryck|fil)`, "u"),
    free: ["laktosfri", "mjölkfri"],
  },
  // "Nötter" are the tree nuts and peanuts. Coconut and nutmeg are not nuts for the allergy, and "nöt" at the start of
  // a word is usually beef ("nötfärs", "nötkött"), so those are exceptions.
  notter: {
    terms: ["nötter", "nötmix", "valnöt", "hasselnöt", "jordnöt", "pekannöt", "paranöt", "cashew", "mandel", "pistage", "pinjenöt", "pinjekärn", "macadamia", "nutella", "marsipan", "nougat", "praliné", "praline"],
    inside: ["nöt", "mandel", "cashew", "pistage", "macadamia"],
    not: [
      "mandelpotatis", "kokosnöt", "muskotnöt", "nötfärs", "nötkött", "nötbiff", "nötstek", "nötfil", "nötfond", "nötbuljong", "nötgryta", "nötgul", "nötkreatur", "nötlever", "nötytter", "nötrost", "nötbring", "nötsvans", "nötkorv", "nötinner", "nötentr", "nötsnitsel", "nötschnitzel", "nötburg", "nötbull", "nötlägg", "nötkotlet", "nötmedaljong",
    ],
    free: ["nötfri"],
  },
  skaldjur: {
    terms: ["skaldjur", "räk", "räkor", "krabba", "krabb", "hummer", "kräft", "mussla", "mussl", "musslor", "scampi", "calamari", "bläckfisk", "ostron", "pilgrimsmussla"],
    inside: ["räk", "skaldjur", "krabb", "kräft", "mussl", "hummer", "ostron"],
    not: ["räkn", "räkt"],
  },
  agg: {
    terms: ["ägg", "äggula", "äggvita", "majonnäs", "mayo", "mayonnaise", "aioli", "remoulad", "hollandaise", "bearnaise", "maräng"],
    ends: ["ägg", "majonnäs", "aioli", "remoulad"],
    not: ["äggplanta"],
    notWords: ["vägg", "skägg"],
    free: ["äggfri"],
  },
  fisk: {
    terms: ["fisk", "lax", "torsk", "sej", "sill", "makrill", "tonfisk", "ansjovis", "sardin", "rödspätta", "röding", "gös", "abborre", "strömming", "kolja", "hälleflundra", "kabeljo", "pangasius", "tilapia", "gädda", "piggvar", "sjötunga", "kaviar", "rom", "löjrom", "sikrom", "stenbitsrom", "forellrom", "tobiko", "surimi", "worcester", "caesar"],
    ends: ["lax", "torsk", "sill", "rom", "fisk"],
    inside: ["fisk", "ansjovis", "makrill", "strömming"],
    // Squid and octopus are molluscs (they count as skaldjur), not fish.
    not: ["bläckfisk", "fiskeri"],
    notWords: ["krom", "brom", "grom", "arom"],
  },
  soja: { terms: ["soja", "sojasås", "tofu", "edamame", "tamari", "miso", "tempeh", "natto", "teriyaki", "hoisin"], ends: ["tofu", "miso", "tempeh"], inside: ["soja"] },
  sesam: { terms: ["sesam", "tahini", "tahin", "hummus", "gomasio", "dukkah", "halva"], inside: ["sesam"], ends: ["tahini"] },
};

type Prepared = { terms: string[]; phrases: string[]; ends: string[]; inside: string[]; not: string[]; notWords: Set<string>; notPattern?: RegExp; free: string[] };
const prepared = Object.fromEntries(
  (Object.keys(allergenWords) as MenuAllergen[]).map((key) => {
    const { terms, ends = [], inside = [], not = [], notWords = [], notPattern, free = [] } = allergenWords[key];
    const all = terms.map(normalizeText);
    return [key, { terms: all.filter((t) => !t.includes(" ")), phrases: all.filter((t) => t.includes(" ")), ends: ends.map(normalizeText), inside: inside.map(normalizeText), not: not.map(normalizeText), notWords: new Set(notWords.map(normalizeText)), notPattern, free: free.map(normalizeText) }];
  }),
) as Record<MenuAllergen, Prepared>;

function tokenHasAllergen(token: string, rule: Prepared): boolean {
  if (rule.notWords.has(token) || rule.not.some((word) => token.includes(word)) || rule.notPattern?.test(token)) return false;
  return (
    rule.terms.some((term) => (term.length < 3 ? token === term : token.startsWith(term))) ||
    rule.ends.some((end) => token.endsWith(end)) ||
    rule.inside.some((stem) => token.includes(stem))
  );
}

/**
 * Whether one line of text names something the allergen is in ("2 dl grädde" and laktos; "glutenfri pasta" is not gluten).
 * Keywords count at the start, the end (compounds like "vispgrädde") and, for long stems, inside a word; see allergenWords.
 */
export function lineHasAllergen(allergen: MenuAllergen, line: string): boolean {
  const rule = prepared[allergen];
  const found = tokens(line);
  if (rule.free.some((free) => found.some((token) => token.startsWith(free)))) return false;
  return found.some((token) => tokenHasAllergen(token, rule)) || rule.phrases.some((phrase) => hasTerm(found, phrase, []));
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
  const dishWords = dishTokens(asDish);
  const matches = (tag: string) => matchPreferenceTokens(tag, dishWords, asDish.kategori);
  const allergy = new Map<MenuAllergen, NotePerson[]>();
  const dislike: FitNote[] = [];
  const like: FitNote[] = [];
  for (const person of people) {
    const who: NotePerson = { id: person.personKey ?? person.name, name: person.name };
    for (const allergen of new Set(person.allergies)) {
      if (lines.some((line) => lineHasAllergen(allergen, line))) allergy.set(allergen, [...(allergy.get(allergen) ?? []), who]);
    }
    const avoids = person.dislikes.filter(matches);
    const loves = person.likes.filter((tag) => matches(tag) && !avoids.some((other) => sameText(other, tag)));
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
