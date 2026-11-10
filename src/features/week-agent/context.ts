import "server-only";
import { addWeeks, currentWeekStart, maxWeeksAhead, weeksBetween } from "@/features/mealplan";
import { getWeekDishes, type WeekDish } from "@/features/mealplan/server";
import { getActiveOffers } from "@/features/offers/server";
import { getFoodFitPeople } from "@/features/menu-advisor/server";
import { getStapleRules, listHouseholdOldItems } from "@/features/pantry/server";
import type { OldPantryItem } from "@/features/pantry";
import { listRecipeRows } from "@/features/recipes/server";
import type { RecipeListRow } from "@/features/recipes";
import { listStores } from "@/features/settings/server";
import { offerTagsByRecipe } from "@/features/suggestions";
import type { FitPerson } from "@/features/menu-advisor";
import type { StoredProposal } from "./data/week-agent";
import type { WeekAgentSettings } from "./domain/settings";
import type { FixedDay, OfferHit, RecentRecipe, RecipeCandidate, UseSoonItem } from "./domain/types";

// The composition of Veckoagenten's input (server only): the household's recipes with their offers and what goes out
// soon, the dishes already on the week, the people and the recent weeks, read through the other modules' public server
// entries (AD-1). Everything but the recipes is "a help": a read that fails is logged by reason and left out, so the
// week can still be planned. The planner itself (domain/) is pure and gets all of this as data.

/** How many earlier weeks count as "recent". */
const recentWeeks = 4;
const maxOffersPerRecipe = 4;
const maxUseSoonPerRecipe = 4;

export type WeekPool = {
  /** Every library recipe with its facts, in the library's order. */
  pool: RecipeCandidate[];
  /** The week's dishes (every row of Matsedel's plan for the week, with or without a day). */
  dishes: WeekDish[];
  people: FitPerson[];
  recent: RecentRecipe[];
  /** A recipe's own servings (1 when unknown), for the dish "Använd veckan" writes. */
  servingsOf: (recipeId: string) => number | null;
  /** Ingredient lines by recipe id, for the fixed days. */
  linesOf: (recipeId: string | null) => string[];
};

/** A week the planner may write to: a Monday from this week to `maxWeeksAhead` weeks ahead. */
export function isPlannableWeek(weekStart: string, now: Date = new Date()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return false;
  const date = new Date(`${weekStart}T12:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDay() !== 1) return false;
  const ahead = weeksBetween(currentWeekStart(now), weekStart);
  return ahead >= 0 && ahead <= maxWeeksAhead;
}

async function helper<T>(what: string, fallback: T, read: () => Promise<T>): Promise<T> {
  try {
    return await read();
  } catch (error) {
    console.error("week_agent_input_unavailable", { what, reason: error instanceof Error ? error.name : "unknown" });
    return fallback;
  }
}

/** The offers on the main ingredients of each recipe, from the stores the household follows (or the chosen ones), with the store's name. */
async function offersByRecipe(rows: readonly RecipeListRow[], settings: WeekAgentSettings): Promise<Map<string, OfferHit[]>> {
  const out = new Map<string, OfferHit[]>();
  const [stores, staples] = await Promise.all([listStores(), getStapleRules()]);
  const chosen = settings.offerStoreIds.length > 0 ? stores.filter((store) => settings.offerStoreIds.includes(store.id)) : stores;
  const recipes = rows.map((row) => ({ id: row.id, lines: row.lines.map((line) => ({ ingredientId: line.ingredientId, amount: line.amount, unit: line.unit })) }));
  for (const store of chosen) {
    const offers = await getActiveOffers(store.id);
    for (const [id, tags] of Object.entries(offerTagsByRecipe(offers, recipes, staples))) {
      const known = out.get(id) ?? [];
      for (const tag of tags) if (known.length < maxOffersPerRecipe && !known.some((hit) => hit.name === tag.name)) known.push({ ...tag, store: store.name, storeId: store.id });
      out.set(id, known);
    }
  }
  return out;
}

/** What at home is due or overdue, by catalog ingredient. They are "old" already, so no day of the week: "behöver användas snart". */
const useSoonOf = (row: RecipeListRow, old: readonly OldPantryItem[]): UseSoonItem[] => {
  const ids = new Set(row.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : [])));
  return old.filter((item) => ids.has(item.ingredientId)).slice(0, maxUseSoonPerRecipe).map((item) => ({ name: item.name, expiresWeekday: null }));
};

/** Reads everything the planner needs for `weekStart`. The recipes and the week's dishes must be readable (they throw); the rest is left out when it cannot be read. */
export async function readWeekPool(weekStart: string, settings: WeekAgentSettings): Promise<WeekPool> {
  const [rows, dishes] = await Promise.all([listRecipeRows(), getWeekDishes(weekStart)]);
  const [people, old, offers, recent] = await Promise.all([
    helper("people", [] as FitPerson[], () => getFoodFitPeople()),
    helper("old_items", [] as OldPantryItem[], () => (settings.useSoonFirst ? listHouseholdOldItems() : Promise.resolve([]))),
    helper("offers", new Map<string, OfferHit[]>(), () => (settings.favourOffers ? offersByRecipe(rows, settings) : Promise.resolve(new Map()))),
    helper("recent", [] as RecentRecipe[], async () => {
      const weeks = await Promise.all(Array.from({ length: recentWeeks }, (_, index) => getWeekDishes(addWeeks(weekStart, -(index + 1)))));
      return weeks.flatMap((week, index) => week.flatMap((dish) => (dish.recipeId ? [{ recipeId: dish.recipeId, weeksAgo: index + 1 }] : [])));
    }),
  ]);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const pool = rows.map((row): RecipeCandidate => ({
    id: row.id,
    title: row.title,
    ingredients: row.lines.map((line) => line.originalText),
    totalMinutes: row.totalMinutes,
    offers: offers.get(row.id) ?? [],
    useSoon: useSoonOf(row, old),
  }));
  return { pool, dishes, people, recent, servingsOf: (id) => byId.get(id)?.originalServings ?? null, linesOf: (id) => (id ? (byId.get(id)?.lines.map((line) => line.originalText) ?? []) : []) };
}

/**
 * The days that stay as they are: every dish on a day of the week's plan (the household's own or an earlier "Använd
 * veckan"), and the draft's days the user locked (`lockedDays`, or all the draft's locked ones with `keepDraftLocks`).
 * A day of the plan wins over a locked draft day.
 */
export function fixedDaysOf(pool: WeekPool, draft: StoredProposal | null, lockedDays: readonly number[], keepDraftLocks: boolean): FixedDay[] {
  const fixed = new Map<number, FixedDay>();
  for (const dish of pool.dishes) {
    if (dish.weekday === null || fixed.has(dish.weekday)) continue;
    fixed.set(dish.weekday, { dayIndex: dish.weekday, recipeId: dish.recipeId, title: dish.recipeTitle, ingredients: pool.linesOf(dish.recipeId), source: "fixed", placedBy: dish.source === "week_agent" ? "week_agent" : "user" });
  }
  for (const day of draft?.proposal.days ?? []) {
    if (fixed.has(day.dayIndex) || day.source !== "proposed" || day.slot !== "dinner" || day.recipeId === null || day.title === null) continue;
    if (!(lockedDays.includes(day.dayIndex) || (keepDraftLocks && day.locked))) continue;
    fixed.set(day.dayIndex, { dayIndex: day.dayIndex, recipeId: day.recipeId, title: day.title, ingredients: pool.linesOf(day.recipeId), source: "proposed" });
  }
  return [...fixed.values()].sort((a, b) => a.dayIndex - b.dayIndex);
}

/** What "Använd veckan" needs and no more: the week's dishes and the recipes' servings (no offers, pantry or people). Throws what the reads throw. */
export async function readApplyFacts(weekStart: string): Promise<{ dishes: WeekDish[]; servingsOf: (recipeId: string) => number | null }> {
  const [rows, dishes] = await Promise.all([listRecipeRows(), getWeekDishes(weekStart)]);
  const byId = new Map(rows.map((row) => [row.id, row.originalServings]));
  return { dishes, servingsOf: (id) => byId.get(id) ?? null };
}
