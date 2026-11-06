import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { MealPlanContent } from "./meal-plan-content";

export const metadata: Metadata = { title: "Matsedel" };

// Matsedel (FR-13, Story 25.3): where the week is planned. Veckans rätter (the
// dishes with their day chip and ✕) and Lägg till rätter (Favoriter, På
// erbjudande, Alla recept; "+" puts a dish on the week with no day), and a
// bar at the bottom with the dishes and the items still to buy. Everything is
// read inside <Suspense> (AD-18), with skeleton rows while it loads.
// "Tidigare veckor" leads to the earlier plans (Story 3.2). Three week tiles
// under the title show this week and the next two with their dish counts
// (Stories 13.7, 13.9); the week is in the address as ?vecka=2026-W45.
export default function MealPlanPage({ searchParams }: PageProps<"/matsedel">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader
            title="Matsedel"
            tab="/matsedel"
            // The size of Erbjudanden, so the header does not move when it arrives.
            action={<span aria-hidden="true" inert className="size-tap" />}
          />
          <Skeleton rows={3} />
        </>
      }
    >
      <MealPlanContent searchParams={searchParams} />
    </Suspense>
  );
}
