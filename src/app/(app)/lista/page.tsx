import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";

export const metadata: Metadata = { title: "Inköpslista" };

// The shopping list arrives in a later epic.
export default function ShoppingListPage() {
  return (
    <>
      <PageHeader title="Inköpslista" />
      <Suspense fallback={<Skeleton />}>
        <ShoppingListContent />
      </Suspense>
    </>
  );
}

async function ShoppingListContent() {
  await requireUserOrRedirect("/lista");
  return <EmptyState>Lägg rätter på matsedeln så räknas listan fram.</EmptyState>;
}
