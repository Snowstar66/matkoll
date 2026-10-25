import "server-only";
import type { CatalogSnapshot } from "../domain/match";
import { CatalogDataError, chunks, type CatalogDb } from "./client";

/**
 * The catalog rows needed to match `normalizedTexts`: ingredients whose
 * normalised name, and synonyms whose text, is one of them. RLS limits both to
 * the signed-in user's rows. Empty texts never match and are not looked up.
 * Lookups are made in chunks of 100 values.
 */
export async function loadCatalogSnapshot(db: CatalogDb, normalizedTexts: readonly string[]): Promise<CatalogSnapshot> {
  const texts = [...new Set(normalizedTexts.filter(Boolean))];
  const ingredients = new Map<string, string>();
  const synonyms = new Map<string, string>();

  await Promise.all(
    chunks(texts).map(async (chunk) => {
      const [names, aliases] = await Promise.all([
        db.from("ingredient").select("id, normalized_name").in("normalized_name", chunk),
        db.from("ingredient_synonym").select("ingredient_id, normalized").in("normalized", chunk),
      ]);
      if (names.error) throw new CatalogDataError("query_failed", names.error.code);
      if (aliases.error) throw new CatalogDataError("query_failed", aliases.error.code);
      for (const row of names.data) ingredients.set(row.normalized_name, row.id);
      for (const row of aliases.data) synonyms.set(row.normalized, row.ingredient_id);
    }),
  );

  return { ingredients, synonyms };
}

/** The ids among `ids` that are ingredients in the signed-in user's catalog. */
export async function existingIngredientIds(db: CatalogDb, ids: readonly string[]): Promise<Set<string>> {
  const found = new Set<string>();
  await Promise.all(
    chunks([...new Set(ids)]).map(async (chunk) => {
      const { data, error } = await db.from("ingredient").select("id").in("id", chunk);
      if (error) throw new CatalogDataError("query_failed", error.code);
      for (const row of data) found.add(row.id);
    }),
  );
  return found;
}
