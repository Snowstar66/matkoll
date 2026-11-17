"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { setRecipeLineIn, type LineChange } from "../data/line";

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
