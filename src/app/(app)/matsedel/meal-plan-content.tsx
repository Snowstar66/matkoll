import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import { getMealPlanView, MealPlanDataError, type MealPlanView } from "@/features/mealplan/server";
import { AddDishButton, AddDishProvider } from "@/features/mealplan/ui/add-dish-sheet";
import { MealPlanList } from "@/features/mealplan/ui/meal-plan-list";
import { PreviousPlansLink } from "@/features/mealplan/ui/previous-plans-link";
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
export async function MealPlanContent() {
  await requireUserOrRedirect("/matsedel");

  let view: MealPlanView;
  let recipes: RecipeListItem[] | null;
  try {
    [view, recipes] = await Promise.all([getMealPlanView(), libraryOrNull()]);
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_unavailable", { reason: error.detail });
    return (
      <>
        <PageHeader title="Matsedel" action={<PreviousPlansLink />} />
        <Notice role="alert">{errorMessages.mealplan_unavailable}</Notice>
      </>
    );
  }

  return (
    <AddDishProvider recipes={recipes} searchRecipes={searchRecipes}>
      <PageHeader
        title="Matsedel"
        action={
          <>
            <PreviousPlansLink />
            <AddDishButton variant="icon" />
          </>
        }
      />
      <MealPlanList
        planName={view.plan?.name ?? null}
        dishes={view.dishes}
        snapshot={view.snapshot}
        names={view.names ?? {}}
        siteLine={siteLineText(view.site)}
      />
    </AddDishProvider>
  );
}
