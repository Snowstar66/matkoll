"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { hideLineIn } from "../data/overrides";
import { lineRefSchema, type HiddenLine, type LineRef } from "../domain/line-override";

/**
 * "Ta bort" on a recipe line, by swipe or in Listpostdetalj (FR-17, AD-8,
 * AD-20): hides the line, without asking first, as long as it keeps its key;
 * a corrected amount stays. Returns the line's override as it was before
 * (`previous`, `null` when it had none; a line hidden already gives its row
 * as not hidden) and the hidden row's updated_at, so "Ångra" can put that
 * back with restoreLine. Idempotent, so a retry after a lost answer is safe.
 * Returns `null` when the line is hidden but the row before cannot be read:
 * it cannot be undone. Only on the current plan (AD-22). Revalidates the
 * list (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `shopping_plan_changed` (nothing
 * is hidden; the list must be read again) or `shopping_remove_failed`
 * (logged); the list is revalidated then too, so it catches up.
 */
export async function hideLine(line: LineRef): Promise<Result<HiddenLine | null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = lineRefSchema.safeParse(line);
  if (!parsed.success) return fail("validation");
  const { planId, key } = parsed.data;

  try {
    const hidden = await hideLineIn(await createClient(), planId, key);
    if (hidden === "plan_changed") return fail("shopping_plan_changed");
    revalidateFor("shopping_line_override");
    if (hidden === "unrestorable") {
      console.error("shopping_hide_unrestorable", { reason: "invalid_line_override" });
      return ok(null);
    }
    return ok(hidden);
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_remove_failed", { reason: error.detail });
    revalidateFor("shopping_line_override");
    return fail("shopping_remove_failed");
  }
}
