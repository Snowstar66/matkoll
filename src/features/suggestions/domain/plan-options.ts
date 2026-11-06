import { nameInSentence, normalizeIngredientText, type Unit } from "@/features/catalog";
import { offerDisplay, savingKronor, textUnitPrice } from "@/features/offers";
import { noStaples, type StapleRules } from "@/features/pantry";
import { toBuyNames, type DishLine, type OfferInfo } from "./offer-input";
import { isMainLine } from "./recipe-offers";

// Matsedel's "Lägg till rätter" (Story 25.3): the user's own recipes as rows
// to put on the week, sorted into Favoriter, På erbjudande and Alla recept.
// The pantry never ranks anything; it only reduces what is left to buy
// (`buy`). Pure, so it is tested without a database.

/** An offer as the rows read it: the ranking fields plus the price, for the saving in kronor. */
export type PlanOffer = OfferInfo & { price?: string | null; regularPrice?: number | null };

/** A recipe line as the rows read it. */
export type PlanLine = DishLine & { amount: number | null; unit: Unit | null };

/** A library recipe as the rows read it. */
export type PlanRecipe = {
  id: string;
  title: string;
  isFavorite: boolean;
  imageUrl: string | null;
  totalMinutes: number | null;
  servings: number;
  lines: readonly PlanLine[];
};

/** What the offer line of a row says. */
export type PlanDeal = {
  /** "Falukorv och grädde på extrapris · spara 21 kr". */
  text: string;
  /** Kronor saved on the offers the dish uses, or `null` when no offer has a price to compare. */
  savingKr: number | null;
  /** The best saving in percent among them, or `null`. */
  savingPercent: number | null;
};

/** A row of "Lägg till rätter". */
export type PlanOption = {
  id: string;
  title: string;
  isFavorite: boolean;
  imageUrl: string | null;
  totalMinutes: number | null;
  servings: number;
  /** How many times the dish has been marked cooked. */
  cookedTimes: number;
  /** "Favorit · lagad 6 gånger", or "Favorit · 30 min". */
  meta: string;
  /** How many items the dish needs that are not at home (and not Basvaror). */
  buy: number;
  deal: PlanDeal | null;
};

export type PlanTab = "favorites" | "offers" | "all";

/** The saving in kronor of one offer, from its regular price and its own price text; `null` when they cannot be compared. */
export function offerSavingKr(offer: Pick<PlanOffer, "price" | "regularPrice">): number | null {
  if (offer.regularPrice == null) return null;
  const unit = textUnitPrice(offer.price);
  return unit === null ? null : savingKronor(offer.regularPrice, unit);
}

/** "lagad 6 gånger", "lagad 1 gång". */
export function cookedText(times: number): string {
  return `lagad ${times} ${times === 1 ? "gång" : "gånger"}`;
}

/** "Favorit · lagad 6 gånger"; without a cook count the time: "Favorit · 30 min", "25 min". */
export function planMeta({ isFavorite, totalMinutes }: { isFavorite: boolean; totalMinutes: number | null }, cookedTimes: number): string {
  const second = cookedTimes > 0 ? cookedText(cookedTimes) : totalMinutes ? `${totalMinutes} min` : null;
  return [isFavorite ? "Favorit" : null, second].filter(Boolean).join(" · ");
}

/** "spara 21 kr" (whole kronor, at least 1), "spara 25 %" when kronor are not known, or "". */
export function savingPhrase({ savingKr, savingPercent }: { savingKr: number | null; savingPercent: number | null }): string {
  if (savingKr !== null) return `spara ${Math.max(1, Math.round(savingKr))} kr`;
  if (savingPercent !== null) return `spara ${savingPercent} %`;
  return "";
}

/** "Falukorv", "Falukorv och grädde", "Falukorv, grädde och lök". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}

/** At most this many offer names are said in a row's offer line. */
const maxDealNames = 3;

/**
 * The offers a recipe uses on a main ingredient (isMainLine: not a Basvara,
 * not a spice), each offer label once, with the saving that adds up: the
 * kronor of those with a price to compare, else the best percent. `null`
 * when no main ingredient is on offer. Offers from every store are given.
 */
export function dealOf(offers: readonly PlanOffer[], recipe: Pick<PlanRecipe, "lines">, staples: StapleRules = noStaples): PlanDeal | null {
  const main = new Set(
    recipe.lines.filter((line) => isMainLine(line, staples)).flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])),
  );
  if (main.size === 0) return null;
  const byLabel = new Map<string, { kr: number | null; percent: number | null }>();
  for (const offer of offers) {
    if (!offer.ingredientId || !main.has(offer.ingredientId)) continue;
    const kr = offerSavingKr(offer);
    const percent = offer.savingPercent ?? null;
    const before = byLabel.get(offer.label);
    byLabel.set(offer.label, {
      kr: before?.kr == null ? kr : kr === null ? before.kr : Math.max(before.kr, kr),
      percent: before?.percent == null ? percent : percent === null ? before.percent : Math.max(before.percent, percent),
    });
  }
  if (byLabel.size === 0) return null;
  const known = [...byLabel.values()].flatMap(({ kr }) => (kr === null ? [] : [kr]));
  const savingKr = known.length > 0 ? known.reduce((sum, kr) => sum + kr, 0) : null;
  const percents = [...byLabel.values()].flatMap(({ percent }) => (percent === null ? [] : [percent]));
  const savingPercent = percents.length > 0 ? Math.max(...percents) : null;
  const names = [...byLabel.keys()].slice(0, maxDealNames).map((label) => nameInSentence(offerDisplay(label).title));
  const sentence = joinNames(names);
  const saving = savingPhrase({ savingKr, savingPercent });
  return {
    text: `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} på extrapris${saving ? ` · ${saving}` : ""}`,
    savingKr,
    savingPercent,
  };
}

const bySv = (a: string, b: string) => normalizeIngredientText(a).localeCompare(normalizeIngredientText(b), "sv");

/** One row per library recipe, the library's order kept. `cooked` is the cook count by recipe id. */
export function planOptions(
  offers: readonly PlanOffer[],
  recipes: readonly PlanRecipe[],
  cooked: Readonly<Record<string, number>> = {},
  staples: StapleRules = noStaples,
): PlanOption[] {
  return recipes.map((recipe) => {
    const cookedTimes = cooked[recipe.id] ?? 0;
    return {
      id: recipe.id,
      title: recipe.title,
      isFavorite: recipe.isFavorite,
      imageUrl: recipe.imageUrl,
      totalMinutes: recipe.totalMinutes,
      servings: recipe.servings,
      cookedTimes,
      meta: planMeta(recipe, cookedTimes),
      buy: toBuyNames([], recipe.lines, staples).length,
      deal: dealOf(offers, recipe, staples),
    };
  });
}

/**
 * The rows of a tab. Favoriter: the favourites, the most cooked first.
 * På erbjudande: the recipes with a main ingredient on offer, the most saved
 * kronor first (a saving in percent only after those in kronor, then those
 * without any figure). Alla recept: every recipe by title.
 */
export function optionsForTab(options: readonly PlanOption[], tab: PlanTab): PlanOption[] {
  if (tab === "favorites") {
    return options.filter((option) => option.isFavorite).sort((a, b) => b.cookedTimes - a.cookedTimes || bySv(a.title, b.title));
  }
  if (tab === "offers") {
    const rank = (option: PlanOption) => option.deal?.savingKr ?? -1;
    return options
      .filter((option) => option.deal !== null)
      .sort(
        (a, b) =>
          rank(b) - rank(a) ||
          (b.deal?.savingPercent ?? -1) - (a.deal?.savingPercent ?? -1) ||
          bySv(a.title, b.title) ||
          a.id.localeCompare(b.id),
      );
  }
  return [...options].sort((a, b) => bySv(a.title, b.title) || a.id.localeCompare(b.id));
}

/** The recipes already on the week, so their rows say "På veckan" instead of "+". */
export function onWeekIds(dishes: readonly { recipeId: string | null }[]): ReadonlySet<string> {
  return new Set(dishes.flatMap((dish) => (dish.recipeId ? [dish.recipeId] : [])));
}
