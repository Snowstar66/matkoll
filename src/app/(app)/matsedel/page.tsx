import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { PreviousPlansLink } from "@/features/mealplan/ui/previous-plans-link";
import { MealPlanContent } from "./meal-plan-content";

export const metadata: Metadata = { title: "Matsedel" };

// Matsedel (FR-13): the current meal plan's dishes with servings and status,
// and "+" in the header (or "Lägg till rätt" in the empty plan), which opens
// Lägg till rätt with the favourites first. Everything is read inside
// <Suspense> (AD-18), with skeleton rows while it loads. "Tidigare" in the
// header leads to the earlier plans (Story 3.2). "‹ Vecka 44 ›" under the
// title moves between this week and the coming ones (Story 13.7); the week is
// in the address as ?vecka=2026-W45.
export default function MealPlanPage({ searchParams }: PageProps<"/matsedel">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader
            title="Matsedel"
            action={
              <>
                <PreviousPlansLink />
                {/* The size of "+", so the header does not move when it arrives. */}
                <span aria-hidden="true" inert className="size-tap" />
              </>
            }
          />
          <Skeleton rows={3} />
        </>
      }
    >
      <MealPlanContent searchParams={searchParams} />
    </Suspense>
  );
}
