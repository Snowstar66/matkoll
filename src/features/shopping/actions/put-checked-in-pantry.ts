"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, getIngredientDefaults, getIngredientNames } from "@/features/catalog/server";
import { getCurrentPlan, getPlan, MealPlanDataError } from "@/features/mealplan/server";
import { shownSiteName } from "@/features/pantry";
import {
  addToPantry,
  findPantryAdditions,
  forgetPantryAdditions,
  getPantrySnapshot,
  getSelectedSite,
  isPantrySiteGone,
  listPantrySites,
  PantryDataError,
} from "@/features/pantry/server";
import { getRecipesByIds, RecipeDataError } from "@/features/recipes/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { listCheckRowsIn } from "../data/checks";
import type { PlacedItem } from "../domain/put-in-pantry";
import { ShoppingDataError } from "../data/client";
import { listCustomItemsIn } from "../data/custom-items";
import { listOverridesIn } from "../data/overrides";
import { clearPutInPantryIn, putInPantryWith, type PutInPantryOutcome } from "../data/put-in-pantry";

/**
 * What putCheckedInPantry takes: the plan the list was counted for, and the
 * place it was counted against (getShoppingList's `site.id`), or `null` when
 * the list had none: then the place selected when the action starts. A
 * client from the build before Story 8.3 sends no `siteId`, which is the same.
 */
const putInPantrySchema = z.object({ planId: z.uuid(), siteId: z.uuid().nullish() });
export type PutInPantryInput = z.input<typeof putInPantrySchema>;

/**
 * For the confirmation: the items put in the pantry, the own items without a
 * link taken off the list, and the checked lines that could not go to the
 * pantry (they keep their checks). `siteName` is the place's name, read after
 * the write, when the user has more than one place ("Lagt 8 varor i Matvaror
 * för Stugan."); `null` with one place, or when it could not be read.
 */
export type PutInPantryResult = {
  added: number;
  removed: number;
  skipped: number;
  siteName: string | null;
  /** Story 16.18: the items put in the pantry with the place each went to, and the place (`null` when it could not be told). */
  placed?: PlacedItem[];
  siteId?: string | null;
};

/**
 * "Lägg till i Matvaror" (FR-19, FR-33, AD-8, AD-19): puts every checked line of the
 * current plan's list in the pantry of the place `siteId`, at its catalog
 * ingredient's location, and takes it off the list; see putInPantryWith. The
 * list is counted here against that place's pantry, never taken from the
 * client, and never against a place selected meanwhile on another device:
 * what goes to the pantry is what Pontus saw. Without `siteId`, the selected
 * place is read once at the start, and the list is counted against it and
 * the items go to it, so the write and the confirmation's place always
 * agree. A place removed meanwhile gives `pantry_site_gone`, with nothing
 * written and the checks kept; its `fields.site` names the place selected now,
 * which the list is counted against when read again (none with one place,
 * or when it cannot be read). The receipts
 * are per user and not per place, so a second run, also with another place,
 * never adds an item twice. Checked own items linked to a catalog ingredient go
 * to the pantry too; those without a link are only removed. Idempotent rather
 * than atomic (AD-1): trying again after any failure never adds an item twice.
 * Revalidates the pantry's and the list's views, so Hemma, the recipes'
 * status, the meal plan and the list are counted again (AD-18).
 *
 * Fails with `unauthorized`, `validation`, `shopping_plan_changed` (the list
 * must be read again), `shopping_put_in_pantry_plan_changed` (the same, after
 * the pantry was written), `pantry_add_failed` (logged; nothing was added,
 * the checks stay), `pantry_site_gone` (logged by the pantry; nothing was
 * added, the checks stay, the list must be read again) or
 * `shopping_put_in_pantry_failed` (logged; the pantry was written but the
 * list was not cleared, also on a second try).
 */
export async function putCheckedInPantry(input: PutInPantryInput): Promise<Result<PutInPantryResult>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = putInPantrySchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  const { planId } = parsed.data;
  let siteId = parsed.data.siteId ?? null;
  const db = await createClient();

  let outcome: PutInPantryOutcome;
  try {
    // One place for the whole run: the list's, or the one selected now, read once.
    if (siteId === null) siteId = (await getSelectedSite())?.id ?? null;
    const place = siteId;
    outcome = await putInPantryWith(
      {
        sources: {
          // This week's plan, or the plan the list was counted for when it is a coming week's (Story 13.7).
          currentPlan: async () => {
            const current = await getCurrentPlan();
            if (current?.id === planId) return current;
            const planned = await getPlan(planId);
            return planned?.isCurrent ? planned : null;
          },
          recipesByIds: getRecipesByIds,
          // Without the pantry, the amounts to buy would be wrong: a failure
          // stops the flow. A user without places has an empty pantry.
          pantry: () => getPantrySnapshot(place ?? undefined),
          ingredientNames: getIngredientNames,
          ingredientDefaults: getIngredientDefaults,
          customItems: () => listCustomItemsIn(db),
          overrides: (id) => listOverridesIn(db, id),
        },
        checkRows: (id) => listCheckRowsIn(db, id),
        findAdditions: findPantryAdditions,
        addToPantry: (items) => addToPantry(items, place),
        clear: (id, cleared) => clearPutInPantryIn(db, id, cleared),
        forgetAdditions: async (keys) => {
          try {
            await forgetPantryAdditions(keys);
          } catch (error) {
            // Left behind, a receipt is pruned after 30 days.
            if (!(error instanceof PantryDataError)) throw error;
            console.error("pantry_forget_failed", { reason: error.detail });
          }
        },
      },
      planId,
    );
  } catch (error) {
    // Nothing is written before the list and the receipts are read.
    if (isPantrySiteGone(error)) {
      console.error("pantry_site_gone", { reason: "read" });
      return siteGone();
    }
    if (
      error instanceof MealPlanDataError ||
      error instanceof RecipeDataError ||
      error instanceof PantryDataError ||
      error instanceof ShoppingDataError
    ) {
      console.error("pantry_add_failed", { reason: `read_${error.detail}` });
    } else if (error instanceof CatalogDataError) {
      console.error("pantry_add_failed", { reason: `read_catalog_${error.code}`, detail: error.detail });
    } else {
      throw error;
    }
    return fail("pantry_add_failed");
  }

  if (outcome.kind !== "pantry_failed" && outcome.pantryWritten) revalidateFor("pantry_item");
  switch (outcome.kind) {
    case "done":
      revalidateFor("shopping_check");
      revalidateFor("shopping_custom_item");
      revalidateFor("shopping_line_override");
      if (outcome.skipped > 0) console.error("shopping_put_in_pantry_skipped", { count: outcome.skipped });
      return ok({
        added: outcome.added,
        removed: outcome.removed,
        skipped: outcome.skipped,
        // Only when the pantry took something in this run: a run whose items
        // were all skipped for their receipts names no place.
        siteName: outcome.handled > 0 ? await siteNameOrNull(siteId) : null,
        placed: outcome.handled > 0 ? outcome.placed : [],
        siteId,
      });
    case "plan_changed":
      revalidateFor("shopping_check");
      return fail(outcome.pantryWritten ? "shopping_put_in_pantry_plan_changed" : "shopping_plan_changed");
    case "pantry_failed":
      if (outcome.error.code === "unauthorized") return fail("unauthorized");
      // Logged by the pantry with its code; the list is read again.
      if (outcome.error.code === "pantry_site_gone") return siteGone();
      // An item the pantry refuses (validation) is logged like any failure there.
      if (outcome.error.code !== "pantry_add_failed") console.error("pantry_add_failed", { reason: outcome.error.code });
      return fail("pantry_add_failed");
    case "clear_failed":
      console.error("shopping_put_in_pantry_failed", { reason: outcome.detail });
      return fail("shopping_put_in_pantry_failed");
  }
}

/**
 * The name of the place `siteId` (or the selected place, for a user who had
 * none when the run started), as it is after the write, when the user has
 * more than one place; `null` otherwise. Never throws, since the pantry is
 * written already: a failure is logged as `pantry_unavailable`, with its
 * code only, and the confirmation reads as in 1.0.
 */
async function siteNameOrNull(siteId: string | null): Promise<string | null> {
  try {
    const sites = await listPantrySites();
    const site = sites.find((each) => (siteId === null ? each.isSelected : each.id === siteId));
    return site ? shownSiteName({ name: site.name, siteCount: sites.length }) : null;
  } catch (error) {
    console.error("pantry_unavailable", { reason: error instanceof PantryDataError ? error.detail : "unexpected" });
    return null;
  }
}

/**
 * `pantry_site_gone`, with the place selected now in `fields.site` when the
 * user has more than one place, for the list's notice (siteGoneText). Never
 * throws: without the name, the notice reads without it.
 */
async function siteGone() {
  const name = await siteNameOrNull(null);
  return fail("pantry_site_gone", name === null ? undefined : { site: name });
}
