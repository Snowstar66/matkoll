import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { placeFromSlug, placeSlug } from "@/features/pantry";
import { AddPantryItemButton, PantrySheetProvider } from "@/features/pantry/ui/pantry-item-sheet";
import { HomeContent } from "./home-content";

export const metadata: Metadata = { title: "Hemma" };

// Hemma (FR-11, FR-12): the location cards with the number of items in each,
// and the chosen location's items. The location comes from `?plats=` (kyl,
// frys, skafferi; anything else is Kyl). Everything is read inside
// <Suspense> (AD-18), with skeleton rows while it loads. "+" in the header,
// "Lägg till vara" in an empty location and a tap on an item open the sheet
// Lagervara (Story 2.2); a new item starts in the chosen location. Removing
// items arrives with Story 2.3, the camera with Epic 6.
export default function HomePage({ searchParams }: PageProps<"/hemma">) {
  return (
    <Suspense
      fallback={
        <>
          {/* The size of "+", so the header does not move when it arrives. */}
          <PageHeader title="Hemma" action={<span aria-hidden="true" inert className="size-tap" />} />
          <Skeleton rows={3} />
        </>
      }
    >
      <HomePlace searchParams={searchParams} />
    </Suspense>
  );
}

/**
 * Reads the location from the address; "+" in the header needs it. The
 * data's <Suspense> is keyed on the location, so choosing another location
 * shows the skeleton rows (after 300 ms) instead of the old location's items
 * while the new ones load.
 */
async function HomePlace({ searchParams }: Pick<PageProps<"/hemma">, "searchParams">) {
  const { plats } = await searchParams;
  const location = placeFromSlug(plats);
  const next = plats === undefined ? "/hemma" : `/hemma?plats=${placeSlug(location)}`;
  return (
    <PantrySheetProvider location={location}>
      <PageHeader title="Hemma" action={<AddPantryItemButton variant="icon" />} />
      <Suspense key={location} fallback={<Skeleton rows={3} />}>
        <HomeContent location={location} next={next} />
      </Suspense>
    </PantrySheetProvider>
  );
}
