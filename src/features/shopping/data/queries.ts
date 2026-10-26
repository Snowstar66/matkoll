import "server-only";
import type { IngredientDefaults } from "@/features/catalog";
import type { MealPlan } from "@/features/mealplan";
import type { PantrySnapshot } from "@/features/pantry";
import { computeList, countedDishIds, emptyOverlay, type ListRecipe, type ShoppingLine } from "../domain/compute-list";

// The shopping list's reads. The list has no tables of its own in Story 3.3:
// everything comes from the other modules' read functions (AD-1), passed in
// as `sources` so the integration tests can give them a test user's client.

/** The other modules' read functions the list is counted from. */
export type ShoppingSources = {
  /** mealplan.getCurrentPlan */
  currentPlan: () => Promise<Pick<MealPlan, "id" | "name" | "recipes"> | null>;
  /** recipes.getRecipesByIds */
  recipesByIds: (ids: readonly string[]) => Promise<ListRecipe[]>;
  /** pantry.getPantrySnapshot; `null` when the pantry cannot be read. */
  pantry: () => Promise<PantrySnapshot | null>;
  /** catalog.getIngredientNames */
  ingredientNames: (ids: readonly string[]) => Promise<Record<string, string>>;
  /** catalog.getIngredientDefaults */
  ingredientDefaults: (ids: readonly string[]) => Promise<Record<string, Pick<IngredientDefaults, "section">>>;
};

/** What Inköpslista shows. */
export type ShoppingList = {
  /** The current plan, or `null` when there is none. */
  plan: {
    id: string;
    name: string;
    /** The dishes the list is counted from: those whose recipe was read. */
    dishCount: number;
    /** The dishes left out because their recipe is deleted or was not read. */
    skippedCount: number;
    /** Each dish's title by meal_plan_recipe id, for "från [rätt]". */
    dishTitles: Record<string, string>;
  } | null;
  /** computeList's lines, sorted by section and name. */
  lines: ShoppingLine[];
  /** The pantry could not be read: nothing is taken off the list. */
  pantryUnavailable: boolean;
};

/**
 * Inköpslista's data (FR-15, AD-8): the current plan, then the recipes behind
 * its dishes and the pantry in parallel, then the names and sections of the
 * recipes' catalog ingredients, counted with computeList. Without a plan, or
 * without a dish with a recipe, the pantry is not read. Without a pantry the
 * list is counted against an empty one. Throws what the sources throw.
 */
export async function loadShoppingList(sources: ShoppingSources): Promise<ShoppingList> {
  const plan = await sources.currentPlan();
  if (!plan) return { plan: null, lines: [], pantryUnavailable: false };

  const recipeIds = [...new Set(plan.recipes.flatMap((dish) => (dish.recipeId ? [dish.recipeId] : [])))];
  const [recipes, pantry] =
    recipeIds.length > 0 ? await Promise.all([sources.recipesByIds(recipeIds), sources.pantry()]) : [[], new Map()];
  const ingredientIds = [
    ...new Set(recipes.flatMap((recipe) => recipe.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])))),
  ];
  const [names, defaults] =
    ingredientIds.length > 0
      ? await Promise.all([sources.ingredientNames(ingredientIds), sources.ingredientDefaults(ingredientIds)])
      : [{}, {}];

  const lines = computeList({
    plan,
    recipes,
    snapshot: pantry ?? new Map(),
    catalog: { names, defaults },
    overlay: emptyOverlay,
  });
  const counted = countedDishIds(plan, recipes).length;
  return {
    plan: {
      id: plan.id,
      name: plan.name,
      dishCount: counted,
      skippedCount: plan.recipes.length - counted,
      dishTitles: Object.fromEntries(plan.recipes.map((dish) => [dish.id, dish.recipeTitle])),
    },
    lines,
    pantryUnavailable: pantry === null,
  };
}
