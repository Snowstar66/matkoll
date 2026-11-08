"use server";

import { requireUser } from "@/features/auth/server";
import { renameHousehold } from "@/features/household/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { RecipeDataError } from "../data/client";
import { setShareAllIn, setSharedIn, stopSharingIn } from "../data/shared";
import { shareChangeSchema, type ShareChange } from "../domain/shared-recipe";

function failed(error: unknown): Result<never> {
  if (!(error instanceof RecipeDataError)) throw error;
  console.error("recipe_share_failed", { reason: error.detail });
  return fail("recipe_share_failed");
}

/**
 * "Dela med andra" / "Sluta dela" in the recipe's menu (⋯): shares the household's recipe with the
 * other households, or stops at once (copies they saved stay theirs). It sets the value rather than
 * flipping it. A recipe that is not the household's changes nothing (RLS) and fails. With
 * `householdName` (the answer to "Vad ska andra se att ni heter?") the household is renamed first,
 * through the same rename as Medlemmar, and nothing is shared when that fails (its message and
 * field are passed on). Fails with `unauthorized`, `validation` or `recipe_share_failed`.
 */
export async function setRecipeShared(change: ShareChange, householdName?: string): Promise<Result<ShareChange>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = shareChangeSchema.safeParse(change);
  if (!parsed.success) return fail("validation");
  if (householdName !== undefined) {
    const renamed = await renameHousehold({ name: householdName });
    if (!renamed.ok) return renamed;
  }
  try {
    const found = await setSharedIn(await createClient(), parsed.data.id, parsed.data.shared);
    if (!found) {
      console.error("recipe_share_failed", { reason: "not_found" });
      return fail("recipe_share_failed");
    }
    revalidateFor("recipe");
    return ok(parsed.data);
  } catch (error) {
    return failed(error);
  }
}

/**
 * Tillval "Dela alla mina recept" (the household's): on shares every own recipe now and new ones as
 * they are saved; off only stops sharing new ones. Returns how many recipes are shared after.
 * `householdName` renames the household first, as for setRecipeShared. Fails with `unauthorized`,
 * `validation` or `recipe_share_failed`.
 */
export async function setShareAllRecipes(share: boolean, householdName?: string): Promise<Result<{ sharedCount: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (typeof share !== "boolean") return fail("validation");
  if (householdName !== undefined) {
    const renamed = await renameHousehold({ name: householdName });
    if (!renamed.ok) return renamed;
  }
  try {
    const sharedCount = await setShareAllIn(await createClient(), share);
    revalidateFor("recipe");
    revalidateFor("household");
    return ok({ sharedCount });
  } catch (error) {
    return failed(error);
  }
}

/**
 * Tillval "Sluta dela alla": no recipe of the household is shared any more, and "Dela alla mina
 * recept" is off. Returns how many stopped. Fails with `unauthorized` or `recipe_share_failed`.
 */
export async function stopSharingAllRecipes(): Promise<Result<{ stopped: number }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  try {
    const stopped = await stopSharingIn(await createClient());
    revalidateFor("recipe");
    revalidateFor("household");
    return ok({ stopped });
  } catch (error) {
    return failed(error);
  }
}
