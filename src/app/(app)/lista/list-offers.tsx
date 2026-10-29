import { requireUserOrRedirect } from "@/features/auth/server";
import { type StoreOffer, weekStartOf } from "@/features/offers";
import { getActiveOffers, getLastFetch, OffersDataError } from "@/features/offers/server";
import { OffersSheetButton, type OffersListing } from "@/features/offers/ui/offers-sheet";
import { addKeyedItems, getKeyedItemsOnList, ShoppingDataError } from "@/features/shopping/server";
import { offersSiteName, type Store } from "@/features/settings";
import { MealPlanDataError } from "@/features/mealplan/server";

import { listStores, SettingsDataError } from "@/features/settings/server";

/**
 * "Erbjudanden" in Inköpslista's header and the sheet Veckans erbjudanden
 * (Story 9.1, FR-35), for a <Suspense> in page.tsx (AD-18). The page puts it
 * together (route → ui): the user's stores from settings and their offers
 * from offers (Story 9.13: all stores, not only the selected one) go to the sheet, and the button goes to the header as a slot,
 * so the shopping list never imports the offers module (AD-1). Nothing is
 * fetched from the store here: only "Hämta veckans erbjudanden" does that.
 * When the store or the offers cannot be read, the sheet says so and the
 * list is not affected.
 */
export async function ListOffers() {
  await requireUserOrRedirect("/lista");
  let stores: Store[] = [];
  let offers: StoreOffer[] = [];
  const fetchedAt = new Map<string, Date | null>();
  let unavailable = false;
  let listing: OffersListing | null = null;
  try {
    // Story 9.13: every store of the user, the selected one first; the sheet fetches from those with a link.
    stores = await listStores();
    const read = await Promise.all(
      stores.map(async (store) => ({ store, offers: await getActiveOffers(store.id), fetched: await getLastFetch(store.id) })),
    );
    offers = read.flatMap((entry) => entry.offers);
    for (const entry of read) fetchedAt.set(entry.store.id, entry.fetched);
    // Story 9.12: the current plan and the offers already on its list. Without them the rows only show.
    try {
      const onList = await getKeyedItemsOnList(offers.map((offer) => offer.id));
      if (onList) listing = { planId: onList.planId, onList: onList.onList, add: addKeyedItems };
    } catch (error) {
      if (!(error instanceof ShoppingDataError || error instanceof MealPlanDataError)) throw error;
      console.error("offers_listing_unavailable", { reason: error.detail });
    }
  } catch (error) {
    if (!(error instanceof SettingsDataError || error instanceof OffersDataError)) throw error;
    console.error("offers_unavailable", { reason: error.detail });
    unavailable = true;
  }
  const now = new Date();
  return (
    <OffersSheetButton
      stores={stores.map((store) => ({
        id: store.id,
        name: store.name,
        chain: store.chain,
        offersUrl: store.offersUrl,
        siteName: store.offersUrl ? offersSiteName(store.offersUrl) : null,
        fetchedAt: fetchedAt.get(store.id)?.toISOString() ?? null,
      }))}
      offers={offers}
      weekStart={offers.map((offer) => offer.weekStart).sort().at(-1) ?? weekStartOf(now)}
      now={now.toISOString()}
      unavailable={unavailable}
      listing={listing}
    />
  );
}
