// "Vem äter vad": suggests dishes per person from allergies, tastes and a budget leaning. Pure, no AI.
// Never claims a dish is allergy-safe: allergens exclude, "may contain" only warns, and what is left is
// "nothing in the profile rules it out", always shown with the allergy disclaimer.
import { allergenHits } from "./allergens";
import { whoName } from "./preferences";
import { softHits } from "./tastes";
import type { Person, Taste, TasteKey } from "./profile";
import type { Menu, MenuAllergen, MenuDish, MenuGroup } from "./types";
import { dishSek } from "./view";

export type Budget = "billigt" | "normalt" | "unna";
export type RecommendOptions = {
  budget?: Budget;
  /** How many dishes per person; default 3. */
  limit?: number;
};

/** The groups dishes are suggested from. Drinks and "Övrigt" are not. */
export const suggestGroups: readonly MenuGroup[] = ["Förrätt", "Varmrätt", "Efterrätt"];

export type Suggestion = {
  dish: MenuDish;
  /** Approximate kronor, or null without a price. */
  sek: number | null;
  /** Short Swedish reasons ("passar din smak för fisk"). */
  reasons: string[];
  /** Set when an allergen the person avoids may be in the dish (kan innehålla). */
  warning: string | null;
  /** Soft notes from "Undviker" (not an allergy): "Innehåller vitlök. Anna undviker det." The dish stays in the list. */
  concerns: string[];
  score: number;
};

export type PersonSuggestions = {
  person: Person;
  /** Best first, at most `limit`. */
  picks: Suggestion[];
  /** Dishes left out because of the person's allergies. */
  excluded: number;
};

const allergenNames: Readonly<Record<MenuAllergen, string>> = {
  gluten: "gluten",
  laktos: "laktos",
  notter: "nötter",
  skaldjur: "skaldjur",
  agg: "ägg",
  fisk: "fisk",
  soja: "soja",
  sesam: "sesam",
};

const tasteNames: Readonly<Record<TasteKey, { like: string; group: string }>> = {
  kott: { like: "kött", group: "kötträtter" },
  fisk: { like: "fisk", group: "fiskrätter" },
  skaldjur: { like: "skaldjur", group: "skaldjursrätter" },
  vegetariskt: { like: "vegetariskt", group: "vegetariska" },
  pasta: { like: "pasta", group: "pastarätter" },
  pizza: { like: "pizza", group: "pizzor" },
  starkt: { like: "starkt", group: "starka rätter" },
  sott: { like: "sött", group: "efterrätter" },
};

// Small word list per taste, Swedish, English and Spanish. Matched on the start of a word in the original name
// and the main ingredients.
const keywords: Readonly<Partial<Record<TasteKey, readonly string[]>>> = {
  pasta: ["pasta", "spaghetti", "penne", "tagliatelle", "fettuccine", "lasagne", "lasagna", "ravioli", "tortellini", "gnocchi", "carbonara", "macarrones", "fideos"],
  pizza: ["pizza", "calzone"],
  starkt: ["stark", "starkt", "spicy", "chili", "chile", "picante", "jalapeño", "jalapeno", "sriracha", "harissa", "habanero"],
  sott: ["choklad", "chocolate", "glass", "helado", "tårta", "cake", "tarta", "kaka", "cookie", "pannacotta", "tiramisu", "brownie", "karamell", "caramel", "crème", "creme", "honung", "honey", "miel", "dulce", "flan"],
};

function words(text: string): string[] {
  return text
    .toLocaleLowerCase("sv-SE")
    .split(/[^\p{L}]+/u)
    .filter(Boolean);
}

/** The taste keys a dish belongs to: its category plus word-list hits; desserts count as sweet. */
export function dishTasteKeys(dish: MenuDish): TasteKey[] {
  const found = new Set<TasteKey>();
  if (dish.kategori === "kott" || dish.kategori === "fisk" || dish.kategori === "skaldjur") found.add(dish.kategori);
  if (dish.kategori === "vegetariskt" || dish.kategori === "veganskt") found.add("vegetariskt");
  if (dish.grupp === "Efterrätt") found.add("sott");
  const tokens = [dish.originalnamn, ...dish.huvudingredienser].flatMap(words);
  for (const [key, list] of Object.entries(keywords) as [TasteKey, readonly string[]][]) {
    if (tokens.some((token) => list.some((word) => token === word || (word.length >= 4 && token.startsWith(word))))) found.add(key);
  }
  return [...found];
}

const budgetWeight: Readonly<Record<Budget, number>> = { billigt: -3, normalt: 0, unna: 2 };
const warningPenalty = 1000;
const dislikePenalty = 6;
const dislikeCap = 12;
const likeBonus = 4;
const likeCap = 8;
const dessertPenalty = 2;
/** The strong end (Ogillar, Älskar) weighs this much more than the other step. */
const strongExtra = 3;

/** 0 (cheapest) to 1 (dearest) for each priced dish. */
function priceRanks(dishes: readonly MenuDish[]): Map<MenuDish, number> {
  const priced = dishes.flatMap((dish) => {
    const sek = dishSek(dish);
    return sek === null ? [] : [{ dish, sek }];
  });
  const low = Math.min(...priced.map((entry) => entry.sek));
  const high = Math.max(...priced.map((entry) => entry.sek));
  return new Map(priced.map((entry) => [entry.dish, high === low ? 0.5 : (entry.sek - low) / (high - low)]));
}

/** The cheapest (or dearest) priced dish overall and within each taste kind that has at least two priced dishes. */
function extremes(dishes: readonly MenuDish[], cheapest: boolean): Set<MenuDish> {
  const out = new Set<MenuDish>();
  const pick = (list: MenuDish[]) => {
    const priced = list.flatMap((dish) => {
      const sek = dishSek(dish);
      return sek === null ? [] : [{ dish, sek }];
    });
    if (priced.length < 2) return;
    const target = priced.reduce((a, b) => (cheapest ? (b.sek < a.sek ? b : a) : b.sek > a.sek ? b : a));
    out.add(target.dish);
  };
  pick([...dishes]);
  for (const key of Object.keys(tasteNames) as TasteKey[]) pick(dishes.filter((dish) => dishTasteKeys(dish).includes(key)));
  return out;
}

export type RankContext = { budget: Budget; ranks: Map<MenuDish, number>; cheapest: Set<MenuDish>; priciest: Set<MenuDish> };

export function rank(dish: MenuDish, person: Person, ctx: RankContext): Suggestion {
  const keys = dishTasteKeys(dish);
  const reasons: string[] = [];
  let score = 0;
  let best: { key: TasteKey; value: Taste } | null = null;
  for (const key of keys) {
    const value = person.tastes[key] ?? 0;
    if (value === 0) continue;
    score += value * 3;
    if (value > 0 && (best === null || value > best.value)) best = { key, value };
  }
  if (best) reasons.push(best.value === 2 ? `något du älskar: ${tasteNames[best.key].like}` : `passar din smak för ${tasteNames[best.key].like}`);

  const rankValue = ctx.ranks.get(dish);
  if (rankValue !== undefined) score += budgetWeight[ctx.budget] * rankValue;
  if (ctx.budget === "billigt" && ctx.cheapest.has(dish)) {
    const key = keys.find((k) => k !== "sott") ?? keys[0];
    reasons.push(key ? `billigast bland ${tasteNames[key].group}` : "billigast på menyn");
  }
  if (ctx.budget === "unna" && ctx.priciest.has(dish)) reasons.push("något att unna sig");

  if (dish.grupp === "Efterrätt" && (person.tastes.sott ?? 0) <= 0) score -= dessertPenalty;

  const maybe = allergenHits(dish, person.allergies).filter((hit) => hit.source === "kan_innehalla");
  let warning: string | null = null;
  if (maybe.length > 0) {
    warning = `Kan innehålla ${maybe.map((hit) => allergenNames[hit.allergen]).join(", ")}. Fråga personalen.`;
    score -= warningPenalty;
  }

  // Free-text preferences: a clear deduction and a note for what is avoided, a bonus and a reason for what is loved.
  // Never an exclusion: only allergies leave a dish out.
  // The original eight (kött, fisk, pasta ...) are scored above through the dish's category; the rest are matched by words.
  const { avoided, loved, strongAvoided, strongLoved } = softHits(person, dish);
  const concerns = avoided.length > 0 ? [`Innehåller ${avoided.join(", ").toLocaleLowerCase("sv-SE")}. ${whoName(person) === "du" ? "Du undviker" : `${person.name} undviker`} ${avoided.length > 1 ? "dem" : "det"}.`] : [];
  score -= Math.min(dislikeCap + strongAvoided * strongExtra, avoided.length * dislikePenalty + strongAvoided * strongExtra);
  score += Math.min(likeCap + strongLoved * strongExtra, loved.length * likeBonus + strongLoved * strongExtra);
  if (loved.length > 0) reasons.unshift(`${whoName(person) === "du" ? "du älskar" : `${person.name} älskar`} ${loved.join(", ").toLocaleLowerCase("sv-SE")}`);
  if (reasons.length === 0) reasons.push("inget i din profil talar emot den");
  return { dish, sek: dishSek(dish), reasons, warning, concerns, score };
}

/** The price context ranking needs, for the dishes being compared. */
export function rankContext(dishes: readonly MenuDish[], budget: Budget): RankContext {
  return { budget, ranks: priceRanks(dishes), cheapest: extremes(dishes, true), priciest: extremes(dishes, false) };
}

/**
 * For each person, the top dishes from Förrätt, Varmrätt and Efterrätt. Allergens the person avoids exclude a
 * dish; "kan innehålla" keeps it but with a warning and far down the list. Tastes that are 0 or missing are
 * neutral, filled-in ones steer; the budget only tilts the ranking against price. The same dish can go to
 * several people.
 */
export function recommend(menu: Menu, people: readonly Person[], opts: RecommendOptions = {}): PersonSuggestions[] {
  const limit = opts.limit ?? 3;
  const dishes = menu.ratter.filter((dish) => suggestGroups.includes(dish.grupp));
  const ctx = rankContext(dishes, opts.budget ?? "normalt");
  return people.map((person) => {
    const allowed = dishes.filter((dish) => !allergenHits(dish, person.allergies).some((hit) => hit.source === "allergener"));
    const picks = allowed
      .map((dish, index) => ({ entry: rank(dish, person, ctx), index }))
      .sort((a, b) => b.entry.score - a.entry.score || a.index - b.index)
      .slice(0, limit)
      .map(({ entry }) => entry);
    return { person, picks, excluded: dishes.length - allowed.length };
  });
}

/** One chosen dish for one person. A person can have several (starter and main). */
export type Selection = { personId: string; dish: MenuDish }[];

/** The pick to lead with: the best without a warning or an avoided ingredient, else the best without a warning, else the best of all. */
export function topPick(picks: readonly Suggestion[]): Suggestion | undefined {
  return picks.find((entry) => entry.warning === null && entry.concerns.length === 0) ?? picks.find((entry) => entry.warning === null) ?? picks[0];
}

/** Each person's lead pick (see topPick). */
export function defaultSelection(suggestions: readonly PersonSuggestions[]): Selection {
  const out: Selection = [];
  for (const { person, picks } of suggestions) {
    const pick = topPick(picks);
    if (pick) out.push({ personId: person.id, dish: pick.dish });
  }
  return out;
}
