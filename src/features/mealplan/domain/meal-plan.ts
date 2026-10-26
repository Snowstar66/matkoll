import { z } from "zod";
import { recipeStatus, type PantrySnapshot, type RecipeStatus, type StatusLine } from "@/features/pantry";

// Matsedel (FR-13, AD-22): the current meal plan with its dishes, what the
// actions take, and the plan's name. Pure, so it is tested without a database.

/** A dish on a meal plan (matsedelsrätt), as the table holds it. */
export type PlanRecipe = {
  id: string;
  /** `null` once the recipe has been deleted; the title stays (AD-20). */
  recipeId: string | null;
  /** The recipe's title when the dish was added. */
  recipeTitle: string;
  servings: number;
  position: number;
};

/** The current meal plan: its name ("Vecka 44") and its dishes in order. */
export type MealPlan = {
  id: string;
  name: string;
  recipes: PlanRecipe[];
};

/** A removed dish as it was, for "Ångra": restorePlanRecipe puts it back with the same id. */
export type PlanRecipeRow = PlanRecipe & { mealPlanId: string };

/** The most servings a dish has; the table's check is the same (1–1000). */
export const maxServings = 1000;

/** Servings on a dish: a whole number from 1 to maxServings. */
export const servingsSchema = z.number().int().min(1).max(maxServings);

/**
 * A recipe's own servings as a dish's default: a whole number within 1 to
 * maxServings, so any saved recipe can be added (recipes allow more).
 */
export function clampServings(servings: number): number {
  if (!Number.isFinite(servings)) return 1;
  return Math.min(maxServings, Math.max(1, Math.round(servings)));
}

/**
 * What addToCurrentPlan takes: the recipe, and optionally the servings
 * (else the recipe's own) and the new dish's id (so a retry adds it once).
 */
export const addToPlanSchema = z.object({
  recipeId: z.uuid(),
  servings: servingsSchema.optional(),
  id: z.uuid().optional(),
});
export type AddToPlanInput = z.input<typeof addToPlanSchema>;

/** What setServings takes: the dish and its new servings. */
export const servingsChangeSchema = z.object({ id: z.uuid(), servings: servingsSchema });
export type ServingsChange = z.infer<typeof servingsChangeSchema>;

/** What restorePlanRecipe takes: the row removePlanRecipe returned. */
export const planRecipeRowSchema = z.object({
  id: z.uuid(),
  mealPlanId: z.uuid(),
  recipeId: z.uuid().nullable(),
  recipeTitle: z.string().trim().min(1).max(200),
  servings: servingsSchema,
  position: z.number().int().min(0),
});

/** Dishes in plan order: by position, then by id for dishes at the same place. */
export function comparePlanRecipes(a: PlanRecipe, b: PlanRecipe): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The recipe behind a dish, as the plan shows it and counts its status. */
export type DishRecipe = {
  imageUrl: string | null;
  totalMinutes: number | null;
  /** The servings the recipe's amounts are written for. */
  originalServings: number;
  lines: StatusLine[];
};

/** A dish as Matsedel shows it: the dish and its recipe, or `null` when the recipe is gone. */
export type PlanDish = PlanRecipe & { recipe: DishRecipe | null };

/** The plan's dishes with their recipes (by recipe id), in plan order. */
export function toPlanDishes(
  recipes: readonly PlanRecipe[],
  recipesById: ReadonlyMap<string, DishRecipe>,
): PlanDish[] {
  return [...recipes].sort(comparePlanRecipes).map((dish) => ({
    ...dish,
    recipe: dish.recipeId ? (recipesById.get(dish.recipeId) ?? null) : null,
  }));
}

/**
 * The dish's status against the whole pantry for its own servings (AD-7):
 * `null` without a pantry (it could not be read) or without a recipe.
 */
export function dishStatus(
  recipe: DishRecipe | null,
  servings: number,
  snapshot: PantrySnapshot | null,
): RecipeStatus | null {
  if (!recipe || !snapshot) return null;
  return recipeStatus({ servings: recipe.originalServings, lines: recipe.lines }, servings, snapshot);
}

/** The time zone the week is counted in: Pontus's. */
const planTimeZone = "Europe/Stockholm";

/** The ISO 8601 week number of `date`'s day in Stockholm (1–53). */
export function isoWeek(date: Date, timeZone: string = planTimeZone): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(date)
    .reduce<Record<string, number>>((all, part) => ({ ...all, [part.type]: Number(part.value) }), {});
  const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  // The Thursday of the same week decides the year the week belongs to.
  const weekday = day.getUTCDay() || 7;
  day.setUTCDate(day.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** A new meal plan's name: "Vecka 44" (FR-14). */
export function isoWeekName(date: Date): string {
  return `Vecka ${isoWeek(date)}`;
}

/**
 * The short confirmation, with "Ångra", for the dishes removed while the same
 * confirmation has shown: "Pasta är borttagen från matsedeln.", "Pasta och
 * Soppa är borttagna från matsedeln." or "3 rätter är borttagna från matsedeln."
 */
export function removedDishesText(titles: readonly string[]): string {
  if (titles.length === 1) return `${titles[0]} är borttagen från matsedeln.`;
  if (titles.length === 2) return `${titles[0]} och ${titles[1]} är borttagna från matsedeln.`;
  return `${titles.length} rätter är borttagna från matsedeln.`;
}

/** The short confirmation after a dish was added: "Lagt på matsedeln." */
export const addedToPlanText = "Lagt på matsedeln.";
