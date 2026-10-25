import "server-only";
import { unitSchema } from "@/features/catalog";
import { sourceKindSchema } from "../domain/recipe-draft";
import type { SavedRecipe } from "../domain/saved-recipe";
import { RecipeDataError, type RecipesDb } from "./client";

/**
 * The catalog's names for ingredient ids. Passed in, because only the catalog
 * reads its tables (AD-1): in requests, catalog.getIngredientNames.
 */
export type IngredientNames = (ids: readonly string[]) => Promise<Record<string, string>>;

/**
 * The recipe with its steps and lines in order, and the names of the lines'
 * catalog ingredients; `null` when the signed-in user has no recipe with that
 * id (RLS hides other users' recipes). `id` must be a uuid. Throws
 * RecipeDataError when a query fails.
 */
export async function getRecipe(
  db: RecipesDb,
  id: string,
  ingredientNames: IngredientNames,
): Promise<SavedRecipe | null> {
  const [recipe, steps, lines] = await Promise.all([
    db
      .from("recipe")
      .select("id, title, original_servings, total_minutes, image_url, source_kind, source_url, is_favorite")
      .eq("id", id)
      .maybeSingle(),
    db.from("recipe_step").select("id, position, text").eq("recipe_id", id).order("position"),
    db
      .from("recipe_ingredient")
      .select("id, position, original_text, amount, unit, is_vague, ingredient_id, step_id")
      .eq("recipe_id", id)
      .order("position"),
  ]);
  if (recipe.error) throw new RecipeDataError(`query_failed ${recipe.error.code}`);
  if (steps.error) throw new RecipeDataError(`query_failed ${steps.error.code}`);
  if (lines.error) throw new RecipeDataError(`query_failed ${lines.error.code}`);
  if (!recipe.data) return null;

  const ingredientIds = lines.data.flatMap((line) => (line.ingredient_id ? [line.ingredient_id] : []));
  const names = ingredientIds.length > 0 ? await ingredientNames(ingredientIds) : {};

  const row = recipe.data;
  // The database's check lists equal the domain's (tests/design/recipe-checks.test.ts).
  const sourceKind = sourceKindSchema.safeParse(row.source_kind);
  if (!sourceKind.success) throw new RecipeDataError("invalid_row");
  const units = lines.data.map((line) => unitSchema.nullable().safeParse(line.unit));
  if (units.some((unit) => !unit.success)) throw new RecipeDataError("invalid_row");

  return {
    id: row.id,
    title: row.title,
    servings: row.original_servings,
    totalMinutes: row.total_minutes,
    imageUrl: row.image_url,
    sourceKind: sourceKind.data,
    sourceUrl: row.source_url,
    isFavorite: row.is_favorite,
    steps: steps.data,
    lines: lines.data.map((line, index) => ({
      id: line.id,
      position: line.position,
      originalText: line.original_text,
      amount: line.amount,
      unit: units[index].data ?? null,
      isVague: line.is_vague,
      ingredientId: line.ingredient_id,
      ingredientName: line.ingredient_id ? (names[line.ingredient_id] ?? null) : null,
      stepId: line.step_id,
    })),
  };
}
