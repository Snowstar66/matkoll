"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { nameInSentence } from "@/features/catalog";
import { CatalogDataError, getIngredientNames } from "@/features/catalog/server";
import { getActiveOffers, OffersDataError } from "@/features/offers/server";
import { getPantryForStatus } from "@/features/pantry/server";
import { listRecipeRows, RecipeDataError } from "@/features/recipes/server";
import { getSelectedStore, listStores, SettingsDataError } from "@/features/settings/server";
import { fail, ok, type Result } from "@/lib/errors";
import { rankOwnRecipes, type OwnRecipeMatch } from "../domain/own-recipes";

// "Från dina recept" (Story 16.3): the signed-in user's own recipes that use
// this week's offers of a store, ranked without AI (rankOwnRecipes). A read:
// it writes nothing and never calls the model, so it answers at once, also
// while the AI job for the same store is still running.

const storeIdSchema = z.uuid().optional();

/**
 * At most five of the user's recipes that use offers of the store `storeId`
 * (else the selected store), favourites first among equals. No store, no
 * offers or no matching recipe is an empty list, not an error; `unauthorized`
 * without a session and `offers_unavailable` when a read fails (only the
 * error's name is logged).
 */
export async function ownRecipesWithOffers(storeId?: string): Promise<Result<OwnRecipeMatch[]>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = storeIdSchema.safeParse(storeId);
  if (!parsed.success) return fail("validation");
  try {
    const store = parsed.data
      ? ((await listStores()).find((candidate) => candidate.id === parsed.data) ?? null)
      : await getSelectedStore();
    if (!store) return ok([]);
    const [offers, rows, { snapshot }] = await Promise.all([getActiveOffers(store.id), listRecipeRows(), getPantryForStatus()]);
    if (offers.length === 0 || rows.length === 0) return ok([]);
    const ids = [...new Set(rows.flatMap((row) => row.lines.flatMap((line) => (line.ingredientId ? [line.ingredientId] : []))))];
    const names = ids.length > 0 ? await getIngredientNames(ids) : {};
    const lineName = (line: { ingredientId: string | null; originalText: string }) => {
      const catalogName = line.ingredientId ? names[line.ingredientId] : undefined;
      return catalogName ? nameInSentence(catalogName.trim()) : line.originalText.trim();
    };
    return ok(
      rankOwnRecipes(
        offers,
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          isFavorite: row.isFavorite,
          imageUrl: row.imageUrl,
          totalMinutes: row.totalMinutes,
          servings: row.originalServings,
          lines: row.lines.map((line) => ({
            name: lineName(line),
            ingredientId: line.ingredientId,
            atHome: line.ingredientId !== null && (snapshot?.has(line.ingredientId) ?? false),
          })),
        })),
      ),
    );
  } catch (error) {
    if (
      !(
        error instanceof SettingsDataError ||
        error instanceof OffersDataError ||
        error instanceof RecipeDataError ||
        error instanceof CatalogDataError
      )
    )
      throw error;
    console.error("own_recipes_unavailable", { reason: error.name });
    return fail("offers_unavailable");
  }
}
