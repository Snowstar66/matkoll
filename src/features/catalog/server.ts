import "server-only";
import { createClient } from "@/lib/supabase/server";
import { matchIngredientsIn } from "./actions/match-ingredients";
import { commitIngredients as commitIngredientsIn } from "./data/commit";
import type { IngredientChoice, IngredientMatch, MatchItem } from "./domain/match";

// Server-only entry (AD-1). Both functions use the signed-in user's session
// client, so RLS limits them to the user's catalog. They are not Server Actions:
// the actions that call them check the user first (AD-2).

/** Matches recipe or pantry lines against the catalog. Never writes (AD-6). */
export async function matchIngredients(items: readonly MatchItem[]): Promise<IngredientMatch[]> {
  return matchIngredientsIn(await createClient(), items);
}

/**
 * Creates new ingredients and saves corrected matches as synonyms. Only for
 * saving actions (saveRecipe, updateRecipe, the pantry's confirmations).
 * Returns the ingredient id for each choice, in order (`null` for "unmatched").
 */
export async function commitIngredients(choices: readonly IngredientChoice[]): Promise<(string | null)[]> {
  return commitIngredientsIn(await createClient(), choices);
}
