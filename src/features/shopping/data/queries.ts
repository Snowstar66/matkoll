import "server-only";
import type { IngredientDefaults } from "@/features/catalog";
import type { MealPlan } from "@/features/mealplan";
import type { PantrySnapshot } from "@/features/pantry";
import { computeList, countedDishIds, emptyOverlay, type ListRecipe, type ShoppingLine } from "../domain/compute-list";

// The shopping list's reads. The list itself is never stored (AD-8): it is
// counted from the other modules' read functions (AD-1) and this module's
// overlay (the checks, Story 3.4), passed in as `sources` so the integration
// tests can give them a test user's client.

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
  /** The plan's checked line keys (data/checks.ts, listChecksIn); `null` when they cannot be read. */
  checks: (planId: string) => Promise<readonly string[] | null>;
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
  /** The checks could not be read: no line is shown checked, and checking is off. */
  checksUnavailable: boolean;
};

/**
 * Inköpslista's data (FR-15, AD-8): the current plan, then the recipes behind
 * its dishes, the pantry and the plan's checks in parallel, then the names
 * and sections of the recipes' catalog ingredients, counted with
 * computeList. The checks are read whenever there is a plan (Pontus's own
 * items, Story 3.5, need no dish); the pantry only with a dish whose recipe
 * is left. Without a pantry the list is counted against an empty one,
 * without checks no line is checked. Throws what the sources throw.
 */
export async function loadShoppingList(sources: ShoppingSources): Promise<ShoppingList> {
  const plan = await sources.currentPlan();
  if (!plan) return { plan: null, lines: [], pantryUnavailable: false, checksUnavailable: false };

  const recipeIds = [...new Set(plan.recipes.flatMap((dish) => (dish.recipeId ? [dish.recipeId] : [])))];
  const withRecipes = recipeIds.length > 0;
  const [recipes, pantry, checks] = await Promise.all([
    withRecipes ? sources.recipesByIds(recipeIds) : [],
    withRecipes ? sources.pantry() : new Map(),
    sources.checks(plan.id),
  ]);
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
    overlay: { ...emptyOverlay, checks: checks ?? [] },
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
    checksUnavailable: checks === null,
  };
}
