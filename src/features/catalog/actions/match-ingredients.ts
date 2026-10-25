import "server-only";
import type { CatalogDb } from "../data/client";
import { loadCatalogSnapshot } from "../data/queries";
import { lookupKeys, matchAgainst, type IngredientMatch, type MatchItem } from "../domain/match";

/**
 * Matches each item against the catalog without writing (AD-6): the text, then
 * the hint's name, against names and synonyms; otherwise a proposal from the
 * hint, or "unmatched".
 */
export async function matchIngredientsIn(db: CatalogDb, items: readonly MatchItem[]): Promise<IngredientMatch[]> {
  const snapshot = await loadCatalogSnapshot(db, lookupKeys(items));
  return matchAgainst(items, snapshot);
}
