"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { SettingsDataError } from "../data/client";
import { selectStoreIn } from "../data/stores";

const selectSchema = z.object({ id: z.guid() });

/**
 * "Välj" under Andra butiker (FR-28): makes the store the selected one at
 * once, and deselects the others. Fails with `unauthorized`, `validation`,
 * `settings_store_gone` (not one of the user's stores) or
 * `settings_save_failed` (also when two selections met).
 */
export async function selectStore(input: { id: string }): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = selectSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const { id } = parsed.data;

  try {
    const outcome = await selectStoreIn(await createClient(), id);
    if (outcome === "gone") return fail("settings_store_gone");
    revalidateFor("store");
    return ok({ id });
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_save_failed", { reason: error.detail });
    return fail("settings_save_failed");
  }
}
