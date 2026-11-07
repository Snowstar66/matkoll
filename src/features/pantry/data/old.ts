import "server-only";
import type { IngredientSummary } from "@/features/catalog";
import { locationSchema } from "@/features/catalog";
import type { PantryItem } from "../domain/pantry-item";
import { PantryDataError, type PantryDb } from "./client";
import { pantryPageSize } from "./queries";

// "Ät snart" for the whole household (the daily push): the fridge and freezer
// rows of every place, with the catalog's names and shelf life, the little the
// old-item rule reads. Not summed or shown anywhere: only the set of due items
// leaves this file (old-items.ts). Needs the signed-in member's session client;
// RLS limits the rows to their household.

/** What the old-item rule reads of a row. */
export type OldCandidate = Pick<PantryItem, "ingredientId" | "name" | "location" | "createdAt" | "keepsDays">;

/** The household's Kyl and Frys rows over all places. Throws PantryDataError. */
export async function listOldCandidatesIn(
  db: PantryDb,
  ingredientSummaries: (ids: readonly string[]) => Promise<Record<string, IngredientSummary>>,
): Promise<OldCandidate[]> {
  const rows: { ingredient_id: string; location: string; created_at: string }[] = [];
  for (let from = 0; ; from += pantryPageSize) {
    const { data, error } = await db
      .from("pantry_item")
      .select("ingredient_id, location, created_at")
      .in("location", ["Kyl", "Frys"])
      .order("id")
      .range(from, from + pantryPageSize - 1);
    if (error) throw new PantryDataError(`query_failed ${error.code}`);
    rows.push(...data);
    if (data.length < pantryPageSize) break;
  }
  const ids = [...new Set(rows.map((row) => row.ingredient_id))];
  const summaries = ids.length > 0 ? await ingredientSummaries(ids) : {};
  return rows.flatMap((row) => {
    const summary = summaries[row.ingredient_id];
    const location = locationSchema.safeParse(row.location);
    if (!summary || !location.success) return [];
    return [
      {
        ingredientId: row.ingredient_id,
        name: summary.name,
        location: location.data,
        createdAt: row.created_at,
        keepsDays: summary.keepsDays ?? null,
      },
    ];
  });
}
