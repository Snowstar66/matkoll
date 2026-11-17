"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, commitIngredients, matchIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { replaceRecipeLineIn, setRecipeLineIn, type LineChange } from "../data/line";

const lineSchema = z.object({ recipeId: z.uuid(), lineId: z.uuid(), updatedAt: z.iso.datetime({ offset: true }) });
const strikeSchema = lineSchema.extend({ isStruck: z.boolean() });
const amountSchema = lineSchema.extend({ amount: z.number().positive().max(1_000_000) });

async function changeLine(
  input: z.infer<typeof lineSchema>,
  change: LineChange,
): Promise<Result<{ updatedAt: string }>> {
  try {
    const outcome = await setRecipeLineIn(await createClient(), input.recipeId, input.lineId, input.updatedAt, change);
    if (outcome === "conflict") return fail("recipe_conflict");
    if (outcome === "not_found") {
      console.error("recipe_line_failed", { reason: "not_found" });
      return fail("recipe_line_failed");
    }
    revalidateFor("recipe");
    return ok(outcome);
  } catch (error) {
    if (!(error instanceof RecipeDataError)) throw error;
    console.error("recipe_line_failed", { reason: error.detail });
    return fail("recipe_line_failed");
  }
}

/**
 * "Stryk" and "Ta tillbaka" on an ingredient row (Stryk ingrediens): sets the line's strike, so two quick taps end
 * where the last one points. `updatedAt` is SavedRecipe.updatedAt as the page read it; a recipe that has changed
 * since gives `recipe_conflict` and nothing is written. Fails with `unauthorized`, `validation`, `recipe_conflict`
 * or `recipe_line_failed`.
 */
export async function setLineStruck(input: z.infer<typeof strikeSchema>): Promise<Result<{ updatedAt: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = strikeSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  return changeLine(parsed.data, { isStruck: parsed.data.isStruck });
}

/**
 * "Ändra mängd" on an ingredient row: sets the amount of one line, for the recipe's own servings (the caller
 * has divided by the scale factor). A line without an amount keeps none. Same answers as setLineStruck.
 */
export async function setLineAmount(input: z.infer<typeof amountSchema>): Promise<Result<{ updatedAt: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = amountSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  return changeLine(parsed.data, { amount: parsed.data.amount });
}

const replaceSchema = lineSchema.extend({ name: z.string().trim().min(1).max(80).nullable() });

/**
 * "Byt ut" on an ingredient row (Byt ut ingrediens): replaces the line's ingredient with the one called `name` (the
 * catalog's if it has it, else a new one, as when a recipe is saved), keeping the amount and unit; with `name` null
 * ("Ta tillbaka") puts the line back as it was. `updatedAt` and the answers are as for setLineStruck, and a name
 * the catalog cannot make an ingredient of is `validation`.
 */
export async function replaceLineIngredient(input: z.infer<typeof replaceSchema>): Promise<Result<{ updatedAt: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = replaceSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const { recipeId, lineId, updatedAt } = parsed.data;
  try {
    let replacement: { ingredientId: string; text: string } | null = null;
    if (parsed.data.name !== null) {
      const text = parsed.data.name.split(/\s+/).join(" ");
      const [match] = await matchIngredients([{ text }]);
      if (!match || match.kind === "unmatched") return fail("validation");
      const [ingredientId] = await commitIngredients([{ text, ingredient: match }]);
      if (!ingredientId) return fail("validation");
      replacement = { ingredientId, text };
    }
    const outcome = await replaceRecipeLineIn(await createClient(), recipeId, lineId, updatedAt, replacement);
    if (outcome === "conflict") return fail("recipe_conflict");
    if (outcome === "not_found") {
      console.error("recipe_line_failed", { reason: "not_found" });
      return fail("recipe_line_failed");
    }
    revalidateFor("recipe");
    return ok(outcome);
  } catch (error) {
    if (error instanceof CatalogDataError) {
      console.error("recipe_line_failed", { reason: `catalog_${error.code}` });
      return fail("recipe_line_failed");
    }
    if (!(error instanceof RecipeDataError)) throw error;
    console.error("recipe_line_failed", { reason: error.detail });
    return fail("recipe_line_failed");
  }
}
