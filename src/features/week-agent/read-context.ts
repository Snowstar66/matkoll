import "server-only";
import { getWeekDishes } from "@/features/mealplan/server";
import { listRecipeTitles } from "@/features/recipes/server";
import type { WeekAgentContext } from "./actions/contract";
import { getWeekAgentSettings, getWeekDraft } from "./server";

/**
 * What the route layer and the UI need to draw the card for a week: the household's settings, the week's draft (if
 * any), which weekdays have a dish in Matsedel and which do not, and how many recipes the library has. For pages,
 * after requireUserOrRedirect, inside <Suspense>. Throws MealPlanDataError / RecipeDataError when those cannot be
 * read (the settings and the draft fall back to the defaults / none, as getWeekAgentSettings and getWeekDraft do).
 */
export async function getWeekAgentContext(weekStart: string): Promise<WeekAgentContext> {
  const [settings, draft, dishes, recipes] = await Promise.all([getWeekAgentSettings(), getWeekDraft(weekStart), getWeekDishes(weekStart), listRecipeTitles()]);
  const filledDays = [...new Set(dishes.flatMap((dish) => (dish.weekday === null ? [] : [dish.weekday])))].sort((a, b) => a - b);
  return { settings, draft, filledDays, emptyDays: [1, 2, 3, 4, 5, 6, 7].filter((day) => !filledDays.includes(day)), recipeCount: recipes.length };
}
