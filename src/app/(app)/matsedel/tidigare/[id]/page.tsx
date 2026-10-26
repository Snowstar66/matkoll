import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/app-shell/page-header";
import { Skeleton } from "@/components/skeleton";
import { getPlan, MealPlanDataError } from "@/features/mealplan/server";
import { PreviousPlanContent } from "./previous-plan-content";

/** The tab shows the plan's name; "Tidigare matsedlar" when there is none to show. */
export async function generateMetadata({ params }: PageProps<"/matsedel/tidigare/[id]">): Promise<Metadata> {
  const { id } = await params;
  try {
    const plan = await getPlan(id);
    return { title: plan?.name ?? "Tidigare matsedlar" };
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    return { title: "Tidigare matsedlar" };
  }
}

// An earlier meal plan (FR-14): its dishes and servings, "Använd igen" and
// "Ta bort matsedel". The id and the session are read inside <Suspense>
// (AD-18); while they load, the header with "Tillbaka" and skeleton rows show.
export default function PreviousPlanPage({ params }: PageProps<"/matsedel/tidigare/[id]">) {
  return (
    <Suspense
      fallback={
        <>
          <PageHeader title="Tidigare matsedlar" backHref="/matsedel/tidigare" />
          <Skeleton rows={3} />
        </>
      }
    >
      {params.then(({ id }) => (
        <PreviousPlanContent id={id} />
      ))}
    </Suspense>
  );
}
