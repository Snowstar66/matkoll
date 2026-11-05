import { normalizeIngredientText } from "@/features/catalog";
import { cleanModelText, cutCodePoints } from "@/lib/suggest-input";
import { inputLimits, type MatchOffersInput } from "@/server/ai";

// Story 9.10: what goes to the AI to link offers to the catalog, and what its
// answer turns into. Names only, never prices. Pure, so it is tested without a
// database or a model.

/** An offer as the match reads it: the row's id, its name and label, and whether it already has an ingredient. */
export type UnmatchedOffer = { id: string; label: string; name: string; ingredientId: string | null };

/** What the model is asked, and what its numbers stand for. */
export type OfferMatchRequest = {
  input: MatchOffersInput;
  /** The ids of every offer behind the n-th line (offers of the same name in several stores share a line). */
  offerGroups: string[][];
  /** The catalog ingredient behind the n-th ingredient line. */
  ingredientIds: string[];
};

/** At most this many characters on an ingredient line are kept; the catalog's own limit is wider. */
const { maxOffers, maxOfferChars, maxIngredients, maxIngredientChars, maxChars } = inputLimits.matchOffers;

/**
 * The request for the offers that have no catalog ingredient yet, or `null`
 * when there is nothing to ask. Each distinct offer name is one line (the
 * label as the store writes it, cleaned, cut), at most 60. The ingredients are
 * the catalog's: those the recipes use first (they are what the filter needs),
 * then the rest in the order given, at most 300 and within the character limit.
 * An ingredient with a name that is not on one line, or too long, is left out.
 */
export function buildOfferMatchRequest(
  offers: readonly UnmatchedOffer[],
  ingredients: readonly { id: string; name: string }[],
  usedInRecipes: ReadonlySet<string>,
): OfferMatchRequest | null {
  const groups = new Map<string, { line: string; ids: string[] }>();
  for (const offer of offers) {
    if (offer.ingredientId) continue;
    const key = normalizeIngredientText(offer.name) || offer.name;
    const found = groups.get(key);
    if (found) {
      found.ids.push(offer.id);
      continue;
    }
    const line = cutCodePoints(cleanModelText(offer.label || offer.name), maxOfferChars).trim();
    if (!line || groups.size >= maxOffers) continue;
    groups.set(key, { line, ids: [offer.id] });
  }
  if (groups.size === 0) return null;
  const ordered = [
    ...ingredients.filter((ingredient) => usedInRecipes.has(ingredient.id)),
    ...ingredients.filter((ingredient) => !usedInRecipes.has(ingredient.id)),
  ];
  const picked: { id: string; name: string }[] = [];
  const lines = [...groups.values()].map((group) => group.line);
  let length = lines.join("\n").length + 40;
  for (const ingredient of ordered) {
    const name = cleanModelText(ingredient.name);
    if (!name || name !== ingredient.name || name.length > maxIngredientChars) continue;
    if (picked.length >= maxIngredients || length + name.length + 6 > maxChars) break;
    length += name.length + 6;
    picked.push({ id: ingredient.id, name });
  }
  if (picked.length === 0) return null;
  return {
    input: { offers: lines, ingredients: picked.map((ingredient) => ingredient.name) },
    offerGroups: [...groups.values()].map((group) => group.ids),
    ingredientIds: picked.map((ingredient) => ingredient.id),
  };
}

/** The model's pairs (zero-based indexes) as the offers to link to each ingredient; an index outside the lists is left out. */
export function offerLinks(
  request: Pick<OfferMatchRequest, "offerGroups" | "ingredientIds">,
  pairs: readonly { offer: number; ingredient: number }[],
): { ingredientId: string; offerIds: string[] }[] {
  const byIngredient = new Map<string, string[]>();
  for (const { offer, ingredient } of pairs) {
    const ids = request.offerGroups[offer];
    const ingredientId = request.ingredientIds[ingredient];
    if (!ids || !ingredientId) continue;
    byIngredient.set(ingredientId, [...(byIngredient.get(ingredientId) ?? []), ...ids]);
  }
  return [...byIngredient].map(([ingredientId, offerIds]) => ({ ingredientId, offerIds }));
}
