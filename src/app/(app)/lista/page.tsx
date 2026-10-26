import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { ShoppingListContent } from "./shopping-list-content";

export const metadata: Metadata = { title: "Inköpslista" };

// Inköpslista (FR-15): counted from the current meal plan, its recipes and
// the pantry every time it is read (AD-8), grouped by store section, with
// what is at home taken off. Everything is read inside <Suspense> (AD-18),
// with skeleton rows while it loads.
export default function ShoppingListPage() {
  return (
    <>
      <PageHeader title="Inköpslista" />
      <Suspense fallback={<Skeleton rows={4} />}>
        <ShoppingListContent />
      </Suspense>
    </>
  );
}
