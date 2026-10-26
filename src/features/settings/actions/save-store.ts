"use server";

import { requireUser } from "@/features/auth/server";
import { errorMessages, fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { SettingsDataError } from "../data/client";
import { saveStoreIn } from "../data/stores";
import { newStoreId, readStoreForm, type Store, storeFieldErrors, storeFormSchema } from "../domain/store";

export type SaveStoreState = Result<{ store: Store }> | null;

/**
 * "Spara" in the sheet Ny butik (mode `add`) or Ändra butik (mode `change`)
 * (FR-28): adds or changes the store with the client's id, and with "Använd
 * för varukorgen", or when no store is selected, makes it the selected one.
 * A new store whose id another user has taken is added once more with a new
 * id. For useActionState, with the fields of storeFormSchema.
 * Fails with `unauthorized`, `validation` (with the messages by field),
 * `settings_duplicate_store` (at `externalStoreId`), `settings_store_gone` or
 * `settings_save_failed`. Logs only the error code and reason, never the
 * store's name, address or URL.
 */
export async function saveStore(_previous: SaveStoreState, formData: FormData): Promise<SaveStoreState> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = storeFormSchema.safeParse(readStoreForm(formData));
  if (!parsed.success) return fail("validation", storeFieldErrors(parsed.error));

  try {
    const db = await createClient();
    let outcome = await saveStoreIn(db, parsed.data);
    if (outcome.kind === "id_taken" && parsed.data.mode === "add") {
      outcome = await saveStoreIn(db, { ...parsed.data, id: newStoreId() });
    }
    if (outcome.kind === "id_taken") {
      console.error("settings_save_failed", { reason: "id_taken" });
      return fail("settings_save_failed");
    }
    if (outcome.kind === "duplicate") {
      return fail("settings_duplicate_store", { externalStoreId: errorMessages.settings_duplicate_store });
    }
    if (outcome.kind === "gone") return fail("settings_store_gone");
    revalidateFor("store");
    return ok({ store: outcome.store });
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_save_failed", { reason: error.detail });
    return fail("settings_save_failed");
  }
}
