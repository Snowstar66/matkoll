import "server-only";
import { nameInSentence } from "@/features/catalog";
import { getIngredientNames } from "@/features/catalog/server";
import { getActiveOffers } from "@/features/offers/server";
import { getCookedCounts, MealPlanDataError } from "@/features/mealplan/server";
import { getPantryForStatus } from "@/features/pantry/server";
import { listRecipeRows } from "@/features/recipes/server";
import { listStores } from "@/features/settings/server";
import { planOptions, type PlanOption } from "../domain/plan-options";

/**
 * Story 25.3, "Lägg till rätter" on Matsedel: one row per recipe of the
 * library, with its cook count, what is left to buy once what is at home and
 * the household's Basvaror are taken off, and the offers of all the user's
 * stores it uses on a main ingredient with the saving. A read, counted
 * without AI: the pantry never ranks. Throws what the reads throw (recipes,
 * offers, settings, catalog, pantry, meal plan); a cook count that cannot be
 * read is left out.
 */
export async function weekPlanOptions(): Promise<PlanOption[]> {
  const [stores, rows, { snapshot, staples }, cooked] = await Promise.all([
    listStores(),
    listRecipeRows(),
    getPantryForStatus(),
    getCookedCounts().catch((error: unknown) => {
      if (!(error instanceof MealPlanDataError)) throw error;
      console.error("mealplan_cooked_counts_unavailable", { reason: error.detail });
      return {};
    }),
  ]);
  if (rows.length === 0) return [];
  const offers = (await Promise.all(stores.map((store) => getActiveOffers(store.id)))).flat();
  const ids = [...new Set(rows.flatMap((row) => row.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : []))))];
  const names = ids.length > 0 ? await getIngredientNames(ids) : {};
  return planOptions(
    offers,
    rows.map((row) => ({
      id: row.id,
      title: row.title,
      isFavorite: row.isFavorite,
      imageUrl: row.imageUrl,
      totalMinutes: row.totalMinutes,
      servings: row.originalServings,
      lines: row.lines.map((line) => {
        const catalogName = line.ingredientId ? names[line.ingredientId] : undefined;
        return {
          name: catalogName ? nameInSentence(catalogName.trim()) : line.originalText.trim(),
          ingredientId: line.ingredientId,
          atHome: line.ingredientId !== null && (snapshot?.has(line.ingredientId) ?? false),
          amount: line.amount,
          unit: line.unit,
        };
      }),
    })),
    cooked,
    staples,
  );
}
