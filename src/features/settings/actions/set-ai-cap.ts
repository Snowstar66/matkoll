"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { SettingsDataError } from "../data/client";
import { saveAiCapIn } from "../data/ai-cap";
import { aiCapBounds } from "../domain/ai-cap";

/**
 * "Spara" on Inställningar → AI-kostnad: the daily cap in kronor for the households that are not exempt
 * (0 to 1000; 0 turns the AI off for them). Only the app's owner may (the database decides). Fails with
 * `unauthorized`, `validation` (not a number in range) or `ai_cap_not_owner`, `ai_cap_save_failed`.
 */
export async function setAiCap(input: { capSek: number }): Promise<Result<number>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const capSek = typeof input?.capSek === "number" ? Math.round(input.capSek * 100) / 100 : Number.NaN;
  if (!Number.isFinite(capSek) || capSek < aiCapBounds.min || capSek > aiCapBounds.max) {
    return fail("validation", { cap: "Skriv ett belopp mellan 0 och 1 000 kr." });
  }
  try {
    if (!(await saveAiCapIn(await createClient(), capSek))) return fail("ai_cap_not_owner");
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("ai_cap_save_failed", { reason: error.detail });
    return fail("ai_cap_save_failed");
  }
  revalidateFor("ai_cap");
  return ok(capSek);
}
