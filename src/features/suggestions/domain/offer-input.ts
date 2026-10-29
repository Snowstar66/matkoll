import { normalizeIngredientText } from "@/features/catalog";
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

/** "3 av 6 hemma": how many of a dish's ingredients are at home. */
export function atHomeText({ have, total }: { have: number; total: number }): string {
  return `${have} av ${total} hemma`;
}
