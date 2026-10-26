import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import type { PlanSummary } from "@/features/mealplan";
import { listPreviousPlans, MealPlanDataError } from "@/features/mealplan/server";
import { PreviousPlans } from "@/features/mealplan/ui/previous-plans";
import { errorMessages } from "@/lib/errors";

/**
 * Tidigare's data, for a <Suspense> in page.tsx (AD-18): the earlier plans.
 * When they cannot be read, a notice says so; other errors go to the error boundary.
 */
export async function PreviousPlansContent() {
  await requireUserOrRedirect("/matsedel/tidigare");
  let plans: PlanSummary[];
  try {
    plans = await listPreviousPlans();
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_previous_unavailable", { reason: error.detail });
    return <Notice role="alert">{errorMessages.mealplan_previous_unavailable}</Notice>;
  }
  return <PreviousPlans plans={plans} />;
}
