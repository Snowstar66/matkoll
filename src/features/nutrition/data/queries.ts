import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { kostradGroupSchema, type IngredientNutrition } from "../domain/groups";

/** What the nutrition functions throw when Supabase fails; `detail` is its error code, never user data. */
export class NutritionDataError extends Error {
  constructor(readonly detail?: string) {
    super(detail ? `nutrition_query_failed: ${detail}` : "nutrition_query_failed");
    this.name = "NutritionDataError";
  }
}

export type NutritionDb = SupabaseClient<Database>;

/** Values per `.in(...)` filter, so a long list never makes an over-long request URL. */
const chunkSize = 100;

type Row = Database["public"]["Tables"]["ingredient_nutrition"]["Row"];

/** One table row as the domain's IngredientNutrition; `null` when the row is outside the domain's lists. */
export function toIngredientNutrition(row: Row): IngredientNutrition | null {
  const group = kostradGroupSchema.safeParse(row.kostrad_group);
  if (!group.success) return null;
  const hasValues = row.kcal !== null && row.protein_g !== null && row.fat_g !== null && row.carbs_g !== null && row.fiber_g !== null;
  return {
    name: row.normalized_name,
    group: group.data,
    lmvNumber: row.lmv_number,
    per100g: hasValues
      ? { kcal: row.kcal!, proteinG: row.protein_g!, fatG: row.fat_g!, carbsG: row.carbs_g!, fiberG: row.fiber_g! }
      : null,
    gramsPerPiece: row.grams_per_piece,
    gramsPerDl: row.grams_per_dl,
  };
}

/**
 * The nutrition rows for `normalizedNames` (catalog.normalizeIngredientText),
 * by name. A name without a row is left out. Lookups are made in chunks of 100.
 * Throws NutritionDataError.
 */
export async function loadNutritionByNames(
  db: NutritionDb,
  normalizedNames: readonly string[],
): Promise<Record<string, IngredientNutrition>> {
  const names = [...new Set(normalizedNames.filter(Boolean))];
  const found: Record<string, IngredientNutrition> = {};
  for (let start = 0; start < names.length; start += chunkSize) {
    const { data, error } = await db
      .from("ingredient_nutrition")
      .select("*")
      .in("normalized_name", names.slice(start, start + chunkSize));
    if (error) throw new NutritionDataError(error.code);
    for (const row of data) {
      const nutrition = toIngredientNutrition(row);
      if (nutrition) found[row.normalized_name] = nutrition;
    }
  }
  return found;
}
