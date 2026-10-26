"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { CatalogDataError } from "../data/client";
import { searchCatalog } from "../data/queries";
import { ingredientSearchSchema, searchText, type IngredientSearchHit } from "../domain/search";

/**
 * Searches the signed-in user's catalog by name and synonym while Pontus types
 * (AD-1: a read action, allowed for search*). At most 20 hits, best first.
 * Empty text gives no hits.
 */
export async function searchIngredients(query: string): Promise<Result<IngredientSearchHit[]>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = ingredientSearchSchema.safeParse(query);
  if (!parsed.success) return fail("validation");
  const text = searchText(parsed.data);
  if (!text) return ok([]);
  try {
    return ok(await searchCatalog(await createClient(), text));
  } catch (error) {
    if (!(error instanceof CatalogDataError)) throw error;
    console.error("catalog_unavailable", { reason: error.code });
    return fail("catalog_unavailable");
  }
}
