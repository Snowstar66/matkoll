"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { MealPlanDataError } from "../data/client";
import { unmarkDishCookedIn } from "../data/write";

const idSchema = z.uuid();

/**
 * Takes the "lagad" mark off a dish (Story 13.4). The pantry is not changed:
 * what was deducted stays deducted. The dish counts in the shopping list
 * again. Fails with `unauthorized`, `validation` or `mealplan_uncook_failed`.
 */
export async function unmarkDishCooked(id: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return fail("validation");

  try {
    const done = await unmarkDishCookedIn(await createClient(), user.data.id, parsed.data);
    revalidateFor("meal_plan_recipe");
    if (!done) return fail("mealplan_uncook_failed");
    return ok(null);
  } catch (error) {
    if (!(error instanceof MealPlanDataError)) throw error;
    console.error("mealplan_uncook_failed", { reason: error.detail });
    return fail("mealplan_uncook_failed");
  }
}
