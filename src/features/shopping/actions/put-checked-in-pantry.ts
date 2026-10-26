"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientDefaults, getIngredientNames } from "@/features/catalog/server";
import { getCurrentPlan, MealPlanDataError } from "@/features/mealplan/server";
import {
  addToPantry,
  findPantryAdditions,
  forgetPantryAdditions,
  getPantrySnapshot,
  PantryDataError,
} from "@/features/pantry/server";
import { getRecipesByIds, RecipeDataError } from "@/features/recipes/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { listCheckRowsIn } from "../data/checks";
import { ShoppingDataError } from "../data/client";
import { listCustomItemsIn } from "../data/custom-items";
import { listOverridesIn } from "../data/overrides";
import { clearPutInPantryIn, putInPantryWith, type PutInPantryOutcome } from "../data/put-in-pantry";

/** What putCheckedInPantry takes: the plan the list was counted for. */
const putInPantrySchema = z.object({ planId: z.uuid() });
export type PutInPantryInput = z.infer<typeof putInPantrySchema>;

/**
 * For the confirmation: the items put in the pantry, the own items without a
 * link taken off the list, and the checked lines that could not go to the
 * pantry (they keep their checks).
 */
export type PutInPantryResult = { added: number; removed: number; skipped: number };

/**
 * "Lägg i lagret" (FR-19, AD-8, AD-19): puts every checked line of the
 * current plan's list in the pantry, at its catalog ingredient's location, and
 * takes it off the list; see putInPantryWith. The list is counted here, never
 * taken from the client. Checked own items linked to a catalog ingredient go
 * to the pantry too; those without a link are only removed. Idempotent rather
 * than atomic (AD-1): trying again after any failure never adds an item twice.
 * Revalidates the pantry's and the list's views, so Hemma, the recipes'
 * status, the meal plan and the list are counted again (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `shopping_plan_changed` (the list
 * must be read again), `shopping_put_in_pantry_plan_changed` (the same, after
 * the pantry was written), `pantry_add_failed` (logged; nothing was added,
 * the checks stay) or `shopping_put_in_pantry_failed` (logged; the pantry was
 * written but the list was not cleared, also on a second try).
 */
export async function putCheckedInPantry(input: PutInPantryInput): Promise<Result<PutInPantryResult>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = putInPantrySchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const { planId } = parsed.data;
  const db = await createClient();

  let outcome: PutInPantryOutcome;
  try {
    outcome = await putInPantryWith(
      {
        sources: {
          currentPlan: getCurrentPlan,
          recipesByIds: getRecipesByIds,
          // Without the pantry, the amounts to buy would be wrong: a failure stops the flow.
          pantry: getPantrySnapshot,
          ingredientNames: getIngredientNames,
          ingredientDefaults: getIngredientDefaults,
          customItems: (id) => listCustomItemsIn(db, id),
          overrides: (id) => listOverridesIn(db, id),
        },
        checkRows: (id) => listCheckRowsIn(db, id),
        findAdditions: findPantryAdditions,
        addToPantry,
        clear: (id, cleared) => clearPutInPantryIn(db, id, cleared),
        forgetAdditions: async (keys) => {
          try {
            await forgetPantryAdditions(keys);
          } catch (error) {
            // Left behind, a receipt is pruned after 30 days.
            if (!(error instanceof PantryDataError)) throw error;
            console.error("pantry_forget_failed", { reason: error.detail });
          }
        },
      },
      planId,
    );
  } catch (error) {
    // Nothing is written before the list and the receipts are read.
    if (
      error instanceof MealPlanDataError ||
      error instanceof RecipeDataError ||
      error instanceof PantryDataError ||
      error instanceof ShoppingDataError
    ) {
      console.error("pantry_add_failed", { reason: `read_${error.detail}` });
    } else if (error instanceof CatalogDataError) {
      console.error("pantry_add_failed", { reason: `read_catalog_${error.code}`, detail: error.detail });
    } else {
      throw error;
    }
    return fail("pantry_add_failed");
  }

  if (outcome.kind !== "pantry_failed" && outcome.pantryWritten) revalidateFor("pantry_item");
  switch (outcome.kind) {
    case "done":
      revalidateFor("shopping_check");
      revalidateFor("shopping_custom_item");
      revalidateFor("shopping_line_override");
      if (outcome.skipped > 0) console.error("shopping_put_in_pantry_skipped", { count: outcome.skipped });
      return ok({ added: outcome.added, removed: outcome.removed, skipped: outcome.skipped });
    case "plan_changed":
      revalidateFor("shopping_check");
      return fail(outcome.pantryWritten ? "shopping_put_in_pantry_plan_changed" : "shopping_plan_changed");
    case "pantry_failed":
      if (outcome.error.code === "unauthorized") return fail("unauthorized");
      // An item the pantry refuses (validation) is logged like any failure there.
      if (outcome.error.code !== "pantry_add_failed") console.error("pantry_add_failed", { reason: outcome.error.code });
      return fail("pantry_add_failed");
    case "clear_failed":
      console.error("shopping_put_in_pantry_failed", { reason: outcome.detail });
      return fail("shopping_put_in_pantry_failed");
  }
}
