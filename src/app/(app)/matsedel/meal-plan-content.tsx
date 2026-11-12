import { PageHeader } from "@/components/app-shell/page-header";
import { Notice } from "@/components/notice";
import { requireUserOrRedirect } from "@/features/auth/server";
import { addToCurrentPlan, getMealPlanView, getWeekCounts, MealPlanDataError, resolveViewedWeek, type MealPlanView } from "@/features/mealplan/server";
import { addWeeks, currentWeekStart, firstOpenWeekday, overviewWeeks, todayWeekday, weekNumber, weekQueryAlways } from "@/features/mealplan";
import { WeekPlanner } from "@/features/mealplan/ui/week-planner";
import { WeekNav } from "@/features/mealplan/ui/week-nav";
import { recipeNutrition, type RecipeNutrition } from "@/features/nutrition";
import { getIngredientNutrition } from "@/features/nutrition/server";
import type { PantrySite } from "@/features/pantry";
import { listPantrySites, PantryDataError } from "@/features/pantry/server";
import { BoendeVal } from "@/features/pantry/ui/boende-val";
import { CatalogDataError } from "@/features/catalog/server";
import { OffersDataError } from "@/features/offers/server";
import { RecipeDataError } from "@/features/recipes/server";
import { SettingsDataError } from "@/features/settings/server";
import { searchIngredients } from "@/features/catalog/server";
import { getShoppingList } from "@/features/shopping/server";
import type { OfferIdeasView, PlanOption } from "@/features/suggestions";
import { isOfferIdeaError, loadOfferIdeas, readOfferIdeas, startOfferIdeas, weekPlanOptions } from "@/features/suggestions/server";
import { errorMessages } from "@/lib/errors";
import { Suspense } from "react";
import { ListOffers } from "../lista/list-offers";
import { recipeFits } from "@/features/menu-advisor";
import { getFoodFitPeople } from "@/features/menu-advisor/server";
import { MenuShortcut } from "@/features/menu-advisor/ui/menu-shortcut";
import { AddDishesButton } from "@/features/mealplan/ui/add-dishes-button";
import { loadBoendeCounts } from "../boende-counts";
import { OfferIdeas } from "../offer-ideas";
import { draftFreshness } from "@/features/week-agent";
import { getWeekDraft } from "@/features/week-agent/server";
import { MatsedelWeekAgentCard, MatsedelWeekAgentMenu } from "./week-agent-slots";

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

/** The saved "Nya idéer med extrapris" for the footer of På erbjudande, or `null` when they cannot be read: no ideas then. */
async function ideasOrNull(): Promise<OfferIdeasView | null> {
  try {
    return await loadOfferIdeas();
  } catch (error) {
    if (!isOfferIdeaError(error)) throw error;
    console.error("mealplan_ideas_unavailable", { reason: "detail" in error ? error.detail : "recipes" });
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
 * The nutrition per portion of the week's recipes by recipe id, for the week line (Näring); none when
 * the nutrition table cannot be read: no line then. One read for all the week's ingredients.
 */
async function weekNutrition(dishes: MealPlanView["dishes"]): Promise<Record<string, RecipeNutrition>> {
  try {
    const recipes = new Map(dishes.flatMap((dish) => (dish.recipeId && dish.recipe ? [[dish.recipeId, dish.recipe] as const] : [])));
    const ids = [...new Set([...recipes.values()].flatMap((recipe) => recipe.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : []))))];
    const byId = await getIngredientNutrition(ids);
    return Object.fromEntries([...recipes].map(([id, recipe]) => [id, recipeNutrition(recipe.lines, byId, recipe.originalServings)]));
  } catch (error) {
    console.error("mealplan_nutrition_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return {};
  }
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
  const weekStart = await resolveViewedWeek(Array.isArray(vecka) ? vecka[0] : vecka, now);

  const overview = Array.from({ length: overviewWeeks }, (_, offset) => addWeeks(currentWeekStart(now), offset));
  if (!overview.includes(weekStart)) overview.push(weekStart);

  let view: MealPlanView;
  let options: PlanOption[] | null;
  let sites: PantrySite[] | null;
  let counts: Record<string, number>;
  let toBuy: number | null;
  let ideas: OfferIdeasView | null;
  let people: Awaited<ReturnType<typeof getFoodFitPeople>>;
  try {
    [view, options, counts, sites, toBuy, ideas, people] = await Promise.all([
      getMealPlanView(weekStart),
      optionsOrNull(),
      countsOrEmpty(overview),
      sitesOrNull(),
      itemsToBuy(weekStart),
      ideasOrNull(),
      // One read for the whole page (never throws; empty when nothing is filled in).
      getFoodFitPeople(),
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

  // Hushållets preferenser held against the week's recipes ("Anna undviker koriander", allergies in red); `{}` for none. Never hides a dish.
  const fits = recipeFits(
    view.dishes.flatMap((dish) =>
      dish.recipeId && dish.recipe ? [{ id: dish.recipeId, title: dish.recipeTitle, lines: dish.recipe.lines.map((line) => ({ originalText: line.originalText ?? "" })) }] : [],
    ),
    people,
  );

  // Veckoagenten (Tillval, per device: the components hide themselves when it is off): which weekdays have a dish and
  // which are free and still ahead decide the card (empty / partly filled) and the ⋯ (full week).
  const firstOpenDay = firstOpenWeekday(weekStart, now, todayWeekday(now));
  const filledDays = [...new Set(view.dishes.flatMap((dish) => (dish.weekday ? [dish.weekday] : [])))].sort((a, b) => a - b);
  const emptyDays = [1, 2, 3, 4, 5, 6, 7].filter((day) => day >= firstOpenDay && !filledDays.includes(day));
  const agentAddress = `/matsedel/veckoforslag${weekQueryAlways(weekStart)}`;
  // The waiting proposal and its age on the server's clock; never throws (null when it cannot be read).
  const waiting = emptyDays.length > 0 ? await getWeekDraft(weekStart) : null;
  const waitingDraft = waiting ? { id: waiting.id, freshness: draftFreshness(waiting.createdAt, now) } : null;

  // Not awaited: the plan renders at once and the week line arrives when the nutrition has been read.
  const nutrition = weekNutrition(view.dishes);

  return (
    <>
      <PageHeader
        title="Matsedel"
        tab="/matsedel"
        action={
          <>
            <Suspense fallback={<span aria-hidden="true" inert className="size-tap" />}>
              <ListOffers next="/matsedel" />
            </Suspense>
            <AddDishesButton />
            <MatsedelWeekAgentMenu weekStart={weekStart} redoHref={`${agentAddress}&gor-om=1`} filledDays={filledDays} emptyDays={emptyDays} />
          </>
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
        <MenuShortcut />
        <MatsedelWeekAgentCard href={`${agentAddress}&starta=1`} draft={waitingDraft} draftHref={agentAddress} newHref={`${agentAddress}&starta=1&nytt=1`} weekNumber={weekNumber(weekStart)} filledDays={filledDays} emptyDays={emptyDays} />
        <WeekPlanner
          key={weekStart}
          weekStart={weekStart}
          firstOpenDay={firstOpenDay}
          dishes={view.dishes}
          options={options}
          toBuy={toBuy}
          nutrition={nutrition}
          fits={fits}
          offersFooter={
            <OfferIdeas
              initial={ideas}
              start={startOfferIdeas}
              read={readOfferIdeas}
              weekStart={weekStart}
              addToWeek={addToCurrentPlan}
              searchIngredients={searchIngredients}
            />
          }
        />
      </div>
    </>
  );
}
