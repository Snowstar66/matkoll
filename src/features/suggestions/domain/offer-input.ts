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

/** Pantry basics left out of "köp till": nobody shops for them for one dish (Story 16.2). */
const trivialStaples = new Set(["salt", "peppar", "svartpeppar", "vatten", "olja", "matolja", "rapsolja", "socker"]);

/** True for salt, pepper, water, oil and sugar, compared normalised. */
export function isTrivialStaple(name: string): boolean {
  return trivialStaples.has(normalizeIngredientText(name));
}

/** One line of a dish, as toBuyNames reads it. */
export type DishLine = { name: string; ingredientId: string | null; atHome: boolean };

/**
 * The names of the lines Pontus has to buy: not at home, not an offer the
 * dish uses (by catalog ingredient, or by name for an offer without one) and
 * not a trivial staple. Each once, in the dish's order.
 */
export function toBuyNames(offers: readonly OfferInfo[], lines: readonly DishLine[]): string[] {
  const offeredIds = new Set(offers.flatMap((offer) => (offer.ingredientId ? [offer.ingredientId] : [])));
  const offeredNames = new Set(
    offers.filter((offer) => !offer.ingredientId).map((offer) => normalizeIngredientText(offer.name)),
  );
  const seen = new Set<string>();
  const names: string[] = [];
  for (const line of lines) {
    const key = normalizeIngredientText(line.name) || line.name;
    const onOffer = line.ingredientId ? offeredIds.has(line.ingredientId) : offeredNames.has(key);
    if (line.atHome || onOffer || !line.name || isTrivialStaple(line.name) || seen.has(key)) continue;
    seen.add(key);
    names.push(line.name);
  }
  return names;
}

/** At most this many names after "köp till: ", the rest as "+2". */
const maxBuyNames = 3;

/**
 * The one line on a suggestion card that says why it is good: "3 på
 * erbjudande · 1 hemma · köp till: potatis", "köp till: potatis, grädde, lök +2",
 * or "allt hemma eller på erbjudande" when nothing is left to buy.
 */
export function whyText({ onOffer, have, toBuy }: { onOffer: number; have: number; toBuy: readonly string[] }): string {
  if (toBuy.length === 0) return "allt hemma eller på erbjudande";
  const parts: string[] = [];
  if (onOffer > 0) parts.push(`${onOffer} på erbjudande`);
  if (have > 0) parts.push(`${have} hemma`);
  const shown = toBuy.slice(0, maxBuyNames).join(", ");
  const more = toBuy.length > maxBuyNames ? ` +${toBuy.length - maxBuyNames}` : "";
  parts.push(`köp till: ${shown}${more}`);
  return parts.join(" · ");
}
