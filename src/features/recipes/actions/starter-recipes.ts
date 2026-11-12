"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { CatalogDataError, commitIngredients, matchIngredients } from "@/features/catalog/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import {
  addToPackIn,
  deleteUntouchedStarterIn,
  getStarterIn,
  movePackItemIn,
  removeFromPackIn,
  saveStarterIn,
  setPackNoteIn,
  starterImageFolderIn,
  type PackChange,
} from "../data/starter";
import { sharedChoices, sharedMatchItems } from "../domain/shared-recipe";
import { cleanNote, starterImageSrc, type StarterRecipe } from "../domain/starter-recipe";
import { copyStarterImage, removeRecipeImages } from "./store-recipe-image";

// Kom igång med recept (20261112120000_starter_recipes.sql). The picker copies one pack recipe per
// call, so it can show its progress and stop after the one under way (Avbryt); the owner's actions
// change the pack. Nothing here rewrites a recipe's text: a copy has the owner's recipe's texts as
// they are. Every call uses the signed-in user's session client (no admin client).

const idSchema = z.guid();
const idsSchema = z.array(z.guid()).min(1).max(100);

function logged(error: unknown, code: "recipe_starter_failed" | "recipe_starter_remove_failed" | "starter_pack_failed" | "recipe_starter_unavailable") {
  if (error instanceof CatalogDataError) {
    console.error(code, { reason: `catalog_${error.code}` });
    return fail(code);
  }
  if (error instanceof RecipeDataError) {
    console.error(code, { reason: error.detail });
    return fail(code);
  }
  throw error;
}

/**
 * Adds the pack recipe `itemId` to the household: copies the recipe, its steps and lines (each
 * line's ingredient matched by NAME against the household's own catalog, new ones made, as when a
 * shared recipe is saved; no AI) and then its picture into the household's own folder. A recipe the
 * household has already gives its copy back (`added: false`), so a pack recipe is never added
 * twice. When the lines changed since they were read, they are read once more. Fails with
 * `unauthorized`, `validation`, `recipe_starter_gone` (not in the pack any more),
 * `recipe_starter_cap` (the household has the recipe cap) or `recipe_starter_failed`.
 */
export async function copyStarterRecipe(itemId: string): Promise<Result<{ id: string; added: boolean }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!idSchema.safeParse(itemId).success) return fail("validation");
  try {
    const db = await createClient();
    for (let attempt = 0; attempt < 2; attempt++) {
      const starter = await getStarterIn(db, itemId);
      if (!starter) return fail("recipe_starter_gone");
      if (starter.savedCopyId) return ok({ id: starter.savedCopyId, added: false });
      const matches = await matchIngredients(sharedMatchItems(starter.lines));
      const ingredientIds = await commitIngredients(sharedChoices(starter.lines, matches));
      const saved = await saveStarterIn(db, itemId, ingredientIds, starter.version);
      if (saved === "gone") return fail("recipe_starter_gone");
      if (saved === "cap") return fail("recipe_starter_cap");
      if (saved === "changed") continue;
      // The picture never fails the copy (never throws); a folder that cannot be read is fetched from the address.
      const folder = await starterImageFolderIn(db, itemId).catch(() => null);
      await copyStarterImage(db, saved.id, folder);
      return ok({ id: saved.id, added: true });
    }
    return fail("recipe_starter_failed");
  } catch (error) {
    return logged(error, "recipe_starter_failed");
  }
}

/** After the picker is done (or stopped): Recept, Matsedel and Inköpslista show the new recipes. */
export async function refreshAfterStarterCopies(): Promise<void> {
  const user = await requireUser();
  if (!user.ok) return;
  revalidateFor("recipe");
}

/** What the picker's preview shows of one pack recipe: the texts exactly as they are written. */
export type StarterPreview = {
  title: string;
  servings: number;
  totalMinutes: number | null;
  imageSrc: string | null;
  note: string | null;
  sourceUrl: string | null;
  lines: { text: string; group: string | null }[];
  steps: { title: string | null; text: string }[];
};

function toPreview(itemId: string, recipe: StarterRecipe): StarterPreview {
  return {
    title: recipe.title,
    servings: recipe.servings,
    totalMinutes: recipe.totalMinutes,
    imageSrc: starterImageSrc({ itemId, hasImage: recipe.hasImage, imageUrl: recipe.imageUrl }, "full"),
    note: recipe.note,
    sourceUrl: recipe.sourceUrl,
    lines: recipe.lines.map((line) => ({ text: line.originalText, group: line.group })),
    steps: recipe.steps,
  };
}

/** One pack recipe for the preview (Steg 3), read when it is opened; nothing is copied. */
export async function readStarterPreview(itemId: string): Promise<Result<StarterPreview>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!idSchema.safeParse(itemId).success) return fail("validation");
  try {
    const recipe = await getStarterIn(await createClient(), itemId);
    return recipe ? ok(toPreview(itemId, recipe)) : fail("recipe_starter_gone");
  } catch (error) {
    return logged(error, "recipe_starter_unavailable");
  }
}

/**
 * "Ta bort startrecepten", and the bin on Klart (`ids`): deletes the household's starter copies that
 * are untouched (their content as copied, no favourite, not shared, on no meal plan), with their
 * pictures. Recipes the household changed or saved itself are never touched. Gives how many and
 * which were removed. Fails with `unauthorized`, `validation` or `recipe_starter_remove_failed`.
 */
export async function removeStarterCopies(ids?: readonly string[]): Promise<Result<{ removed: string[] }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (ids !== undefined && !idsSchema.safeParse(ids).success) return fail("validation");
  try {
    const db = await createClient();
    const deleted = await deleteUntouchedStarterIn(db, ids ?? null);
    // SQL never deletes files: the pictures go with the Storage API (never throws; the orphan sweep takes what stays).
    for (const row of deleted) await removeRecipeImages(db, row.folder);
    if (deleted.length > 0) revalidateFor("recipe");
    return ok({ removed: deleted.map((row) => row.id) });
  } catch (error) {
    return logged(error, "recipe_starter_remove_failed");
  }
}

function packResult(change: PackChange): Result<null> {
  if (change === "done") {
    revalidateFor("starter_pack_item");
    return ok();
  }
  if (change === "not_owner") return fail("starter_pack_not_owner");
  if (change === "copy") return fail("starter_pack_copy");
  if (change === "full") return fail("starter_pack_full");
  return fail("starter_pack_failed");
}

/** "Lägg i startpaketet" on one of the owner's own recipes. Owner only (is_app_owner() decides). */
export async function addToStarterPack(recipeId: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!idSchema.safeParse(recipeId).success) return fail("validation");
  try {
    return packResult(await addToPackIn(await createClient(), recipeId));
  } catch (error) {
    return logged(error, "starter_pack_failed");
  }
}

/** "Ta bort ur startpaketet". Copies households made stay theirs. Owner only. */
export async function removeFromStarterPack(itemId: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!idSchema.safeParse(itemId).success) return fail("validation");
  try {
    return packResult(await removeFromPackIn(await createClient(), itemId));
  } catch (error) {
    return logged(error, "starter_pack_failed");
  }
}

/** The item's short note under its title in the picker; empty removes it. Owner only. */
export async function setStarterNote(itemId: string, note: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const cleaned = typeof note === "string" ? cleanNote(note) : undefined;
  if (!idSchema.safeParse(itemId).success || cleaned === undefined) return fail("validation");
  try {
    return packResult(await setPackNoteIn(await createClient(), itemId, cleaned));
  } catch (error) {
    return logged(error, "starter_pack_failed");
  }
}

/** One place up (-1) or down (+1) in the pack. Owner only. */
export async function moveStarterItem(itemId: string, step: -1 | 1): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!idSchema.safeParse(itemId).success || (step !== -1 && step !== 1)) return fail("validation");
  try {
    return packResult(await movePackItemIn(await createClient(), itemId, step));
  } catch (error) {
    return logged(error, "starter_pack_failed");
  }
}
