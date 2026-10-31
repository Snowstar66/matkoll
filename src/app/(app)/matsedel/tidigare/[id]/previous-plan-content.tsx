import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import { copyTargets, type PlanDetail } from "@/features/mealplan";
import { getPlan, getWeekCounts, MealPlanDataError } from "@/features/mealplan/server";
import { PreviousPlan } from "@/features/mealplan/ui/previous-plan";
import { errorMessages } from "@/lib/errors";

/**
 * An earlier plan's data, for a <Suspense> in page.tsx (AD-18). An id that
 * is not a uuid, or not one of the user's plans, is "Sidan finns inte."; the
 * current plan's address leads to Matsedel. When the plan cannot be read, a
 * notice says so; other errors go to the error boundary.
 */
export async function PreviousPlanContent({ id }: { id: string }) {
  await requireUserOrRedirect(`/matsedel/tidigare/${encodeURIComponent(id)}`);
  let plan: PlanDetail | null;
  try {
    plan = await getPlan(id);
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_unavailable", { reason: error.detail });
    return (
      <>
        <PageHeader title="Tidigare matsedlar" backHref="/matsedel/tidigare" />
        <Notice role="alert">{errorMessages.mealplan_unavailable}</Notice>
      </>
    );
  }
  if (!plan) notFound();
  if (plan.isCurrent) redirect("/matsedel");
  return (
    <>
      <PageHeader title={plan.name} backHref="/matsedel/tidigare" />
      <PreviousPlan plan={plan} targetCounts={await targetCountsOrNull()} />
    </>
  );
}

/** The dishes on the "Kopiera till" weeks; without them the sheet still works, just without the counts. */
async function targetCountsOrNull(): Promise<Record<string, number> | null> {
  try {
    return await getWeekCounts(copyTargets().map((target) => target.weekStart));
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_counts_unavailable", { reason: error.detail });
    return null;
  }
}
