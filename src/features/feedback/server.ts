import "server-only";
import { accountOf } from "@/features/auth";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/server/env";
import { countUnreadFeedbackIn, isAppOwnerIn, listFeedbackIn } from "./data/feedback";
import type { FeedbackItem } from "./domain/feedback";

// Server-only entry of Tyck till (Story 20.3).

/**
 * The owner's first name for the sheets ("Pontus"), from OWNER_EMAIL; in development
 * without it, the auto-login user's, as `pnpm owner:sync` does. Null when neither is
 * set. Display only: access is decided by is_app_owner() in the database.
 */
export function getOwnerName(): string | null {
  const email = env.OWNER_EMAIL ?? (env.NODE_ENV === "development" ? env.DEV_AUTO_LOGIN_EMAIL : undefined);
  return email ? accountOf(email).name : null;
}

/**
 * The owner's inbox row in Inställningar: the number of unread messages, or null
 * for everyone but the owner (decided by is_app_owner() in the database).
 * Throws FeedbackDataError.
 */
export async function getOwnerInbox(): Promise<{ unread: number } | null> {
  const db = await createClient();
  if (!(await isAppOwnerIn(db))) return null;
  return { unread: await countUnreadFeedbackIn(db) };
}

/** Every message for the owner's inbox, newest first, or null for anyone else. Throws FeedbackDataError. */
export async function listInbox(): Promise<FeedbackItem[] | null> {
  const db = await createClient();
  if (!(await isAppOwnerIn(db))) return null;
  return listFeedbackIn(db);
}

export { FeedbackDataError } from "./data/client";
