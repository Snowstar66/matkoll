"use server";

import { requireUser } from "@/features/auth/server";
import { CatalogDataError } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { isSiteGone, PantryDataError, siteGoneCode } from "../data/client";
import { setPantryItemsIn } from "../data/set";
import type { PantryItemSet } from "../domain/pantry-item-form";
import {
  confirmSuggestionsSchema,
  suggestionInvalidText,
  type ConfirmSuggestionsInput,
} from "../domain/pantry-suggestion";
import { commitConfirmations } from "./commit-confirmations";

/**
 * Bekräfta, "Bekräfta alla" and the sheet's "Bekräfta" for lagerförslag
 * (FR-25, AD-2, AD-6, AD-19): the confirmed suggestions, and only those,
 * become pantry items. Nothing from the client is trusted: the items are
 * validated, merged (mergeConfirmations), and their ingredients committed
 * through the catalog, where a new one is created only now and an existing
 * id is passed as an exact match, so commitIngredients checks it is in the
 * user's catalog (`unknown_ingredient`) and saves no synonym. The items are
 * merged again on the ids the catalog gave, since a new name can turn out to
 * be an ingredient already in the list. Then each item's amount is set
 * exactly for its ingredient, place and unit, all or nothing
 * (set_pantry_items). The catalog and the pantry are separate
 * modules (AD-1), so new ingredients stay after a failed set, and trying
 * again uses them (commit_ingredients' on conflict). No AI is asked.
 * Revalidates Hemma and the recipes (AD-18) after a successful set only.
 *
 * Story 8.4 (FR-33, AD-24): everything is set on the photo's place
 * (`siteId`, sent as `site`), never on the one selected when the call
 * arrives; `null` is the selected place, only for a photo of a user without
 * places.
 *
 * Returns the number of rows set. Fails with `unauthorized`, `validation`
 * (with the index of each item that is not valid in `fields`, so the client
 * can leave it out), `pantry_site_gone` (the place is removed or not the
 * user's: nothing is set, and the page is read again) or
 * `pantry_confirm_failed` (logged with its reason, never with names or
 * amounts).
 */
export async function confirmPantrySuggestions(input: ConfirmSuggestionsInput): Promise<Result<{ count: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = confirmSuggestionsSchema.safeParse(input);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const [field, index] = issue.path;
      if (field === "items" && typeof index === "number") fields[String(index)] = suggestionInvalidText;
    }
    return Object.keys(fields).length > 0 ? fail("validation", fields) : fail("validation");
  }
  const { siteId, items } = parsed.data;
  let sets: PantryItemSet[];
  try {
    sets = await commitConfirmations(items);
  } catch (error) {
    if (!(error instanceof CatalogDataError)) throw error;
    console.error("pantry_confirm_failed", { reason: `catalog_${error.code}`, detail: error.detail });
    return fail("pantry_confirm_failed");
  }

  try {
    const rows = await setPantryItemsIn(await createClient(), sets, null, siteId);
    if (rows.length !== sets.length) throw new PantryDataError("missing_rows");
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    if (isSiteGone(error)) {
      // Nothing was set; new catalog ingredients may stay, as after any failed set.
      console.error("pantry_site_gone", { reason: siteGoneCode });
      revalidateFor("pantry_site");
      return fail("pantry_site_gone");
    }
    console.error("pantry_confirm_failed", { reason: error.message, detail: error.detail });
    return fail("pantry_confirm_failed");
  }
  revalidateFor("pantry_item");
  return ok({ count: sets.length });
}
