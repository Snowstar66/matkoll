"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { ShoppingDataError } from "../data/client";
import { addCustomItemIn } from "../data/custom-items";
import { collapseLabel } from "../domain/custom-item";
import { keyedItemId } from "../data/keyed-item-id";
import { keyedItemsSchema, type KeyedItemsInput } from "../domain/keyed-item";

/**
 * "Lägg N i inköpslistan" in Veckans erbjudanden (Story 9.12, FR-17): adds
 * own items to the list (they belong to the household, Story 17.10), one per `key` (the offer's id). The
 * item's id is made from the key, so adding the same offer again, or a retry
 * after a lost answer, leaves one item (addCustomItemIn returns the one
 * there). The text is the caller's; `ingredientId` links a catalog
 * ingredient, as in Lägg till egen vara. The page passes this action to the
 * offers sheet (AD-1). Revalidates the list (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `shopping_plan_changed` or
 * `shopping_save_failed` (logged). Items before a failure stay added, and
 * trying again adds the rest.
 */
export async function addKeyedItems(input: KeyedItemsInput): Promise<Result<{ count: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = keyedItemsSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const { items } = parsed.data;
  const db = await createClient();
  try {
    for (const item of items) {
      const added = await addCustomItemIn(db, {
        id: keyedItemId(item.key),
        planId: null,
        label: collapseLabel(item.label),
        ingredientId: item.ingredientId,
        amount: null,
        unit: null,
      });
      if (added === "plan_changed") return fail("shopping_plan_changed");
    }
    return ok({ count: items.length });
  } catch (error) {
    if (!(error instanceof ShoppingDataError)) throw error;
    console.error("shopping_save_failed", { reason: error.detail });
    return fail("shopping_save_failed");
  } finally {
    revalidateFor("shopping_custom_item");
  }
}
