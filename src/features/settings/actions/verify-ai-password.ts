"use server";

import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { env } from "@/server/env";
import { aiPasswordMatches } from "../data/ai-password";
import { aiSettingsVisible } from "../domain/ai-choice";

/** Checks the password that unlocks the AI choice in Inställningar. Fails with `unauthorized` or `validation` (wrong password, or the section is not shown to this user). */
export async function verifyAiPassword(password: string): Promise<Result<true>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!aiSettingsVisible({ nodeEnv: env.NODE_ENV, email: user.data.email, allowed: env.AI_SETTINGS_EMAILS })) {
    return fail("validation");
  }
  if (!aiPasswordMatches(password, env.AI_SETTINGS_PASSWORD)) return fail("validation");
  return ok(true);
}
