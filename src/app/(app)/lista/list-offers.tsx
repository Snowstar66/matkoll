import { requireUserOrRedirect } from "@/features/auth/server";
import { OffersSheetButton } from "@/features/offers/ui/offers-sheet";
import { loadOffersSheetData } from "../offers-sheet-data";

/**
 * "Erbjudanden" in Inköpslista's header and the sheet Veckans erbjudanden
 * (Story 9.1, FR-35), for a <Suspense> in page.tsx (AD-18). The page puts it
 * together (route → ui): loadOffersSheetData reads the user's stores and their
 * offers (Story 9.13: all stores, not only the selected one) for the sheet, and the
 * button goes to the header as a slot, so the shopping list never imports the
 * offers module (AD-1). Nothing is fetched from the store here: only "Hämta
 * veckans erbjudanden" does that. When the store or the offers cannot be read,
 * the sheet says so and the list is not affected.
 */
export async function ListOffers() {
  await requireUserOrRedirect("/lista");
  const { props } = await loadOffersSheetData();
  return <OffersSheetButton {...props} />;
}
