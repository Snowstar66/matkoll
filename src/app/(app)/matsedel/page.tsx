import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/skeleton";
import { requireUserOrRedirect } from "@/features/auth/server";

export const metadata: Metadata = { title: "Matsedel" };

// The meal plan arrives in Epic 3; "Lägg till rätt" comes with it.
export default function MealPlanPage() {
  return (
    <>
      <PageHeader title="Matsedel" />
      <Suspense fallback={<Skeleton />}>
        <MealPlanContent />
      </Suspense>
    </>
  );
}

async function MealPlanContent() {
  await requireUserOrRedirect("/matsedel");
  return <EmptyState>Ingen rätt på matsedeln än.</EmptyState>;
}
