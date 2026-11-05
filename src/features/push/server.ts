import "server-only";
import { createClient } from "@/lib/supabase/server";
import { pushConfig } from "@/lib/push-send";
import { loadPreferencesIn } from "./data/push";
import { defaultPushPreferences, type PushPreferences } from "./domain/push";

// Server-only entry (AD-1): Push-notiser (Story 23.3). The sending, and how a
// burst of changes is collected into one notification, is in src/lib/push-send.ts.

export { PushDataError } from "./data/push";

/** What Inställningar → Notiser needs: the public key (null: not set up yet) and the caller's choices. Throws PushDataError. */
export async function getPushSettings(): Promise<{ publicKey: string | null; preferences: PushPreferences }> {
  const publicKey = pushConfig()?.publicKey ?? null;
  if (!publicKey) return { publicKey, preferences: defaultPushPreferences };
  return { publicKey, preferences: await loadPreferencesIn(await createClient()) };
}
