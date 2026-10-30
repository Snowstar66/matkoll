import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import { getMealPlanView, getWeekCounts, MealPlanDataError, type MealPlanView } from "@/features/mealplan/server";
import { addWeeks, currentWeekStart, highlightDay, overviewWeeks, viewedWeek } from "@/features/mealplan";
import { AddDishButton, AddDishProvider } from "@/features/mealplan/ui/add-dish-sheet";
import { MealPlanList } from "@/features/mealplan/ui/meal-plan-list";
import { WeekNav } from "@/features/mealplan/ui/week-nav";
import type { RecipeListItem } from "@/features/recipes";
import { siteLineText } from "@/features/pantry";
import { listRecipes, RecipeDataError, searchRecipes } from "@/features/recipes/server";
import { errorMessages } from "@/lib/errors";

/**
 * The library for Lägg till rätt, or `null` when it cannot be read (logged
 * as `mealplan_recipes_unavailable`): the sheet says so, and the plan is
 * shown all the same.
 */
async function libraryOrNull(): Promise<RecipeListItem[] | null> {
  try {
    return await listRecipes();
  } catch (error) {
    if (!(error instanceof RecipeDataError)) throw error;
    console.error("mealplan_recipes_unavailable", { reason: error.detail });
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
 * Matsedel's data, for a <Suspense> in page.tsx (AD-18): the plan (with its
 * recipes and the pantry) and the library, read in parallel. When the plan
 * cannot be read, a notice says so. The library, the recipes behind the
 * dishes and the pantry each degrade on their own: the sheet says the
 * library could not be read, the dishes show their stored titles, or the
 * status is left out. With more than one place, "Lager: Stugan" under the
 * page title says which place the status is counted against (AD-24); the
 * list shows it while it has dishes. Other errors go to the error boundary.
 */
export async function MealPlanContent({ searchParams }: { searchParams?: Promise<{ vecka?: string | string[]; dag?: string | string[] }> } = {}) {
  await requireUserOrRedirect("/matsedel");
  const params = await searchParams;
  const vecka = params?.vecka;
  const dag = params?.dag;
  const now = new Date();
  const weekStart = viewedWeek(Array.isArray(vecka) ? vecka[0] : vecka, now);
  const upcoming = weekStart !== currentWeekStart(now);

  const overview = Array.from({ length: overviewWeeks }, (_, offset) => addWeeks(currentWeekStart(now), offset));
  if (!overview.includes(weekStart)) overview.push(weekStart);

  let view: MealPlanView;
  let recipes: RecipeListItem[] | null;
  let counts: Record<string, number>;
  try {
    [view, recipes, counts] = await Promise.all([getMealPlanView(weekStart), libraryOrNull(), countsOrEmpty(overview)]);
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_unavailable", { reason: error.detail });
    return (
      <>
        <PageHeader title="Matsedel" />
        <WeekNav weekStart={weekStart} now={now} />
        <Notice role="alert">{errorMessages.mealplan_unavailable}</Notice>
      </>
    );
  }

  return (
    <AddDishProvider
      recipes={recipes}
      searchRecipes={searchRecipes}
      plannedDays={view.dishes.map((dish) => dish.weekday ?? null)}
      weekStart={weekStart}
    >
      <PageHeader
        title="Matsedel"
        action={<AddDishButton variant="icon" />}
      />
      <WeekNav weekStart={weekStart} counts={counts} now={now} />
      <MealPlanList
        key={weekStart}
        weekStart={weekStart}
        highlightDay={highlightDay(Array.isArray(dag) ? dag[0] : dag)}
        upcoming={upcoming}
        planName={view.plan?.name ?? null}
        dishes={view.dishes}
        snapshot={view.snapshot}
        names={view.names ?? {}}
        siteLine={siteLineText(view.site)}
        siteId={view.site?.id ?? null}
      />
    </AddDishProvider>
  );
}
