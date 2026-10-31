"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { locationSchema, unitSchema } from "@/features/catalog";
import { isPantrySiteGone, movePantryAmount, PantryDataError } from "@/features/pantry/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";

const moveSchema = z
  .object({
    siteId: z.uuid(),
    ingredientId: z.uuid(),
    amount: z.number().positive().nullable(),
    unit: unitSchema.nullable(),
    from: locationSchema,
    to: locationSchema,
  })
  .refine((input) => (input.amount === null) === (input.unit === null), { path: ["unit"] });
export type MoveUnpackedItemInput = z.input<typeof moveSchema>;

/**
 * "Packa upp kassarna" (Story 16.18): one tap on a place moves an item that
 * "Lägg till i Matvaror" just put in the pantry from `from` to `to` on the
 * place `siteId`. Only the bought amount moves; what was at home stays (see
 * movePantryAmount). Revalidates the pantry's views (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `pantry_site_gone` (the page is
 * read again) or `pantry_move_failed` (logged; also when the item is not in
 * `from` any more, e.g. removed on another device; the sheet puts it back
 * where it was shown).
 */
export async function moveUnpackedItem(input: MoveUnpackedItemInput): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const { siteId, from, to, ...item } = parsed.data;
  try {
    const moved = await movePantryAmount(user.data.id, siteId, item, from, to);
    revalidateFor("pantry_item");
    if (!moved) {
      console.error("pantry_move_failed", { reason: "not_found" });
      return fail("pantry_move_failed");
    }
    return ok(null);
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    if (isPantrySiteGone(error)) {
      console.error("pantry_site_gone", { reason: "move" });
      return fail("pantry_site_gone");
    }
    console.error("pantry_move_failed", { reason: error.detail });
    return fail("pantry_move_failed");
  }
}
