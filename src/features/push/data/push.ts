import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { defaultPushPreferences, type PushPreferences, type PushSubscriptionInput } from "../domain/push";

// The tables push_subscription and push_preference and the function
// save_push_subscription (Story 23.3, supabase/migrations/…_push_notifications.sql).
// Every call runs with the signed-in member's session; errors carry a fixed
// reason and the database's code, never an endpoint, a key or a note. The
// queue and the sending are in src/lib/push-send.ts.

export type PushDb = SupabaseClient<Database>;

export class PushDataError extends Error {
  constructor(readonly detail: string) {
    super(`push_data: ${detail}`);
    this.name = "PushDataError";
  }
}

/** The caller's choices, or the defaults when they have made none. */
export async function loadPreferencesIn(db: PushDb): Promise<PushPreferences> {
  const { data, error } = await db.from("push_preference").select("lista, forrad, matsedel, lappar, atsnart").maybeSingle();
  if (error) throw new PushDataError(`load_preferences_failed ${error.code}`);
  return data ?? defaultPushPreferences;
}

export async function savePreferencesIn(db: PushDb, preferences: PushPreferences): Promise<void> {
  const { error } = await db
    .from("push_preference")
    .upsert(preferences, { onConflict: "user_id" });
  if (error) throw new PushDataError(`save_preferences_failed ${error.code}`);
}

/** Saves this device for the caller; an endpoint another account had on the device moves to the caller. */
export async function saveSubscriptionIn(db: PushDb, device: PushSubscriptionInput): Promise<void> {
  const { error } = await db.rpc("save_push_subscription", {
    device_endpoint: device.endpoint,
    device_p256dh: device.p256dh,
    device_auth: device.auth,
  });
  if (error) throw new PushDataError(`save_subscription_failed ${error.code}`);
}

/** Removes the caller's own device. Nothing happens for an endpoint that is not theirs. */
export async function removeSubscriptionIn(db: PushDb, endpoint: string): Promise<void> {
  const { error } = await db.from("push_subscription").delete().eq("endpoint", endpoint);
  if (error) throw new PushDataError(`remove_subscription_failed ${error.code}`);
}
