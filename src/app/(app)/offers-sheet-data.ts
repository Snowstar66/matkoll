import { bestStore, fittingOffers, type BestStore, type StoreOffer, weekStartOf } from "@/features/offers";
import { getActiveOffers, getLastFetch, OffersDataError } from "@/features/offers/server";
import type { OffersListing, OffersSheetProps } from "@/features/offers/ui/offers-sheet";
import { addKeyedItems, getKeyedItemsOnList, ShoppingDataError } from "@/features/shopping/server";
import { offersSiteName, type Store } from "@/features/settings";
import { MealPlanDataError } from "@/features/mealplan/server";
import { getPantrySnapshot, PantryDataError } from "@/features/pantry/server";
import { getIngredientRecipeCounts, RecipeDataError } from "@/features/recipes/server";
import { listStores, SettingsDataError } from "@/features/settings/server";

/**
 * What the sheet Veckans erbjudanden needs, read for a page (route → ui, AD-1):
 * the user's stores from settings and their offers from offers (Story 9.13: all
 * stores, not only the selected one), what is on the list, the best store and
 * the rows that fit. Shared by Inköpslista's button (lista/list-offers.tsx) and
 * the filter Erbjudanden in Recept (Story 9.3), so both show the same offers
 * from the same stores. Nothing is fetched from a store here. When the stores
 * or the offers cannot be read, `unavailable` is set (logged, never thrown).
 */
export async function loadOffersSheetData(): Promise<{ props: OffersSheetProps; offers: StoreOffer[]; stores: Store[] }> {
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
      listing = { planId: onList.planId, onList: onList.onList, add: addKeyedItems };
    } catch (error) {
      if (!(error instanceof ShoppingDataError || error instanceof MealPlanDataError)) throw error;
      console.error("offers_listing_unavailable", { reason: error.detail });
    }
  } catch (error) {
    if (!(error instanceof SettingsDataError || error instanceof OffersDataError)) throw error;
    console.error("offers_unavailable", { reason: error.detail });
    unavailable = true;
  }
  // Story 9.14: "Veckans bästa butik", counted without AI from the pantry and the recipes; left out when either cannot be read.
  let best: BestStore | null = null;
  let fitIds: string[] | undefined;
  const withOffers = new Set(offers.map((offer) => offer.storeId));
  if (!unavailable && offers.length > 0) {
    try {
      const [snapshot, counts] = await Promise.all([getPantrySnapshot(), getIngredientRecipeCounts()]);
      const pantry = new Set(snapshot.keys());
      // Story 16.7: the rows that fit say "Passar dig", by the same rule as the best store.
      fitIds = [...fittingOffers(offers, pantry, counts).keys()];
      if (withOffers.size > 0) best = bestStore(offers, stores.map((store) => store.id), pantry, counts);
    } catch (error) {
      if (!(error instanceof PantryDataError || error instanceof RecipeDataError)) throw error;
      console.error("best_store_unavailable", { reason: error.detail });
    }
  }
  const now = new Date();
  return {
    offers,
    stores,
    props: {
      stores: stores.map((store) => ({
        id: store.id,
        name: store.name,
        chain: store.chain,
        offersUrl: store.offersUrl,
        siteName: store.offersUrl ? offersSiteName(store.offersUrl) : null,
        fetchedAt: fetchedAt.get(store.id)?.toISOString() ?? null,
      })),
      offers,
      weekStart: offers.map((offer) => offer.weekStart).sort().at(-1) ?? weekStartOf(now),
      now: now.toISOString(),
      unavailable,
      listing,
      best,
      fitIds,
    },
  };
}
