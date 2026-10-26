"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { showLineIn } from "../data/overrides";
import { lineRefSchema, type LineRef } from "../domain/line-override";

/**
 * "Visa igen" in Dolda varor (FR-17, Story 3.6): shows a hidden recipe line
 * on the list again, keeping its corrected amount. Only on the current plan
 * (AD-22). Idempotent. Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `shopping_plan_changed` (the list
 * must be read again) or `shopping_save_failed` (logged); nothing is changed then.
 */
export async function showLine(line: LineRef): Promise<Result<LineRef>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = lineRefSchema.safeParse(line);
  if (!parsed.success) return fail("validation");
  const { planId, key } = parsed.data;

  try {
    const outcome = await showLineIn(await createClient(), planId, key);
    if (outcome === "plan_changed") return fail("shopping_plan_changed");
    revalidateFor("shopping_line_override");
    return ok({ planId, key });
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_save_failed", { reason: error.detail });
    return fail("shopping_save_failed");
  }
}
