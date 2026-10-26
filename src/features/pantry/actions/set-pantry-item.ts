"use server";

import { requireUser } from "@/features/auth/server";
import { CatalogDataError, commitIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { isSiteGone, PantryDataError, siteGoneCode } from "../data/client";
import { setPantryItemsIn } from "../data/set";
import { formFieldErrors, pantryItemFormSchema, type PantryItemFormInput } from "../domain/pantry-item-form";

/**
 * "Lägg till vara" and "Spara ändringar" in the sheet Lagervara (FR-11,
 * AD-19): sets the item's amount exactly for its ingredient, location and
 * unit, creating the row when needed; without an amount the item is
 * unlimited. Validated with the form's own schema. A new catalog ingredient
 * is created here, through the catalog (AD-6), and only then is the item set;
 * the catalog and the pantry are separate modules (AD-1), so a failed set
 * leaves the new ingredient in the catalog. Saving again is safe: the
 * catalog returns the id of an ingredient with the same normalised name
 * instead of creating another (commit_ingredients' on conflict). `replaceId` is the row being
 * edited: a changed location, unit or ingredient moves it, all or nothing.
 * `siteId` is the place the sheet was opened for (FR-33, AD-24): the item is
 * saved there, also when another place has been selected since. The label
 * (Story 11.2, FR-42) is the field "Märke eller sort": a text sets it, an
 * empty field removes it. A moved row keeps the time it was added
 * (set_pantry_items). Revalidates Hemma and the recipes (AD-18).
 *
 * Returns the id of the row set. Fails with `unauthorized`, `validation`
 * (the form's message in `fields.amount`, `fields.label` or `fields.ingredient`),
 * `pantry_site_gone` (the place was deleted: the item is not set, though a
 * new catalog ingredient created first stays in the catalog, and the page is
 * read again) or `pantry_save_failed`.
 */
export async function savePantryItem(form: PantryItemFormInput): Promise<Result<{ id: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = pantryItemFormSchema.safeParse(form);
  if (!parsed.success) {
    const fields = formFieldErrors(parsed.error);
    return Object.keys(fields).length > 0 ? fail("validation", fields) : fail("validation");
  }
  const { ingredient, location, amount, unit, siteId, replaceId } = parsed.data;
  // Story 11.2: the field "Märke eller sort"; a client without it keeps the label.
  const label = "label" in parsed.data ? parsed.data.label : undefined;

  let ingredientId: string;
  if (ingredient.kind === "new") {
    try {
      const [id] = await commitIngredients([
        {
          text: ingredient.name,
          ingredient: {
            kind: "new",
            proposal: {
              name: ingredient.name,
              section: ingredient.section,
              location: ingredient.location,
              defaultUnit: ingredient.defaultUnit,
            },
          },
        },
      ]);
      if (!id) throw new CatalogDataError("query_failed", "missing_id");
      ingredientId = id;
    } catch (error) {
      if (!(error instanceof CatalogDataError)) throw error;
      console.error("pantry_save_failed", { reason: `catalog_${error.code}`, detail: error.detail });
      return fail("pantry_save_failed");
    }
  } else {
    ingredientId = ingredient.ingredientId;
  }

  try {
    const [row] = await setPantryItemsIn(
      await createClient(),
      [{ ingredientId, location, amount, unit, ...(label === undefined ? {} : { label }) }],
      replaceId,
      siteId,
    );
    if (!row) throw new PantryDataError("no_row");
    revalidateFor("pantry_item");
    return ok({ id: row.id });
  } catch (error) {
    if (!(error instanceof PantryDataError)) throw error;
    if (isSiteGone(error)) {
      console.error("pantry_site_gone", { reason: siteGoneCode });
      revalidateFor("pantry_site");
      return fail("pantry_site_gone");
    }
    console.error("pantry_save_failed", { reason: error.detail });
    return fail("pantry_save_failed");
  }
}
