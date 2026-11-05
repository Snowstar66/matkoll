"use server";

import { z } from "zod";
import { requireUser } from "@/features/auth/server";
import { fail, ok, type Result } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { pushConfig } from "@/lib/push-send";
import { PushDataError, removeSubscriptionIn, savePreferencesIn, saveSubscriptionIn } from "../data/push";
import { isPushEndpoint, type PushPreferences, pushPreferencesSchema, type PushSubscriptionInput, pushSubscriptionSchema } from "../domain/push";

// Inställningar → Notiser (Story 23.3). Nothing is revalidated: the page keeps
// the choices it shows, and the queue is read by the sender only.

/** Saves what the caller wants to be told about. Fails with `unauthorized`, `validation` or `push_save_failed`. */
export async function savePushPreferences(input: PushPreferences): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = pushPreferencesSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  try {
    await savePreferencesIn(await createClient(), parsed.data);
    return ok();
  } catch (error) {
    if (!(error instanceof PushDataError)) throw error;
    console.error("push_save_failed", { reason: error.detail });
    return fail("push_save_failed");
  }
}

/**
 * Turns notifications on for this device: saves the subscription the browser
 * made. Fails with `unauthorized`, `validation`, `push_not_configured` (no VAPID
 * keys) or `push_save_failed`.
 */
export async function subscribePush(input: PushSubscriptionInput): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  const parsed = pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return fail("validation");
  if (!pushConfig()) return fail("push_not_configured");
  try {
    await saveSubscriptionIn(await createClient(), parsed.data);
    return ok();
  } catch (error) {
    if (!(error instanceof PushDataError)) throw error;
    console.error("push_save_failed", { reason: error.detail });
    return fail("push_save_failed");
  }
}

const endpointSchema = z.string().max(1000).refine(isPushEndpoint);

/** Turns notifications off for this device. Fails with `unauthorized`, `validation` or `push_save_failed`. */
export async function unsubscribePush(endpoint: string): Promise<Result<null>> {
  const user = await requireUser();
  if (!user.ok) return user;
  if (!endpointSchema.safeParse(endpoint).success) return fail("validation");
  try {
    await removeSubscriptionIn(await createClient(), endpoint);
    return ok();
  } catch (error) {
    if (!(error instanceof PushDataError)) throw error;
    console.error("push_save_failed", { reason: error.detail });
    return fail("push_save_failed");
  }
}
