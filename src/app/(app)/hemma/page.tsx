import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { placeFromSlug, placeSlug } from "@/features/pantry";
import { HomeContent } from "./home-content";

export const metadata: Metadata = { title: "Hemma" };

// Hemma (FR-11, FR-12): the location cards with the number of items in each,
// and the chosen location's items. The location comes from `?plats=` (kyl,
// frys, skafferi; anything else is Kyl). Everything is read inside
// <Suspense> (AD-18), with skeleton rows while it loads. Adding, changing and
// removing items arrive with Stories 2.2 and 2.3, the camera with Epic 6.
export default function HomePage({ searchParams }: PageProps<"/hemma">) {
  return (
    <>
      <PageHeader title="Hemma" />
      <Suspense fallback={<Skeleton rows={3} />}>
        <HomePlace searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/**
 * Reads the location from the address. The data's <Suspense> is keyed on the
 * location, so choosing another location shows the skeleton rows (after
 * 300 ms) instead of the old location's items while the new ones load.
 */
async function HomePlace({ searchParams }: Pick<PageProps<"/hemma">, "searchParams">) {
  const { plats } = await searchParams;
  const location = placeFromSlug(plats);
  const next = plats === undefined ? "/hemma" : `/hemma?plats=${placeSlug(location)}`;
  return (
    <Suspense key={location} fallback={<Skeleton rows={3} />}>
      <HomeContent location={location} next={next} />
    </Suspense>
  );
}
