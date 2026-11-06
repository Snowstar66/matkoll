import { normalizeIngredientText, type Unit } from "@/features/catalog";
import { isStaple, noStaples, type StapleRules } from "@/features/pantry";
import {
  cleanModelText,
  cutCodePoints,
  isValidOfferName,
  offerLinesLength,
  suggestInputLimits,
} from "@/lib/suggest-input";

// What the AI port's suggestDishes gets of this week's offers, and which of
// them a suggested dish uses (Story 9.5, FR-36, AD-9, AD-25). Names only,
// never prices. Pure, so it is tested without a database.

/** The parts of an offer these functions read; a StoreOffer fits. */
export type OfferInfo = { label: string; name: string; ingredientId: string | null; savingPercent?: number | null };

/**
 * The names sent to the model: cleaned, cut to 100 code points, each once,
 * those with a catalog ingredient first (they are food Matkoll can count
 * with), the best saving first within each group (unknown last, otherwise
 * the sheet's order), at most 40 and 1 000
 * characters of lines. Offers without a usable name are skipped.
 */
export function toOfferNames(offers: readonly OfferInfo[]): string[] {
  const bySaving = (a: OfferInfo, b: OfferInfo) => (b.savingPercent ?? -1) - (a.savingPercent ?? -1);
  const ordered = [
    ...offers.filter((offer) => offer.ingredientId).sort(bySaving),
    ...offers.filter((offer) => !offer.ingredientId).sort(bySaving),
  ];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const offer of ordered) {
    const name = cutCodePoints(cleanModelText(offer.name), suggestInputLimits.maxNameChars).trim();
    const key = normalizeIngredientText(name) || name;
    if (!isValidOfferName(name) || seen.has(key)) continue;
    if (names.length >= suggestInputLimits.maxOffers) break;
    if (offerLinesLength([...names, name]) > suggestInputLimits.maxOfferChars) break;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/**
 * The labels of the offers a dish uses, each once, in the sheet's order: an
 * offer is used when its catalog ingredient is one of the dish's linked
 * ingredients, or, for an offer without one, when its name is the name of a
 * line (compared normalised).
 */
export function offersUsed(
  offers: readonly OfferInfo[],
  linkedIds: ReadonlySet<string>,
  lineNames: readonly string[],
): string[] {
  const names = new Set(lineNames.map((name) => normalizeIngredientText(name)).filter(Boolean));
  const labels: string[] = [];
  for (const offer of offers) {
    const used = offer.ingredientId ? linkedIds.has(offer.ingredientId) : names.has(normalizeIngredientText(offer.name));
    if (used && !labels.includes(offer.label)) labels.push(offer.label);
  }
  return labels;
}

/**
 * One line of a dish, as toBuyNames reads it. `amount` and `unit` are for the
 * household's Basvaror's limits; without them the line counts as a small
 * amount.
 */
export type DishLine = { name: string; ingredientId: string | null; atHome: boolean; amount?: number | null; unit?: Unit | null };

/**
 * The names of the lines Pontus has to buy: not at home, not an offer the
 * dish uses (by catalog ingredient, or by name for an offer without one) and
 * not one of the household's Basvaror within its limit (pantry.isStaple,
 * which replaced Story 16.2's fixed list of trivial staples). Each once, in
 * the dish's order.
 */
export function toBuyNames(
  offers: readonly OfferInfo[],
  lines: readonly DishLine[],
  staples: StapleRules = noStaples,
): string[] {
  const offeredIds = new Set(offers.flatMap((offer) => (offer.ingredientId ? [offer.ingredientId] : [])));
  const offeredNames = new Set(
    offers.filter((offer) => !offer.ingredientId).map((offer) => normalizeIngredientText(offer.name)),
  );
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of lines) {
    const key = normalizeIngredientText(line.name) || line.name;
    const onOffer = line.ingredientId ? offeredIds.has(line.ingredientId) : offeredNames.has(key);
    const staple = isStaple(staples, {
      ingredientId: line.ingredientId,
      name: line.name,
      amount: line.amount ?? null,
      unit: line.unit ?? null,
    });
    if (line.atHome || onOffer || !line.name || staple || seen.has(key)) continue;
    seen.add(key);
    names.push(line.name);
  }
  return names;
}

/**
 * How many things a dish needs that are not at home (pantry mode): the lines
 * toBuyNames would list, without those with no amount (salt, peppar "efter
 * smak"), which are never worth a trip to the shop.
 */
export function missingCount(lines: readonly DishLine[], staples: StapleRules = noStaples): number {
  return toBuyNames([], lines.filter((line) => line.amount != null), staples).length;
}
