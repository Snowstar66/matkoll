"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { setLineAmountIn } from "../data/overrides";
import { amountLineRefSchema, type LineRef } from "../domain/line-override";

/**
 * "Använd beräknad mängd" in Listpostdetalj (FR-17, AD-8): takes Pontus's
 * corrected amount off the line, so it shows the counted amount again. A
 * hidden line stays hidden. Only on the current plan (AD-22). Idempotent.
 * Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `shopping_plan_changed` (the list
 * must be read again) or `shopping_save_failed` (logged); nothing is changed then.
 */
export async function clearLineAmount(line: LineRef): Promise<Result<LineRef>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = amountLineRefSchema.safeParse(line);
  if (!parsed.success) return fail("validation");
  const { planId, key } = parsed.data;

  try {
    const outcome = await setLineAmountIn(await createClient(), planId, key, null);
    if (outcome === "plan_changed") return fail("shopping_plan_changed");
    revalidateFor("shopping_line_override");
    return ok({ planId, key });
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_save_failed", { reason: error.detail });
    return fail("shopping_save_failed");
  }
}
