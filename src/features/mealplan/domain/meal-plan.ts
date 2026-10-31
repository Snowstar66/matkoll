import { z } from "zod";
import {
  atHomeSummaryText,
  recipeStatus,
  type PantrySnapshot,
  type RecipeStatus,
  type StatusLine,
} from "@/features/pantry";
import { weekAnchorDate, weekStartSchema } from "./week";

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
  /** When the dish was marked cooked (Story 13.4, ISO 8601), or `null`/left out when it is not. */
  cookedAt?: string | null;
  /** The day the dish is planned for, 1 (måndag) to 7 (söndag), or `null`/left out for "Ingen dag än" (Story 13.5). */
  weekday?: number | null;
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

/** A weekday: 1 (måndag) to 7 (söndag). */
export const weekdaySchema = z.number().int().min(1).max(7);

/**
 * What addToCurrentPlan takes: the recipe, and optionally the servings
 * (else the recipe's own) and the new dish's id (so a retry adds it once).
 */
export const addToPlanSchema = z.object({
  recipeId: z.uuid(),
  servings: servingsSchema.optional(),
  id: z.uuid().optional(),
  /** 1–7 for a day, `null` for "Ingen dag än"; left out, the dish gets defaultWeekday (Story 13.5). */
  weekday: weekdaySchema.nullable().optional(),
  /** The Monday of the week to add to (Story 13.7); left out, this week. */
  weekStart: weekStartSchema.optional(),
});
export type AddToPlanInput = z.input<typeof addToPlanSchema>;

/** What setWeekday takes: the dish and its day, or `null` for "Ingen dag än". */
export const weekdayChangeSchema = z.object({ id: z.uuid(), weekday: weekdaySchema.nullable() });
export type WeekdayChange = z.infer<typeof weekdayChangeSchema>;

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
  cookedAt: z.string().nullish(),
  weekday: weekdaySchema.nullish(),
});

/** Dishes in plan order: by position, then by id for dishes at the same place. */
type Ordered = Pick<PlanRecipe, "id" | "position">;
export function comparePlanRecipes(a: Ordered, b: Ordered): number {
  if (a.position !== b.position) return a.position - b.position;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The recipe behind a dish, as the plan shows it and counts its status. */
export type DishRecipe = {
  imageUrl: string | null;
  totalMinutes: number | null;
  /** The servings the recipe's amounts are written for. */
  originalServings: number;
  /** `originalText` is the line as written, for "Kontrollera själv" in Markera som lagad (Story 13.4). */
  lines: (StatusLine & { originalText?: string })[];
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

/** What a dish card says about its status, and how full its meter is. */
export type DishProgress = {
  /** "6 av 8 hemma", or "Allt finns hemma" when every catalog ingredient is at home. */
  text: string;
  /** The share at home, from 0 to 1, for the meter beside the text. */
  value: number;
};

/** The dish card's line when every catalog ingredient is at home for its servings. */
export const allAtHomeText = "Allt finns hemma";

/**
 * The dish card's line and meter (Epic 11, FR-13, AD-7): "Allt finns
 * hemma" with a full meter when nothing is missing for the chosen servings
 * (`missingCount` 0, the same as "Kan lagas nu" in the library, so Recept and
 * Matsedel never disagree), else "6 av 8 hemma" (atHomeSummaryText) with
 * the meter at 0.75. `null` when the recipe has no catalog ingredient to
 * count, or the counts are not numbers: the card then shows the time only,
 * without a meter.
 */
export function dishProgress(
  status: Pick<RecipeStatus, "missingCount" | "atHomeCount" | "ingredientCount">,
): DishProgress | null {
  const { missingCount, atHomeCount, ingredientCount } = status;
  if (!Number.isFinite(ingredientCount) || ingredientCount < 1) return null;
  if (missingCount === 0) return { text: allAtHomeText, value: 1 };
  // Something is missing, so never "8 av 8 hemma" with a full meter.
  const atHome = Number.isFinite(atHomeCount) ? Math.min(ingredientCount - 1, Math.max(0, Math.floor(atHomeCount))) : 0;
  return { text: atHomeSummaryText(atHome, ingredientCount), value: atHome / ingredientCount };
}

/**
 * The line under a dish card's title: the time and what is at home, "35 min
 * · 6 av 8 hemma", or either alone; "Borttaget recept" for a deleted recipe;
 * `null` when there is nothing to say.
 */
export function dishMetaText(
  recipeId: string | null,
  totalMinutes: number | null | undefined,
  progress: DishProgress | null,
): string | null {
  if (!recipeId) return "Borttaget recept";
  const time = totalMinutes && Number.isFinite(totalMinutes) && totalMinutes > 0 ? `${totalMinutes} min` : null;
  const parts = [time, progress?.text ?? null].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
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

// Tidigare matsedlar (FR-14, Story 3.2).

/** An earlier meal plan as Tidigare lists it. */
export type PlanSummary = {
  id: string;
  name: string;
  /** When the plan was made (ISO 8601). */
  createdAt: string;
  dishCount: number;
  /** The Monday of the plan's week, or `null` for a plan pushed aside by the pre-week buttons. */
  weekStart: string | null;
};

/** A meal plan with its dishes in order, as its own page shows it. */
export type PlanDetail = MealPlan & {
  /** Whether the plan is of this week or a coming one: Matsedel shows it, not Tidigare. */
  isCurrent: boolean;
  /** The Monday of the plan's week (Story 13.7), `null` for an earlier plan with no week. */
  weekStart?: string | null;
  /** When the plan was made (ISO 8601). */
  createdAt: string;
};

/** The month abbreviations, fixed so the server and every browser write the same. */
const shortMonths = ["jan", "feb", "mars", "apr", "maj", "juni", "juli", "aug", "sep", "okt", "nov", "dec"];

/** The date in Stockholm, so two "Vecka 44" from different years can be told apart: "26 okt 2026". */
export function planDateText(createdAt: string, timeZone: string = planTimeZone): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(new Date(createdAt))
    .reduce<Record<string, number>>((all, part) => ({ ...all, [part.type]: Number(part.value) }), {});
  return `${parts.day} ${shortMonths[parts.month - 1]} ${parts.year}`;
}

/** "1 rätt", "3 rätter". */
export function dishCountText(count: number): string {
  return count === 1 ? "1 rätt" : `${count} rätter`;
}

/**
 * An earlier plan's line in Tidigare: "3 rätter · skapad 26 okt 2026". A plan
 * without a week (`weekStart` null: pushed aside by the old "Ny matsedel" or
 * "Använd igen", which cleared its week) says so: "4 rätter · undanlagd ·
 * skapad 30 okt 2026". Only the creation date is stored, not when it was set aside.
 */
export function planSummaryText(plan: Pick<PlanSummary, "createdAt" | "dishCount" | "weekStart">): string {
  const made = `skapad ${planDateText(plan.createdAt)}`;
  return `${dishCountText(plan.dishCount)} · ${plan.weekStart === null ? `undanlagd · ${made}` : made}`;
}

/** The question before an earlier plan is deleted: "Ta bort Vecka 42? Det går inte att ångra." */
export function deletePlanQuestion(name: string): string {
  return `Ta bort ${name}? Det går inte att ångra.`;
}

/**
 * Under an earlier plan whose dishes include deleted recipes: "1 rätt med
 * borttaget recept följer inte med." or "2 rätter med borttagna recept följer
 * inte med."; `null` when there are none.
 */
export function leftOutText(count: number): string | null {
  if (count <= 0) return null;
  if (count === 1) return "1 rätt med borttaget recept följer inte med.";
  return `${count} rätter med borttagna recept följer inte med.`;
}

/** Why "Kopiera till …" is unavailable when every dish's recipe is deleted. */
export const nothingToCopyText = "Alla recept på matsedeln är borttagna, så den går inte att kopiera.";

/** An earlier plan without dishes, which "Kopiera till …" cannot use either. */
export const noDishesText = "Matsedeln har inga rätter.";

/** The short confirmation in Tidigare after a plan was deleted. */
export const planDeletedText = "Matsedeln är borttagen.";

/** A plan id: the plan to copy or delete. */
export const planIdSchema = z.uuid();

// Dagar på matsedeln (Story 13.5).

/** The weekdays' names, Monday first: index 0 is weekday 1. */
export const weekdayNames = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"] as const;

/** The weekdays 1–7, Monday first. */
export const weekdays = [1, 2, 3, 4, 5, 6, 7] as const;

/** The name of a weekday (1–7) in lower case, as a sentence uses it: "torsdag". */
export function weekdayWord(weekday: number): string {
  return (weekdayNames[weekday - 1] ?? "").toLowerCase();
}

/** The first three letters of a weekday's name: "Lör". */
export function weekdayShortName(weekday: number): string {
  return (weekdayNames[weekday - 1] ?? "").slice(0, 3);
}

/** The weekday (1 måndag to 7 söndag) of `date`'s day in Stockholm. */
export function todayWeekday(date: Date, timeZone: string = planTimeZone): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(date);
  const index = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(name);
  return index === -1 ? 1 : index + 1;
}

/**
 * The date of `weekday` (1 måndag to 7 söndag) in the week `date` falls in,
 * week counted Monday to Sunday in Stockholm: "26 okt". Plain calendar
 * arithmetic on the Stockholm date, so a week with a clock change still has
 * seven consecutive dates.
 */
export function weekdayDateText(date: Date, weekday: number, timeZone: string = planTimeZone): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" })
    .formatToParts(date)
    .reduce<Record<string, number>>((all, part) => ({ ...all, [part.type]: Number(part.value) }), {});
  const target = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + (weekday - todayWeekday(date, timeZone))));
  return `${target.getUTCDate()} ${shortMonths[target.getUTCMonth()]}`;
}

/** The dates a week covers, Monday to Sunday: "27 okt – 2 nov". */
export function weekRangeText(weekStart: string): string {
  const anchor = weekAnchorDate(weekStart);
  return `${weekdayDateText(anchor, 1)} \u2013 ${weekdayDateText(anchor, 7)}`;
}

/** The day of the month of `weekday` in the week `date` falls in: "31". */
export function weekdayDayNumber(date: Date, weekday: number, timeZone: string = planTimeZone): string {
  return weekdayDateText(date, weekday, timeZone).split(" ")[0] ?? "";
}

/**
 * The line under a dish's title in the week list (Story 3.11): "60 min · 4
 * port.", or "Borttaget recept · 4 port." for a deleted recipe. The time is
 * left out when the recipe has none.
 */
export function dishRowMetaText(
  recipeId: string | null,
  totalMinutes: number | null | undefined,
  servings: number,
): string {
  const time = totalMinutes && Number.isFinite(totalMinutes) && totalMinutes > 0 ? `${totalMinutes} min` : null;
  return [recipeId ? time : "Borttaget recept", `${servings} port.`].filter(Boolean).join(" · ");
}

/** The shopping row above the week list when the number of missing items is not at hand: "Inköpslista för vecka 44". */
export function shoppingRowText(weekNumber: number): string {
  return `Inköpslista för vecka ${weekNumber}`;
}

/**
 * The day a new dish gets when Pontus does not choose: the first day from
 * today to Sunday with no dish yet, so a week fills up one day at a time with
 * no extra step; `null` ("Ingen dag än") when every remaining day has a dish.
 */
export function defaultWeekday(dishes: readonly Pick<PlanRecipe, "weekday">[], today: number): number | null {
  const taken = new Set(dishes.map((dish) => dish.weekday));
  for (let day = Math.min(7, Math.max(1, today)); day <= 7; day += 1) {
    if (!taken.has(day)) return day;
  }
  return null;
}

/** One day of the week view: the weekday (`null` for "Ingen dag än") and its dishes in plan order. */
export type DaySection<T extends Pick<PlanRecipe, "weekday" | "position" | "id">> = {
  weekday: number | null;
  dishes: T[];
};

/**
 * The dishes grouped for the week view: måndag to söndag, always all seven
 * (an empty day has no dishes), then "Ingen dag än" last and only when it
 * has dishes. Within a day the plan's order stays.
 */
export function groupByWeekday<T extends Pick<PlanRecipe, "weekday" | "position" | "id">>(
  dishes: readonly T[],
): DaySection<T>[] {
  const sorted = [...dishes].sort(comparePlanRecipes);
  const days: DaySection<T>[] = weekdays.map((weekday) => ({
    weekday,
    dishes: sorted.filter((dish) => dish.weekday === weekday),
  }));
  const none = sorted.filter((dish) => !dish.weekday);
  return none.length > 0 ? [...days, { weekday: null, dishes: none }] : days;
}

/** The short confirmation after a dish was added: "Lagt på matsedeln, torsdag." */
export function addedOnDayText(weekday: number | null | undefined): string {
  return weekday ? `Lagt på matsedeln, ${weekdayWord(weekday)}.` : addedToPlanText;
}

/** The confirmation after a move: "Pasta ligger på torsdag." or "Pasta har ingen dag." */
export function movedText(title: string, weekday: number | null): string {
  return weekday ? `${title} ligger på ${weekdayWord(weekday)}.` : `${title} har ingen dag.`;
}
