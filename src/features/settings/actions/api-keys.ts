"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { hashApiKey, newApiKey } from "@/lib/api-key";
import { fail, ok, type Result } from "@/lib/errors";
import { revalidateFor } from "@/lib/revalidate";
import { createClient } from "@/lib/supabase/server";
import { SettingsDataError } from "../data/client";
import { insertApiKeyIn, revokeApiKeyIn } from "../data/api-keys";
import { defaultKeyLabel } from "../domain/api-key";

/**
 * "Skapa nyckel" under Siri och genvägar (Story 17.9): makes a personal key, stores only its sha256 and
 * returns the key itself this once for the page to show; it is not logged and cannot be read again.
 * Fails with `unauthorized`, `settings_key_limit` (five working keys) or `settings_save_failed`.
 */
export async function createApiKey(): Promise<Result<{ key: string }>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const key = newApiKey();
  try {
    const outcome = await insertApiKeyIn(await createClient(), hashApiKey(key), defaultKeyLabel);
    if (outcome === "limit") return fail("settings_key_limit");
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_save_failed", { reason: error.detail });
    return fail("settings_save_failed");
  }
  revalidateFor("api_key");
  return ok({ key });
}

/** "Återkalla": the key stops working at once. Fails with `unauthorized`, `validation` or `settings_save_failed`. */
export async function revokeApiKey(id: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return fail("validation");
  try {
    await revokeApiKeyIn(await createClient(), parsed.data);
  } catch (error) {
    if (!(error instanceof SettingsDataError)) throw error;
    console.error("settings_save_failed", { reason: error.detail });
    return fail("settings_save_failed");
  }
  revalidateFor("api_key");
  return ok(null);
}
