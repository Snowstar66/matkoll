import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import { addToCurrentPlan, getMealPlanView, getWeekCounts, MealPlanDataError, type MealPlanView } from "@/features/mealplan/server";
import { addWeeks, currentWeekStart, overviewWeeks, viewedWeek } from "@/features/mealplan";
import { WeekPlanner } from "@/features/mealplan/ui/week-planner";
import { WeekNav } from "@/features/mealplan/ui/week-nav";
import type { PantrySite } from "@/features/pantry";
import { listPantrySites, PantryDataError } from "@/features/pantry/server";
import { BoendeVal } from "@/features/pantry/ui/boende-val";
import { CatalogDataError } from "@/features/catalog/server";
import { OffersDataError } from "@/features/offers/server";
import { RecipeDataError } from "@/features/recipes/server";
import { SettingsDataError } from "@/features/settings/server";
import { searchIngredients } from "@/features/catalog/server";
import { getShoppingList } from "@/features/shopping/server";
import type { PlanOption } from "@/features/suggestions";
import { weekPlanOptions } from "@/features/suggestions/server";
import { errorMessages } from "@/lib/errors";
import { Suspense } from "react";
import { ListOffers } from "../lista/list-offers";
import { loadBoendeCounts } from "../boende-counts";
import { OfferIdeas } from "../offer-ideas";

/**
 * The library as rows for "Lägg till rätter", or `null` when it cannot be read
 * (logged as `mealplan_recipes_unavailable`): the planner says so, and the
 * week is shown all the same.
 */
async function optionsOrNull(): Promise<PlanOption[] | null> {
  try {
    return await weekPlanOptions();
  } catch (error) {
    if (
      !(
        error instanceof RecipeDataError ||
        error instanceof OffersDataError ||
        error instanceof SettingsDataError ||
        error instanceof CatalogDataError ||
        error instanceof PantryDataError
      )
    )
      throw error;
    console.error("mealplan_recipes_unavailable", { reason: error instanceof CatalogDataError ? error.code : error.detail });
    return null;
  }
}

/** The user's boenden for the button under the title, or `null` when they cannot be read: no button then. */
async function sitesOrNull(): Promise<PantrySite[] | null> {
  try {
    return await listPantrySites();
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    console.error("mealplan_sites_unavailable", { reason: error.detail });
    return null;
  }
}

/** The dishes by week for the week overview, or none when they cannot be read: the tiles then show "–". */
async function countsOrEmpty(weeks: string[]): Promise<Record<string, number>> {
  try {
    return await getWeekCounts(weeks);
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_counts_unavailable", { reason: error.detail });
    return {};
  }
}

/**
 * How many items the week's dishes still need: the shopping list's own lines
 * for the week (what is at home and the Basvaror already taken off), without
 * the household's own items and those already checked off. `null` when the
 * list cannot be counted: the bar then names the dishes only.
 */
async function itemsToBuy(weekStart: string): Promise<number | null> {
  const list = await getShoppingList(weekStart);
  if (!list.ok) return null;
  return list.data.lines.filter((line) => !line.isCustom && !line.checked).length;
}

/**
 * Matsedel's data, for a <Suspense> in page.tsx (AD-18): the week's dishes
 * (with the pantry), the library as rows with offers, and the count of items
 * still to buy, read in parallel. When the plan cannot be read, a notice
 * says so. The library and the count each degrade on their own. With more
 * than one place, the boende button under the title (on a phone) says which
 * place "hemma" is counted against (AD-24, Story 16.14). Other errors go to
 * the error boundary.
 */
export async function MealPlanContent({ searchParams }: { searchParams?: Promise<{ vecka?: string | string[] }> } = {}) {
  await requireUserOrRedirect("/matsedel");
  const params = await searchParams;
  const vecka = params?.vecka;
  const now = new Date();
  const weekStart = viewedWeek(Array.isArray(vecka) ? vecka[0] : vecka, now);

  const overview = Array.from({ length: overviewWeeks }, (_, offset) => addWeeks(currentWeekStart(now), offset));
  if (!overview.includes(weekStart)) overview.push(weekStart);

  let view: MealPlanView;
  let options: PlanOption[] | null;
  let sites: PantrySite[] | null;
  let counts: Record<string, number>;
  let toBuy: number | null;
  try {
    [view, options, counts, sites, toBuy] = await Promise.all([
      getMealPlanView(weekStart),
      optionsOrNull(),
      countsOrEmpty(overview),
      sitesOrNull(),
      itemsToBuy(weekStart),
    ]);
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_unavailable", { reason: error.detail });
    return (
      <>
        <PageHeader title="Matsedel" tab="/matsedel" />
        <WeekNav weekStart={weekStart} now={now} />
        <Notice role="alert">{errorMessages.mealplan_unavailable}</Notice>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Matsedel"
        tab="/matsedel"
        action={
          <Suspense fallback={<span aria-hidden="true" inert className="size-tap" />}>
            <ListOffers next="/matsedel" />
          </Suspense>
        }
      />
      {/* A phone has no side menu: the boende is directly under the title (Story 19.2). */}
      {sites && sites.length > 1 ? (
        <div className="-mt-2 mb-3 desktop:hidden">
          <BoendeVal variant="page" sites={sites} loadCounts={loadBoendeCounts} />
        </div>
      ) : null}
      <div className="flex flex-col gap-4">
        <WeekNav weekStart={weekStart} counts={counts} now={now} />
        <WeekPlanner
          key={weekStart}
          weekStart={weekStart}
          dishes={view.dishes}
          options={options}
          toBuy={toBuy}
          offersFooter={<OfferIdeas weekStart={weekStart} addToWeek={addToCurrentPlan} searchIngredients={searchIngredients} />}
        />
      </div>
    </>
  );
}
