import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { MealPlanContent } from "./meal-plan-content";

export const metadata: Metadata = { title: "Matsedel" };

// Matsedel (FR-13): the current meal plan's dishes with servings and status,
// and "+" in the header (or "Lägg till rätt" in the empty plan), which opens
// Lägg till rätt with the favourites first. Everything is read inside
// <Suspense> (AD-18), with skeleton rows while it loads. "Tidigare" arrives
// with Story 3.2.
export default function MealPlanPage() {
  return (
    <Suspense
      fallback={
        <>
          {/* The size of "+", so the header does not move when it arrives. */}
          <PageHeader title="Matsedel" action={<span aria-hidden="true" inert className="size-tap" />} />
          <Skeleton rows={3} />
        </>
      }
    >
      <MealPlanContent />
    </Suspense>
  );
}
