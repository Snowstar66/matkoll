"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { countWithImageIn, countWithoutImageIn, recipesWithoutImageIn } from "../data/image";
import { sweepRecipeImages, storeRecipeImage } from "./store-recipe-image";

const skipSchema = z.array(z.uuid()).max(1000);

/** How many recipes one call takes: each fetch has at most 8 s, so a call is well inside a function's time. */
const backfillBatchSize = 3;
/** No new recipe is started after this long into a call. */
const budgetMs = 25_000;

/** What one step of "Spara receptbilder hos oss" did, and how far the household is. */
export type BackfillStep = {
  /** Recipes tried in this step. */
  attempted: number;
  /** Of those, how many now have their own copy. */
  stored: number;
  /** The ones whose picture could not be fetched or kept (they keep their image address); the next step skips them. */
  failedIds: string[];
  /** The household's files are at the cap: nothing more can be stored until some recipes are removed. */
  capReached: boolean;
  /** Recipes that still have only an image address, the failed ones included. */
  missing: number;
  /** Recipes that have their own copy. */
  withCopy: number;
};

/**
 * "Spara receptbilder hos oss" (Inställningar): one step of the backfill. Takes
 * at most backfillBatchSize of the household's recipes that have an image
 * address and no copy of their own yet (not those in `skip`, which the page
 * has already seen fail) and keeps their pictures (storeRecipeImage). The page
 * calls it again until `missing` minus its failed ones is 0, the cap is
 * reached or Pontus presses "Avbryt"; it never runs by itself. Safe to run any
 * number of times: a recipe that has its copy is never touched, and no recipe
 * text is read or changed. Also removes the household's files that no recipe
 * points at. Fails with `unauthorized`, `validation` or `recipe_images_failed`.
 */
export async function backfillRecipeImages(skip: string[]): Promise<Result<BackfillStep>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = skipSchema.safeParse(skip);
  if (!parsed.success) return fail("validation");

  try {
    const db = await createClient();
    await sweepRecipeImages(db);
    const ids = await recipesWithoutImageIn(db, parsed.data, backfillBatchSize);
    const startedAt = Date.now();
    const step: BackfillStep = { attempted: 0, stored: 0, failedIds: [], capReached: false, missing: 0, withCopy: 0 };
    for (const id of ids) {
      if (Date.now() - startedAt > budgetMs) break;
      step.attempted += 1;
      const outcome = await storeRecipeImage(db, id);
      if (outcome === "stored" || outcome === "skipped") step.stored += 1;
      else step.failedIds.push(id);
      if (outcome === "cap") {
        step.capReached = true;
        break;
      }
    }
    [step.missing, step.withCopy] = await Promise.all([countWithoutImageIn(db), countWithImageIn(db)]);
    if (step.stored > 0) revalidateFor("recipe");
    return ok(step);
  } catch (error) {
    if (!(error instanceof RecipeDataError)) throw error;
    console.error("recipe_images_failed", { reason: error.detail });
    return fail("recipe_images_failed");
  }
}
