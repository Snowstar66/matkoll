import { foodFit, hasAllergyNote, type FitNote, type FitPerson } from "@/features/menu-advisor";
import { weekdayWord } from "@/features/mealplan";
import { dishKind, type DishKind } from "@/lib/dish-kind";
import type { RecipeCandidate } from "./types";

// Small facts read from a recipe's own text, in code: what it may hold that someone is allergic to, whether it is
// vegetarian, what kind of dish it is, and which words it shares with another dish. Pure.

export type FoodLike = { title: string; ingredients: readonly string[] };

/** The allergy notes of a dish against the household ("Kan innehålla laktos (Anna)"); a dish nobody is allergic to has none. */
export function allergyNotes(dish: FoodLike, people: readonly FitPerson[]): FitNote[] {
  return foodFit({ name: dish.title, ingredients: [...dish.ingredients] }, people).filter((note) => note.kind === "allergy");
}

/** Whether anyone in the household has an allergy filled in. */
export const householdHasAllergies = (people: readonly FitPerson[]) => people.some((person) => person.allergies.length > 0);

/**
 * Whether a dish may NOT be proposed: it may hold an allergen of someone in the household. A dish with no ingredient
 * lines cannot be checked, so with any allergy in the household it counts as unsafe (never guessed safe).
 */
export function allergenTerms(dish: FoodLike, people: readonly FitPerson[]): string[] | null {
  const notes = allergyNotes(dish, people);
  if (hasAllergyNote(notes)) return [...new Set(notes.flatMap((note) => note.terms ?? []))];
  if (dish.ingredients.length === 0 && householdHasAllergies(people)) return [];
  return null;
}

/** The words of the allergy notes as one sentence for a fixed dish: "Kan innehålla laktos (Anna)". */
export function allergyWarningText(dish: FoodLike, people: readonly FitPerson[]): string | null {
  const notes = allergyNotes(dish, people);
  return notes.length > 0 ? notes.map((note) => note.text).join("; ") : null;
}

const plainWords = (text: string) => text.toLocaleLowerCase("sv-SE").split(/[^a-zåäöéü]+/).filter(Boolean);

const notMeatPrefix = /^(vego|veg|växt|soja|quorn|sojabaserad|plantbaserad|kikärts|bönor)/;
const meatWord = /^(kött|nöt|fläsk|bacon|skinka|korv|kyckling|kalkon|lamm|anka|biff|entrecote|oxfilé|högrev|revben|bringa|karré|filé|färs|lax|torsk|sej|fisk|räk|tonfisk|ansjovis|sill|makrill|krabba|hummer|mussla|musslor|skaldjur|salami|chorizo|prosciutto|leverpastej|köttbull|pulled)/;
const meatEnd = /(kött|färs|korv|skinka|fläsk|kyckling|bacon|fisk|räkor|filé)$/;

/** Whether a line of ingredients names meat or fish ("500 g nötfärs", "1 laxfilé"). Plain keywords: a hint, kept deliberately simple. */
const lineHasMeat = (line: string) =>
  plainWords(line).some((word) => !notMeatPrefix.test(word) && !/^köttfri|^fiskfri/.test(word) && (meatWord.test(word) || meatEnd.test(word)) && !/buljong|fond/.test(word));

/** The recipe is vegetarian: the caller's flag when it is set, else no ingredient line names meat or fish. */
export function isVegetarian(candidate: Pick<RecipeCandidate, "ingredients" | "vegetarian" | "title">): boolean {
  if (candidate.vegetarian !== undefined) return candidate.vegetarian;
  if (candidate.ingredients.length === 0) return false;
  return !candidate.ingredients.some(lineHasMeat) && !lineHasMeat(candidate.title);
}


export const kindOf = (dish: FoodLike): DishKind => dishKind(dish.title, dish.ingredients);

const stopWords = new Set([
  "matsked", "tesked", "kryddmått", "gram", "liter", "deciliter", "burk", "burkar", "paket", "förp", "klyfta", "klyftor", "stor", "stora", "liten", "små", "färsk", "färska", "finhackad", "hackad", "hackade", "skivad", "skivade", "riven", "rivet", "strimlad", "tärnad", "pressad", "kokt", "kokta", "efter", "smak", "till", "samt", "eller", "gärna", "ungefär", "ca", "cirka", "valfri", "valfria", "ev", "olja", "salt", "peppar", "vatten", "krydda", "kryddor", "mald", "malen", "hela", "halv", "halva", "ungefärlig",
]);

/** The ingredient words of a dish (4+ letters, no measures or cooking words), as a set: what two dishes may share. */
export function ingredientWords(lines: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const line of lines) for (const word of plainWords(line)) if (word.length >= 4 && !stopWords.has(word)) out.add(word);
  return out;
}

/** The word shared by two dishes, longest first ("kycklingfilé"), or null. */
export function sharedWord(a: ReadonlySet<string>, b: ReadonlySet<string>): string | null {
  const shared = [...a].filter((word) => b.has(word)).sort((x, y) => y.length - x.length || x.localeCompare(y, "sv"));
  return shared[0] ?? null;
}

export const dayWord = weekdayWord;

/** "Pannkaka torsdag". */
export const titleOnDay = (title: string, dayIndex: number) => `${title} ${weekdayWord(dayIndex)}`;

export const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("sv-SE") + text.slice(1);
