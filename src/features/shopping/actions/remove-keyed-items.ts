"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { removeCustomItemIn } from "../data/custom-items";
import { keyedItemId } from "../data/keyed-item-id";
import { maxKeyedItems } from "../domain/keyed-item";

const keysSchema = z.object({ keys: z.array(z.string().min(1).max(100)).min(1).max(maxKeyedItems) });

/**
 * "Ångra" after "Köp det som saknas" in the recipe (Story 25.1): removes the
 * own items addKeyedItems added for `keys`. The id is made from the key, so the
 * same keys always find the same items. An item that is gone already is not an
 * error (the undo is idempotent). Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation` or `shopping_remove_failed` (logged).
 */
export async function removeKeyedItems(input: { keys: readonly string[] }): Promise<Result<{ removed: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = keysSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const db = await createClient();
  let removed = 0;
  try {
    for (const key of new Set(parsed.data.keys)) {
      if (await removeCustomItemIn(db, keyedItemId(key))) removed += 1;
    }
    return ok({ removed });
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_remove_failed", { reason: error.detail });
    return fail("shopping_remove_failed");
  } finally {
    revalidateFor("shopping_custom_item");
  }
}
