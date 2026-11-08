import { copyTargets, currentWeekStart, weekNumber, weeksBetween, type MealPlan } from "@/features/mealplan";
import { getCurrentPlan, getPlanForWeek, getRememberedWeek } from "@/features/mealplan/server";
import { getActiveOffers } from "@/features/offers/server";
import { lineOffers, type LineOffer } from "@/features/recipes";
import type { RecipeWeek } from "@/features/recipes/ui/recipe-body";
import { listStores } from "@/features/settings/server";
import { getShoppingList } from "@/features/shopping/server";

// What a recipe page reads besides the recipe, shared by an own recipe (/recept/[id]) and another
// household's shared one (/recept/delade/[id]).

/**
 * The best offer per catalog ingredient from this week's offers in all the
 * user's stores (Story 9.13, 25.1); none when the stores or offers cannot be read.
 */
export async function readLineOffers(): Promise<Record<string, LineOffer>> {
  try {
    const stores = await listStores();
    const offers = (await Promise.all(stores.map((store) => getActiveOffers(store.id)))).flat();
    return lineOffers(offers, new Map(stores.map((store) => [store.id, store.name])));
  } catch (error) {
    console.error("recipe_offers_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return {};
  }
}

/** The catalog ingredients on the shopping list now, for "På listan"; none when the list cannot be read. */
export async function readListedIds(): Promise<string[]> {
  try {
    const list = await getShoppingList();
    if (!list.ok) return [];
    return [...new Set(list.data.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])))];
  } catch (error) {
    console.error("recipe_list_unavailable", { reason: error instanceof Error ? error.name : "unknown" });
    return [];
  }
}

/**
 * The weeks the recipe `recipeId` can be planned for, with its dish on each: the three coming ones
 * and the week last viewed on Matsedel or Inköpslista when that is further ahead (UX-04, UX-05);
 * the remembered week, and this week's plan (`null` when it cannot be read). Without a recipe id
 * (a shared recipe not saved yet) no week has its dish.
 */
export async function readPlanWeeks(recipeId: string | null): Promise<{ weeks: RecipeWeek[]; remembered: string; plan: MealPlan | null }> {
  const remembered = await getRememberedWeek();
  const targets = copyTargets();
  const rememberedTarget = targets.some((target) => target.weekStart === remembered)
    ? []
    : [{ weekStart: remembered, offset: weeksBetween(currentWeekStart(), remembered) }];
  const planWeeks = [...targets.map((target) => ({ weekStart: target.weekStart, offset: target.offset })), ...rememberedTarget];
  const [plan, ...otherPlans] = await Promise.all(
    planWeeks.map((target) => (target.offset === 0 ? getCurrentPlan() : getPlanForWeek(target.weekStart)).catch((): MealPlan | null => null)),
  );
  const weeks: RecipeWeek[] = planWeeks.map((target, index) => {
    const weekPlan = index === 0 ? plan : otherPlans[index - 1];
    const found = recipeId ? weekPlan?.recipes.find((candidate) => candidate.recipeId === recipeId && !candidate.cookedAt) : undefined;
    return {
      weekStart: target.weekStart,
      offset: target.offset,
      number: weekNumber(target.weekStart),
      count: weekPlan?.recipes.length ?? 0,
      dish: found ? { id: found.id, weekday: found.weekday ?? null } : null,
    };
  });
  return { weeks, remembered, plan };
}
