import "server-only";
import { FeedbackDataError, type FeedbackDb } from "./client";
import type { FeedbackItem, FeedbackKind, ValidFeedback } from "../domain/feedback";

// The table feedback (Story 20.3). Every call runs with the signed-in user's
// session: RLS lets anyone add their own rows, and only the owner
// (is_app_owner(), the table app_owner) read them and change read_at.

/** At most this many messages are shown in the inbox, newest first. */
export const inboxLimit = 500;

/**
 * Adds a message as the signed-in user. Without `.select()`, so the insert needs no
 * right to read the row back (only the owner has it). `limited` when the user has
 * sent too many in the last hour or day (MK429).
 */
export async function insertFeedbackIn(db: FeedbackDb, input: ValidFeedback, appVersion: string): Promise<"sent" | "limited"> {
  const { error } = await db.from("feedback").insert({
    kind: input.kind,
    stars: input.kind === "rating" ? input.stars : null,
    body: input.body,
    area: input.kind === "rating" ? null : input.area,
    page: input.page,
    app_version: appVersion,
  });
  if (error?.code === "MK429") return "limited";
  if (error) throw new FeedbackDataError(`insert_feedback_failed ${error.code}`);
  return "sent";
}

/** Whether the signed-in user is the app's owner (is_app_owner(), Story 20.3). */
export async function isAppOwnerIn(db: FeedbackDb): Promise<boolean> {
  const { data, error } = await db.rpc("is_app_owner");
  if (error) throw new FeedbackDataError(`is_app_owner_failed ${error.code}`);
  return data === true;
}

/** The number of unread messages; 0 for anyone but the owner (RLS shows them no rows). */
export async function countUnreadFeedbackIn(db: FeedbackDb): Promise<number> {
  const { count, error } = await db.from("feedback").select("id", { count: "exact", head: true }).is("read_at", null);
  if (error) throw new FeedbackDataError(`count_feedback_failed ${error.code}`);
  return count ?? 0;
}

const columns = "id, user_id, sender_email, kind, stars, body, area, page, app_version, created_at, read_at";

/** The newest messages for the owner's inbox; nothing for anyone else. */
export async function listFeedbackIn(db: FeedbackDb): Promise<FeedbackItem[]> {
  const { data, error } = await db.from("feedback").select(columns).order("created_at", { ascending: false }).limit(inboxLimit);
  if (error) throw new FeedbackDataError(`list_feedback_failed ${error.code}`);
  return data.map((row) => ({
    id: row.id,
    userId: row.user_id,
    senderEmail: row.sender_email,
    kind: row.kind as FeedbackKind,
    stars: row.stars,
    body: row.body,
    area: row.area,
    page: row.page,
    appVersion: row.app_version,
    createdAt: row.created_at,
    readAt: row.read_at,
  }));
}

/** Marks a message read; one already read, or a call from anyone but the owner, changes nothing. */
export async function markFeedbackReadIn(db: FeedbackDb, id: string): Promise<void> {
  const { error } = await db.from("feedback").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null);
  if (error) throw new FeedbackDataError(`mark_feedback_read_failed ${error.code}`);
}
