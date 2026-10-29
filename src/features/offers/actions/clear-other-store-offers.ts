"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { clearOtherStoreOffersIn } from "../data/save";

// Story 16.8: after Pontus has fetched a selection of stores, the other
// stores' offers go, so the list shows only what he asked for. The sheet
// calls it only when at least one selected fetch succeeded.

const inputSchema = z.object({ keep: z.array(z.guid()).min(1).max(50) });

/** Deletes the offers of every store of the user's that is not in `keep`. Gives the number removed, or `unauthorized`, `validation` or `offers_failed`. */
export async function clearOtherStoreOffers(input: { keep: string[] }): Promise<Result<{ removed: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const removed = await clearOtherStoreOffersIn(await createClient(), parsed.data.keep);
  if (!removed.ok) return removed;
  if (removed.data > 0) revalidateFor("store_offer");
  return ok({ removed: removed.data });
}
