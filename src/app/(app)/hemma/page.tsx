import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { HomePlace } from "./home-place";

export const metadata: Metadata = { title: "Lagersaldo" };

// Lagersaldo, at /hemma (FR-11, FR-12): the location cards with the number of items in each,
// and the chosen location's items. The location comes from `?plats=` (kyl,
// frys, skafferi; anything else is Kyl). Everything is read inside
// <Suspense> (AD-18), with skeleton rows while it loads. "+" in the header,
// "Lägg till vara" in an empty location and a tap on an item open the sheet
// Lagervara (Story 2.2); a new item starts in the chosen location. A swipe on
// a row or "Ta bort" in the sheet removes an item, with "Ångra" (Story 2.3).
// The camera button under the cards photographs the chosen location and shows
// lagerförslag (Story 6.1); each is saved only when Pontus confirms it, or
// corrects it in the sheet Lagervara and confirms it there, and rejected ones
// are never saved (Story 6.2). The suggestions' provider is above the sheet's,
// which takes its "Bekräfta" and "Avvisa" from it. "Töm kylen" under the list
// empties the chosen location after a question, with "Ångra" (Story 6.3).
//
// Places (Story 8.2, FR-29–FR-31, FR-33, AD-24): Hemma shows the selected
// place, read on the server; the title stays "Lagersaldo" (Story 10.4: the page was called Hemma, like the first place). With two or more places
// the site switch above the cards selects another; with one, "Lägg till
// ställe" at the bottom opens the sheet Ställen. Every write from the page
// sends the id of the place it showed.
export default function HomePage({ searchParams }: PageProps<"/hemma">) {
  return (
    <Suspense
      fallback={
        <>
          {/* The size of "+", so the header does not move when it arrives. */}
          <PageHeader title="Lagersaldo" action={<span aria-hidden="true" inert className="size-tap" />} />
          <Skeleton rows={3} />
        </>
      }
    >
      <HomePlace searchParams={searchParams} />
    </Suspense>
  );
}
