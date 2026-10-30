import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { ListOffers } from "./list-offers";
import { ShoppingListContent } from "./shopping-list-content";

export const metadata: Metadata = { title: "Inköpslista" };

// Inköpslista (FR-15): counted from the current meal plan, its recipes and
// the pantry every time it is read (AD-8), grouped by store section, with
// what is at home taken off. Everything is read inside <Suspense> (AD-18),
// with skeleton rows while it loads. "Erbjudanden" in the header opens the
// sheet Veckans erbjudanden (Story 9.1); it is read in a <Suspense> of its
// own, with a space of its size while it loads, so the header never moves.
export default function ShoppingListPage({ searchParams }: PageProps<"/lista">) {
  return (
    <>
      <PageHeader
        title="Inköpslista"
        action={
          <Suspense fallback={<span aria-hidden="true" inert className="h-tap w-28" />}>
            <ListOffers />
          </Suspense>
        }
      />
      <Suspense fallback={<Skeleton rows={4} />}>
        <ShoppingListContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}
