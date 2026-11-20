import { getActiveOffers, OffersDataError } from "@/features/offers/server";
import { type OfferTagData, offerTagOf } from "@/lib/offer-tag";

/**
 * This week's offers in the selected store as tags by catalog ingredient, for the price after a list line's name
 * ("Grädde 19 kr/st"). Matches on the offer's `ingredientId`; the first offer of an ingredient is the one shown.
 * Started without being waited for (the list never waits for it), so it never rejects: when the offers cannot be read
 * it logs `list_offers_unavailable` and gives `null`, and the list shows no tags.
 */
export async function loadListOfferTags(storeId: string): Promise<Record<string, OfferTagData> | null> {
  try {
    const offers = await getActiveOffers(storeId);
    const tags: Record<string, OfferTagData> = {};
    for (const offer of offers) {
      if (offer.ingredientId && !(offer.ingredientId in tags)) tags[offer.ingredientId] = offerTagOf(offer);
    }
    return tags;
  } catch (error) {
    // Whatever fails, the list stays: a tag is a nicety, so even a bug here only costs the tags.
    console.error("list_offers_unavailable", { reason: error instanceof OffersDataError ? error.detail : error instanceof Error ? error.name : "unknown" });
    return null;
  }
}
