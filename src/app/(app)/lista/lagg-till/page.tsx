import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { ListOffers } from "../list-offers";
import { ShoppingListContent } from "../shopping-list-content";

export const metadata: Metadata = { title: "Lägg till vara" };

// Snabbtillägg (Story 17.9): the shopping list with "Lägg till egen vara" already open and focus in the
// field. The address works as a home-screen shortcut (the manifest's `shortcuts`) and as a link.
// The header is the list's own, with Erbjudanden and the P button, so nothing changes once the sheet closes.
export default function QuickAddPage({ searchParams }: PageProps<"/lista/lagg-till">) {
  return (
    <>
      <PageHeader
        title="Inköpslista"
        tab="/lista"
        action={
          <Suspense fallback={<span aria-hidden="true" inert className="size-tap" />}>
            <ListOffers />
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton rows={4} />}>
        <ShoppingListContent searchParams={searchParams} quickAdd />
      </Suspense>
    </>
  );
}
